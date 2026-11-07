import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HardDrive, FolderOpen, Printer, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportBackup } from "@/lib/backup.functions";
import { desktopApi, isBackupDue } from "@/lib/backup";
import { useAuth } from "@/lib/use-auth";

const LAST_KEY = "idaroom.lastBackupAt";

function useRunBackup() {
  const run = useServerFn(exportBackup);
  return async () => {
    const api = desktopApi();
    if (!api) throw new Error("متاح في برنامج الحاسوب فقط");
    const { files } = await run();
    const res = await api.saveBackup({ files });
    localStorage.setItem(LAST_KEY, new Date().toISOString());
    return res;
  };
}

/** Silent automatic backup every 30 hours, desktop app + admin/developer only. */
export function DesktopAutoBackup() {
  const { roles } = useAuth();
  const runBackup = useRunBackup();
  const allowed = roles.some((r) => r === "admin" || r === "developer");
  useEffect(() => {
    if (!allowed || !desktopApi()) return;
    const tick = () => {
      if (!isBackupDue(localStorage.getItem(LAST_KEY))) return;
      runBackup().then((r) => toast.success(`نسخة احتياطية محفوظة (${r.count} ملف)`)).catch(() => {});
    };
    const first = setTimeout(tick, 20000);
    const every = setInterval(tick, 60 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(every); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);
  return null;
}

export function DesktopKitPanel() {
  const [api, setApi] = useState<ReturnType<typeof desktopApi>>(null);
  const [info, setInfo] = useState<{ version: string; backupDir: string; lastBackup: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const runBackup = useRunBackup();
  useEffect(() => {
    const a = desktopApi();
    setApi(a);
    a?.info().then(setInfo).catch(() => {});
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="size-5" /> أدوات برنامج الحاسوب</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!api ? (
          <p className="text-muted-foreground">هذه الأدوات تعمل داخل برنامج الحاسوب فقط: نسخ احتياطي تلقائي كل 30 ساعة إلى الحاسوب (ملفات Excel/CSV)، طباعة مباشرة، وفتح عدة نوافذ.</p>
        ) : (
          <>
            <p className="text-muted-foreground">الإصدار {info?.version} — مجلد النسخ: <bdi dir="ltr">{info?.backupDir}</bdi></p>
            <p>آخر نسخة: {info?.lastBackup ?? "لا توجد بعد"}</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                try { const r = await runBackup(); toast.success(`حُفظت ${r.count} ملف`); setInfo(await api.info()); }
                catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
              }}><HardDrive className="size-4" /> نسخة احتياطية الآن</Button>
              <Button variant="outline" onClick={() => api.openBackups()}><FolderOpen className="size-4" /> فتح مجلد النسخ</Button>
              <Button variant="outline" onClick={() => api.print()}><Printer className="size-4" /> طباعة الصفحة</Button>
              <Button variant="outline" onClick={() => api.openWindow("/dashboard/attendance")}><AppWindow className="size-4" /> نافذة حضور جديدة</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
