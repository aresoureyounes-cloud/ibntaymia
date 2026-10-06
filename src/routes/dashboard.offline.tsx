import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trash2, WifiOff, FileText, Download, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiPageFinder } from "@/components/AiPageFinder";

export const Route = createFileRoute("/dashboard/offline")({
  head: () => ({
    meta: [
      { title: "الصفحات المحفوظة للعمل دون اتصال — إداروم" },
      { name: "description", content: "عرض الصفحات المخزنة على الجهاز ووقت آخر تحديث وحذفها." },
      { property: "og:title", content: "الصفحات المحفوظة — إداروم" },
      { property: "og:description", content: "إدارة النسخ المخزنة على الجهاز للعمل دون اتصال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfflinePagesScreen,
});

const PAGES_CACHE = "idaroom-pages";

type Entry = { url: string; path: string; updated: Date | null; size: number | null };

function formatSize(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function OfflinePagesScreen() {
  const [supported, setSupported] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  const load = useCallback(async () => {
    if (!("caches" in window)) {
      setSupported(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cache = await caches.open(PAGES_CACHE);
      const reqs = await cache.keys();
      const list: Entry[] = [];
      for (const req of reqs) {
        const res = await cache.match(req);
        const date = res?.headers.get("date");
        const len = res?.headers.get("content-length");
        const u = new URL(req.url);
        list.push({
          url: req.url,
          path: decodeURIComponent(u.pathname + u.search),
          updated: date ? new Date(date) : null,
          size: len ? Number(len) : null,
        });
      }
      list.sort((a, b) => (b.updated?.getTime() ?? 0) - (a.updated?.getTime() ?? 0));
      setEntries(list);
      const names = await caches.keys();
      setOtherCount(names.filter((n) => n !== PAGES_CACHE).length);
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; current: string; failed: number } | null>(null);

  const fetchAndStore = async (url: string) => {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "text/html" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.blob();
    const headers = new Headers(res.headers);
    headers.set("date", new Date().toUTCString());
    headers.set("content-length", String(body.size));
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(url, new Response(body, { status: 200, headers }));
  };

  const refreshOne = async (url: string) => {
    if (!navigator.onLine) {
      toast.error("التحديث يحتاج اتصالاً بالإنترنت.");
      return;
    }
    setRefreshing(url);
    try {
      await fetchAndStore(url);
      toast.success("تم تحديث النسخة المحفوظة");
      void load();
    } catch {
      toast.error("تعذر تحديث الصفحة، بقيت النسخة القديمة.");
    } finally {
      setRefreshing(null);
    }
  };

  const refreshAll = async () => {
    if (!navigator.onLine) {
      toast.error("التحديث يحتاج اتصالاً بالإنترنت.");
      return;
    }
    if (!entries.length) return;
    setBulk({ done: 0, total: entries.length, current: entries[0]?.path ?? "", failed: 0 });
    let failed = 0;
    let done = 0;
    for (const e of entries) {
      setBulk((b) => (b ? { ...b, current: e.path } : b));
      try {
        await fetchAndStore(e.url);
      } catch {
        failed += 1;
      }
      done += 1;
      setBulk((b) => (b ? { ...b, done, failed } : b));
    }
    setBulk(null);
    void load();
    if (failed === 0) {
      toast.success(`تم تحديث ${entries.length} صفحة بنجاح`);
    } else if (failed === entries.length) {
      toast.error("تعذر تحديث جميع الصفحات، بقيت النسخ القديمة.");
    } else {
      toast.warning(`تم تحديث ${entries.length - failed} صفحة، وفشل تحديث ${failed}.`);
    }
  };

  const bulkRunning = bulk !== null;

  const removeOne = async (url: string) => {
    const cache = await caches.open(PAGES_CACHE);
    await cache.delete(url);
    toast.success("حُذفت النسخة المخزنة");
    void load();
  };

  const removePages = async () => {
    if (!confirm("حذف جميع الصفحات المحفوظة؟ لن تكون متاحة دون اتصال حتى تفتحها من جديد.")) return;
    await caches.delete(PAGES_CACHE);
    toast.success("حُذفت جميع الصفحات المحفوظة");
    void load();
  };

  const removeAll = async () => {
    if (!confirm("حذف كل النسخ المخزنة (الصفحات وملفات التطبيق)؟ سيُعاد تنزيلها عند الاتصال.")) return;
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
    toast.success("حُذفت جميع النسخ المخزنة");
    void load();
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <WifiOff className="h-6 w-6" /> الصفحات المحفوظة للعمل دون اتصال
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            كل صفحة تفتحها أثناء الاتصال تُحفظ على هذا الجهاز وتُعرض عند انقطاع الإنترنت. المحتوى
            المعروض دون اتصال هو آخر نسخة محفوظة.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> تحديث القائمة
        </Button>
      </div>

      {!supported ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            هذا المتصفح لا يدعم حفظ الصفحات للعمل دون اتصال.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">صفحات محفوظة</div>
                <div className="text-2xl font-bold">{entries.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">مساحة مستعملة</div>
                <div className="text-2xl font-bold">{usage ? formatSize(usage.used) : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">مجموعات ملفات التطبيق</div>
                <div className="text-2xl font-bold">{otherCount}</div>
              </CardContent>
            </Card>
          </div>

          <AiPageFinder entries={entries} />


          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">قائمة الصفحات</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshAll()}
                  disabled={!entries.length || bulkRunning}
                >
                  <Download className="h-4 w-4" /> تحديث الكل
                </Button>
                <Button variant="outline" size="sm" onClick={removePages} disabled={!entries.length || bulkRunning}>
                  <Trash2 className="h-4 w-4" /> حذف الصفحات
                </Button>
                <Button variant="destructive" size="sm" onClick={removeAll} disabled={bulkRunning}>
                  <Trash2 className="h-4 w-4" /> حذف كل النسخ
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {bulk && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      جارٍ تحديث الصفحات… {bulk.done} من {bulk.total}
                    </span>
                    {bulk.failed > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-4 w-4" /> فشل: {bulk.failed}
                      </span>
                    )}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.round((bulk.done / Math.max(bulk.total, 1)) * 100)}%` }}
                    />
                  </div>
                  <div dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
                    {bulk.current}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
              ) : entries.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  لا توجد صفحات محفوظة على هذا الجهاز. الحفظ يعمل في الموقع المنشور فقط، وتُحفظ
                  الصفحة عند فتحها أثناء الاتصال.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {entries.map((e) => (
                    <li key={e.url} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div dir="ltr" className="truncate text-start font-mono text-sm">
                            {e.path}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            آخر تحديث:{" "}
                            {e.updated
                              ? e.updated.toLocaleString("ar-DZ", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "غير معروف"}{" "}
                            · {formatSize(e.size)}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="تحديث النسخة"
                        title="تحديث النسخة من الموقع"
                        disabled={refreshing === e.url || bulkRunning}
                        onClick={() => void refreshOne(e.url)}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${refreshing === e.url ? "animate-spin" : ""}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="حذف"
                        onClick={() => void removeOne(e.url)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
