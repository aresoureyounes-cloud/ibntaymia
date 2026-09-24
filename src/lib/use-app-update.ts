import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";

export type RemoteVersion = {
  version: string;
  releaseDate?: string;
  notes?: string[];
};

export type UpdateStage =
  | "idle"
  | "checking"
  | "downloading"
  | "caching"
  | "applying"
  | "done"
  | "error";

export type UpdateProgress = {
  stage: UpdateStage;
  percent: number;
  message: string;
};

type PersistedUpdate = UpdateProgress & {
  targetVersion?: string;
  startedAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "idaroom:update-progress";
const RESUME_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — avoid resurrecting ancient state.

/** Compare semver-ish versions. Returns >0 if a>b, <0 if a<b, 0 if equal. */
function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPersisted(): PersistedUpdate | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedUpdate;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(p: PersistedUpdate) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}

function clearPersisted() {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  try {
    const res = await fetch("/version.json?_=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as RemoteVersion;
  } catch {
    return null;
  }
}

/** Order of steps in the update pipeline — used to resume from any stage. */
const STAGE_ORDER: UpdateStage[] = ["downloading", "caching", "applying", "done"];
function shouldRun(current: UpdateStage, step: UpdateStage): boolean {
  return STAGE_ORDER.indexOf(step) >= STAGE_ORDER.indexOf(current);
}

/**
 * Fully update the app in place with staged progress reporting.
 * Resumes from `startFrom` if provided, so a reload in the middle of an update
 * picks up where it left off instead of restarting from downloading.
 */
export async function applyAppUpdate(
  onProgress?: (p: UpdateProgress) => void,
  options?: { startFrom?: UpdateStage; targetVersion?: string },
): Promise<void> {
  const startFrom: UpdateStage = options?.startFrom ?? "downloading";
  const startedAt = Date.now();

  const report = (p: UpdateProgress) => {
    onProgress?.(p);
    writePersisted({
      ...p,
      targetVersion: options?.targetVersion,
      startedAt,
      updatedAt: Date.now(),
    });
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Stage weights: downloading 0-60%, caching 60-90%, applying 90-100%.
  const DL_MAX = 60;
  const CACHE_START = 60;
  const CACHE_MAX = 90;

  try {
    // 1) Downloading — stream the shell + discovered assets and report real bytes.
    if (shouldRun(startFrom, "downloading")) {
      report({ stage: "downloading", percent: 1, message: "جارٍ الاتصال بالخادم..." });

      // Fetch HTML shell with a stream reader so we can accumulate bytes.
      const htmlUrl = "/?_upd=" + Date.now();
      let htmlText = "";
      let downloadedBytes = 0;
      let totalBytes = 0;

      const formatKB = (n: number) => `${Math.round(n / 1024).toLocaleString()} KB`;
      const reportDownload = () => {
        const ratio = totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : 0;
        const percent = Math.max(1, Math.round(ratio * DL_MAX));
        const msg = totalBytes
          ? `تنزيل ${formatKB(downloadedBytes)} من ${formatKB(totalBytes)}`
          : `تنزيل ${formatKB(downloadedBytes)}`;
        report({ stage: "downloading", percent, message: msg });
      };

      const streamRead = async (url: string): Promise<string> => {
        const res = await fetch(url, { cache: "no-store" });
        const len = Number(res.headers.get("content-length") || 0);
        if (len > 0) {
          totalBytes += len;
          reportDownload();
        }
        if (!res.body || !res.body.getReader) {
          const buf = await res.arrayBuffer();
          downloadedBytes += buf.byteLength;
          if (!len) totalBytes = Math.max(totalBytes, downloadedBytes);
          reportDownload();
          return new TextDecoder().decode(buf);
        }
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            downloadedBytes += value.byteLength;
            if (!len) totalBytes = Math.max(totalBytes, downloadedBytes);
            reportDownload();
          }
        }
        const merged = new Uint8Array(downloadedBytes);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.byteLength;
        }
        return new TextDecoder().decode(merged);
      };

      try {
        htmlText = await streamRead(htmlUrl);
      } catch {
        /* ignore — reload will retry */
      }

      // Discover same-origin build assets referenced by the shell.
      const assetUrls = new Set<string>();
      const origin = window.location.origin;
      const attrRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(htmlText)) !== null) {
        const raw = m[1];
        if (!raw || raw.startsWith("data:") || raw.startsWith("#")) continue;
        try {
          const u = new URL(raw, origin);
          if (u.origin !== origin) continue;
          if (!/\.(js|mjs|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico|json)$/i.test(u.pathname)) continue;
          u.searchParams.set("_upd", String(Date.now()));
          assetUrls.add(u.toString());
        } catch {
          /* ignore malformed url */
        }
      }
      // Always include the version manifest.
      assetUrls.add("/version.json?_=" + Date.now());

      // Prefetch total sizes via HEAD (best effort), then stream each asset.
      await Promise.all(
        [...assetUrls].map(async (u) => {
          try {
            const head = await fetch(u, { method: "HEAD", cache: "no-store" });
            const len = Number(head.headers.get("content-length") || 0);
            if (len > 0) totalBytes += len;
          } catch {
            /* ignore */
          }
        }),
      );
      reportDownload();

      for (const u of assetUrls) {
        try {
          await streamRead(u);
        } catch {
          /* skip failed asset — the browser will refetch on reload */
        }
      }

      report({
        stage: "downloading",
        percent: DL_MAX,
        message: `تم تنزيل ${formatKB(downloadedBytes)}`,
      });
    }

    // 2) Caching — real progress based on # of caches + SW registrations processed.
    if (shouldRun(startFrom, "caching")) {
      const tasks: Array<() => Promise<void>> = [];

      let cacheKeys: string[] = [];
      if ("caches" in window) {
        try {
          cacheKeys = await caches.keys();
        } catch {
          cacheKeys = [];
        }
      }
      for (const key of cacheKeys) {
        tasks.push(async () => {
          try { await caches.delete(key); } catch { /* ignore */ }
        });
      }

      let swRegs: readonly ServiceWorkerRegistration[] = [];
      if ("serviceWorker" in navigator) {
        try {
          swRegs = await navigator.serviceWorker.getRegistrations();
        } catch {
          swRegs = [];
        }
      }
      for (const reg of swRegs) {
        tasks.push(async () => {
          try { await reg.unregister(); } catch { /* ignore */ }
        });
      }

      const total = Math.max(1, tasks.length);
      report({
        stage: "caching",
        percent: CACHE_START,
        message: `تنظيف التخزين المؤقت (${total} عنصر)...`,
      });

      let done = 0;
      for (const task of tasks) {
        await task();
        done += 1;
        const percent =
          CACHE_START + Math.round((done / total) * (CACHE_MAX - CACHE_START));
        report({
          stage: "caching",
          percent,
          message: `تم مسح ${done} / ${total}`,
        });
      }

      report({ stage: "caching", percent: CACHE_MAX, message: "تم تحديث التخزين المؤقت" });
    }


    // 3) Applying — hard reload with a cache-busting param.
    report({ stage: "applying", percent: 95, message: "جارٍ تطبيق التحديث..." });
    await sleep(400);
    report({ stage: "done", percent: 100, message: "اكتمل التحديث — إعادة تحميل..." });
    await sleep(300);

    const url = new URL(window.location.href);
    url.searchParams.set("_upd", Date.now().toString());
    window.location.replace(url.toString());
  } catch (e) {
    report({
      stage: "error",
      percent: 0,
      message: e instanceof Error ? e.message : "تعذّر تطبيق التحديث",
    });
    throw e;
  }
}

