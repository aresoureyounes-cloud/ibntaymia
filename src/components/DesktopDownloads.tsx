import { useState } from "react";
import { Download, Monitor, Apple, HardDrive, RefreshCw, Sparkles, CheckCircle2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { APP_VERSION, RELEASE_DATE, CHANGELOG } from "@/lib/app-version";
import debAsset from "../../public/downloads/IDAROOM-linux-amd64.deb.asset.json";
import linuxZipAsset from "../../public/downloads/IDAROOM-linux-x64.zip.asset.json";
import windowsAsset from "../../public/downloads/IDAROOM-windows-x64.zip.asset.json";
import macAsset from "../../public/downloads/IDAROOM-macos-x64.zip.asset.json";

function mb(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

type Build = {
  key: string;
  icon: typeof Monitor;
  title: string;
  hint: string;
  url: string;
  size: number;
  label: string;
  primary?: boolean;
  extra?: { label: string; url: string; size: number };
};

const BUILDS: Build[] = [
  {
    key: "windows",
    icon: Monitor,
    title: "Windows (x64)",
    hint: "فُك ضغط الملف ثم شغّل IDAROOM.exe — لا يحتاج تثبيت.",
    url: windowsAsset.url,
    size: windowsAsset.size,
    label: "تحميل لويندوز",
    primary: true,
  },
  {
    key: "linux",
    icon: HardDrive,
    title: "Linux (Debian / Ubuntu)",
    hint: "حزمة .deb — ثبّتها بالأمر: sudo dpkg -i IDAROOM-*.deb",
    url: debAsset.url,
    size: debAsset.size,
    label: "تحميل .deb",
    primary: true,
    extra: { label: "نسخة محمولة .zip", url: linuxZipAsset.url, size: linuxZipAsset.size },
  },
  {
    key: "macos",
    icon: Apple,
    title: "macOS (Intel / Rosetta)",
    hint: "فُك الضغط وانقل IDAROOM.app إلى مجلد Applications.",
    url: macAsset.url,
    size: macAsset.size,
    label: "تحميل لماك",
    primary: true,
  },
];

export function DesktopDownloads() {
  const [checking, setChecking] = useState(false);

  async function checkForUpdates() {
    setChecking(true);
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      const data = (await res.json()) as { version: string; releaseDate?: string };
      if (data.version && data.version !== APP_VERSION) {
        toast.success(`يتوفّر إصدار جديد: v${data.version}`, {
          description: "حمّل النسخة المناسبة لنظامك من الأسفل.",
        });
      } else {
        toast.success(`أنت تستخدم أحدث إصدار متاح (v${APP_VERSION})`, {
          description: `آخر تحديث: ${RELEASE_DATE}`,
        });
      }
    } catch {
      toast.error("تعذّر التحقق من التحديثات — تحقّق من الاتصال بالإنترنت.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section id="downloads" className="border-t border-border bg-secondary/30 py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-card/60 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-accent backdrop-blur sm:text-xs">
            <HardDrive className="h-3.5 w-3.5" />
            تطبيق مكتبي
          </div>
          <h2 className="font-display text-3xl font-black tracking-tight sm:text-5xl">
            حمّل تطبيق إداروم
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
            نفس المنصة، لكن كتطبيق مكتبي كامل يعمل أونلاين وأوفلاين على جهازك — متوفّر الآن
            لويندوز، لينكس، وماك. مناسب للحراس، الإدارة، والمعلمين في المؤسسات ذات الاتصال المحدود.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              الإصدار v{APP_VERSION}
            </Badge>
            <span className="text-xs text-muted-foreground">صدر في {RELEASE_DATE}</span>
            <Button size="sm" variant="outline" onClick={checkForUpdates} disabled={checking}>
              <RefreshCw className={`ml-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "جارٍ التحقق..." : "التحقق من آخر إصدار"}
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUILDS.map((b) => {
            const Icon = b.icon;
            return (
              <Card key={b.key} className="border-accent/30 bg-card">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold">{b.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{b.hint}</p>
                  <div className="mt-auto space-y-2 pt-4">
                    <Button asChild className="w-full">
                      <a href={b.url} download>
                        <Download className="ml-2 h-4 w-4" />
                        {b.label} · {mb(b.size)}
                      </a>
                    </Button>
                    {b.extra && (
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <a href={b.extra.url} download>
                          {b.extra.label} · {mb(b.extra.size)}
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mx-auto mt-6 max-w-5xl">
          <Card className="border-border bg-card/60">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h3 className="font-display text-base font-bold">أداة سطر الأوامر (Linux)</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    أداة حقيقية للترمينال تعمل بدون واجهة رسومية (Node.js 18+) — مناسبة للسكربتات، SSH، cron
                    وأنظمة المراقبة. تُثبَّت بأمر واحد:
                  </p>
                </div>
              </div>

              <pre
                dir="ltr"
                className="overflow-x-auto rounded-lg bg-[#0d1512] px-4 py-3 font-mono text-[12px] leading-6 text-emerald-100"
              >
{`curl -fsSL https://idarroom.lovable.app/cli/install.sh | sh
# أو لكل المستخدمين:
curl -fsSL https://idarroom.lovable.app/cli/install.sh | sudo sh`}
              </pre>

              <pre
                dir="ltr"
                className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-4 py-3 font-mono text-[12px] leading-6 text-foreground/90"
              >
{`idaroom status                 # حالة المنصّة والخدمات
idaroom health && echo OK      # رمز خروج 0 سليم / 1 خلل
idaroom status --json | jq .services
idaroom doctor --fix           # فحص وإصلاح البيئة والإعدادات
idaroom watch --every 30       # مراقبة مستمرة
idaroom open /dashboard/students
idaroom shell                  # وضع تفاعلي

# إدارة الحسابات التجريبية (صلاحية admin)
export IDAROOM_ADMIN_EMAIL=admin@demo.idarroom.dz
idaroom demo list
idaroom demo create teacher.chem --role teacher --name "أستاذ كيمياء"
idaroom demo password student9 --password 'NewPass@2026'
idaroom demo disable student9 && idaroom demo enable student9
idaroom demo link student9 --class "أولى ثانوي - علوم" --card 04A1B2C9

idaroom help                   # كل الأوامر والخيارات`}
              </pre>

              <p className="text-[11px] text-muted-foreground">
                حزمة .deb تثبّت نفس الأمر <span dir="ltr" className="font-mono">idaroom</span> مع التطبيق المكتبي
                وخدمات systemd وإكمال Bash تلقائياً.
              </p>
            </CardContent>
          </Card>
        </div>


        {/* Changelog */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="mb-4 text-center font-display text-xl font-bold sm:text-2xl">سجل التغييرات</h3>
          <div className="space-y-4">
            {CHANGELOG.map((entry) => (
              <Card key={entry.version} className="border-border bg-card">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge className="font-mono">v{entry.version}</Badge>
                      <span className="text-xs text-muted-foreground">{entry.date}</span>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {entry.notes.map((n, i) => (
                      <li key={i} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-foreground/90">{n}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
          التطبيق المكتبي يعتمد على Electron ويشتغل بنفس بيانات حسابك على السحابة.
          للاستخدام الأوفلاين، سجّل الدخول مرة واحدة أثناء الاتصال ليتم تخزين الجلسة.
        </p>
      </div>
    </section>
  );
}
