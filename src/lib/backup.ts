export const BACKUP_TABLES = [
  "institution_settings", "classes", "students", "staff_whitelist", "profiles", "schedule_slots", "class_teachers",
  "attendance_sessions", "attendance_records", "absence_justifications", "entry_permits", "legal_notices",
  "teacher_absences", "free_period_decisions", "homework", "school_events", "behavior_records", "parent_student",
] as const;

export const BACKUP_INTERVAL_MS = 30 * 60 * 60 * 1000; // every 30 hours

export function isBackupDue(lastIso: string | null, now = Date.now()) {
  if (!lastIso) return true;
  const t = Date.parse(lastIso);
  return Number.isNaN(t) || now - t >= BACKUP_INTERVAL_MS;
}

// CSV with BOM so Excel/LibreOffice open Arabic text correctly.
export function toCsv(rows: Record<string, unknown>[]) {
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

type DesktopApi = {
  isDesktop: true;
  info: () => Promise<{ version: string; backupDir: string; lastBackup: string | null }>;
  saveBackup: (p: { files: Record<string, string> }) => Promise<{ dir: string; count: number }>;
  openBackups: () => Promise<string>;
  print: () => Promise<{ ok: boolean }>;
  openWindow: (path: string) => Promise<boolean>;
};

export function desktopApi(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { idaroomDesktop?: DesktopApi }).idaroomDesktop ?? null;
}