export function useAppUpdate(options?: { auto?: boolean }) {
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress>({
    stage: "idle",
    percent: 0,
    message: "",
  });
  const resumedRef = useRef(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetchRemoteVersion();
      setRemote(r);
      return r;
    } finally {
      setChecking(false);
    }
  }, []);

  const apply = useCallback(
    async (opts?: { startFrom?: UpdateStage; targetVersion?: string }) => {
      setApplying(true);
      const initialStage: UpdateStage = opts?.startFrom ?? "downloading";
      setProgress({
        stage: initialStage,
        percent: initialStage === "caching" ? 55 : initialStage === "applying" ? 95 : 5,
        message: "استئناف التحديث...",
      });
      try {
        await applyAppUpdate((p) => setProgress(p), {
          startFrom: opts?.startFrom,
          targetVersion: opts?.targetVersion ?? remote?.version,
        });
      } catch {
        setApplying(false);
      }
    },
    [remote?.version],
  );

  // Resume interrupted update on mount, or clear stale persisted state.
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    if (typeof window === "undefined") return;

    const persisted = readPersisted();
    if (!persisted) {
      if (options?.auto) void check();
      return;
    }

    const age = Date.now() - (persisted.updatedAt ?? 0);
    const alreadyOnNewVersion =
      persisted.targetVersion && cmpVersion(APP_VERSION, persisted.targetVersion) >= 0;

    // Update already completed (either the reload landed on the new version,
    // or the persisted state is "done"/"error") → clear and move on.
    if (
      persisted.stage === "done" ||
      persisted.stage === "error" ||
      alreadyOnNewVersion ||
      age > RESUME_MAX_AGE_MS
    ) {
      clearPersisted();
      if (options?.auto) void check();
      return;
    }

    // Resume: reopen the progress dialog and continue from the last stage.
    setProgress({
      stage: persisted.stage,
      percent: persisted.percent,
      message: "استئناف التحديث السابق...",
    });
    setApplying(true);
    void applyAppUpdate((p) => setProgress(p), {
      startFrom: persisted.stage,
      targetVersion: persisted.targetVersion,
    }).catch(() => setApplying(false));
  }, [options?.auto, check]);

  const hasUpdate = !!remote && cmpVersion(remote.version, APP_VERSION) > 0;

  return { remote, hasUpdate, checking, applying, progress, check, apply };
}
