import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RefreshCw, Sparkles, Trash2, WifiOff, CheckCircle2, Info, Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { APP_VERSION, RELEASE_DATE, CHANGELOG } from "@/lib/app-version";
import { useAppUpdate } from "@/lib/use-app-update";
import { UpdateProgressDialog } from "@/components/UpdateProgressDialog";
import logoAsset from "@/assets/idaroom-logo.png.asset.json";
import { InstitutionSettings } from "@/components/InstitutionSettings";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "الإعدادات — إداروم" },
      {
        name: "description",
        content: "بيانات المؤسسة ومعلومات الإصدار وسجل التغييرات وإدارة التخزين المؤقت لإداروم.",
      },
      { property: "og:title", content: "الإعدادات — إداروم" },
      {
        property: "og:description",
        content: "بيانات المؤسسة ومعلومات الإصدار وسجل التغييرات وإدارة التخزين المؤقت لإداروم.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [clearing, setClearing] = useState(false);
  const { remote, hasUpdate, checking, applying, progress, check, apply } = useAppUpdate();

  async function checkForUpdates() {
    const r = await check();
    if (!r) {
      toast.error("تعذّر التحقق من التحديثات", {
        description: "تأكّد من اتصالك بالإنترنت وحاول مجدداً.",
      });
      return;
    }
    if (hasUpdate || (r && r.version !== APP_VERSION)) {
      toast.message(`يتوفّر تحديث جديد (v${r.version})`, {
        description: "اضغط زر «تحديث الآن» لتطبيقه فوراً.",
      });
    } else {
      toast.success(`أنت تستخدم أحدث إصدار (v${APP_VERSION})`, {
        description: `آخر تحديث: ${RELEASE_DATE}`,
      });
    }
  }

  async function updateNow() {
    await apply();
  }

  async function clearCache() {
    setClearing(true);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.active?.postMessage("IDAROOM_CLEAR_CACHE");
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      toast.success("تم مسح التخزين المؤقت");
    } catch {
      toast.error("تعذّر مسح التخزين المؤقت");
    } finally {
      setClearing(false);
    }
  }

  const online = typeof navigator !== "undefined" ? navigator.onLine : true;

  return (
    <div className="space-y-6">
      <UpdateProgressDialog open={applying} progress={progress} remote={remote} />
      <PageHeader title="الإعدادات" description="معلومات التطبيق وإدارة التخزين المؤقت." />
      <InstitutionSettings />

      {/* Version card */}
      <Card>
        <CardHeader className="flex flex-row items-start gap-4">
          <img
            src={logoAsset.url}
            alt="IDAROOM"
            className="h-14 w-14 rounded-xl border border-border bg-background object-contain p-1"
          />
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              إداروم
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />v{APP_VERSION}
              </Badge>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">صدر في {RELEASE_DATE}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasUpdate && remote && (
            <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  يتوفّر تحديث جديد: v{remote.version}
                </div>
                {remote.releaseDate && (
                  <div className="text-xs text-muted-foreground">صدر في {remote.releaseDate}</div>
                )}
              </div>
              <Button onClick={updateNow} disabled={applying} size="sm">
                <Download className={`ml-2 h-4 w-4 ${applying ? "animate-pulse" : ""}`} />
                {applying ? "جارٍ التحديث..." : "تحديث الآن"}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={checkForUpdates} disabled={checking}>
              <RefreshCw className={`ml-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "جارٍ التحقق..." : "التحقق من آخر إصدار"}
            </Button>
            <Button variant="outline" onClick={clearCache} disabled={clearing}>
              <Trash2 className="ml-2 h-4 w-4" />
              {clearing ? "..." : "مسح التخزين المؤقت"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Connectivity card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {online ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-amber-600" />
            )}
            حالة الاتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {online
            ? "متصل بالإنترنت — يتم حفظ الصفحات التي تزورها تلقائياً لتشغيلها لاحقاً بدون اتصال."
            : "غير متصل حالياً — ستُعرض آخر صفحة تم تحميلها من الذاكرة المؤقتة مع تنبيه."}
        </CardContent>
      </Card>

      {/* Changelog */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" />
            سجل التغييرات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="border-l-2 border-primary/30 pl-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge>{`v${entry.version}`}</Badge>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {entry.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
