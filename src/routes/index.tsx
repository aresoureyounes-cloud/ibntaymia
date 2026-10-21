import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ScanLine,
  Users,
  Bell,
  ShieldCheck,
  Database,
  Library,
  Plane,
  ClipboardList,
  BarChart3,
  Award,
  MessageSquare,
  WifiOff,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/PublicHeader";
import { Card, CardContent } from "@/components/ui/card";
import { DesktopDownloads } from "@/components/DesktopDownloads";
import { BrandWordmark } from "@/components/BrandWordmark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "إداروم — النظام الرقمي للمؤسسات التعليمية" },
      {
        name: "description",
        content:
          "إداروم لإدارة الثانوية الجزائرية: متابعة الحضور والحصص والحسابات وإشعارات الأولياء داخل التطبيق.",
      },
      { property: "og:title", content: "إداروم — إدارة الثانوية الجزائرية" },
      { property: "og:description", content: "متابعة الحضور والحصص والحسابات وإشعارات الأولياء داخل التطبيق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const featureKeys = [
  { key: "gate", icon: ScanLine },
  { key: "attendance", icon: Users },
  { key: "notifications", icon: Bell },
  { key: "admin", icon: ShieldCheck },
  { key: "data", icon: Database },
  { key: "library", icon: Library },
  { key: "trips", icon: Plane },
  { key: "exams", icon: ClipboardList },
  { key: "guidance", icon: BarChart3 },
  { key: "behavior", icon: Award },
  { key: "comms", icon: MessageSquare },
  { key: "offline", icon: WifiOff },
] as const;

function Index() {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PublicHeader />

      {/* Ambient organic background shapes */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 select-none overflow-hidden"
      >
        <div className="animate-blob absolute -left-[5%] -top-[10%] h-[500px] w-[500px] bg-accent/10 organic-1 blur-3xl" />
        <div
          className="animate-blob absolute -bottom-[15%] -right-[5%] h-[600px] w-[600px] bg-accent/5 organic-2 blur-3xl"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="animate-blob absolute right-[15%] top-[20%] h-[300px] w-[300px] bg-secondary/10 organic-1 blur-2xl"
          style={{ animationDelay: "-2s" }}
        />
      </div>

      <main>
        {/* Hero section */}
        <section className="relative overflow-hidden">
          <div className="container relative mx-auto px-4 py-16 sm:py-24 md:py-32">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
              {/* Left content */}
              <div className="animate-reveal lg:col-span-5">
                <BrandWordmark className="mb-8" />

                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-card/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-accent backdrop-blur sm:px-4 sm:text-xs sm:tracking-[0.18em]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("brand.tagline")}
                  </div>

                  <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                    {t("landing.hero_title")}
                  </h1>

                  <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                    {t("landing.hero_subtitle")}
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4 sm:mt-10">
                  <Button
                    size="lg"
                    asChild
                    className="bg-primary px-8 py-6 text-base font-semibold text-primary-foreground shadow-2xl shadow-primary/20 hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
                  >
                    <Link to="/login">{t("landing.cta_get_started")}</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="border border-border bg-card/60 px-8 py-6 text-base font-semibold text-foreground backdrop-blur hover:bg-card/90"
                  >
                    <Link to="/about">{t("landing.cta_learn_more")}</Link>
                  </Button>
                </div>

                <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground sm:mt-14 sm:gap-x-10 sm:text-xs sm:tracking-[0.2em]">
                  <span>Online · Offline</span>
                  <span className="hidden h-px w-10 bg-border sm:block" />
                  <span>RFID · EM4100</span>
                  <span className="hidden h-px w-10 bg-border sm:block" />
                  <span>AR · FR · EN</span>
                </div>
              </div>

              {/* Right dashboard preview grid */}
              <div
                className="animate-reveal lg:col-span-7"
                style={{ animationDelay: "0.1s" }}
              >
                <div className="grid h-[520px] grid-cols-6 gap-4 sm:h-[600px]">
                  {/* Main stats widget */}
                  <Card className="col-span-6 row-span-2 glass squircle-lg contour border-border p-6 shadow-soft transition-all duration-500 hover:-translate-y-1 sm:p-8">
                    <CardContent className="relative flex h-full flex-col p-0">
                      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-bl-full bg-muted/40 transition-transform group-hover:scale-110" />

                      <div className="relative z-10 mb-6 flex justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            {t("landing.preview_engagement")}
                          </p>
                          <h3 className="text-5xl font-bold text-foreground sm:text-6xl">
                            98.4
                            <span className="text-4xl text-accent sm:text-5xl">%</span>
                          </h3>
                        </div>
                        <div className="grid h-14 w-14 place-items-center rounded-full border border-border bg-muted/60 shadow-sm">
                          <div className="h-3 w-3 animate-pulse rounded-full bg-accent" />
                        </div>
                      </div>

                      <div className="relative z-10 mt-auto flex flex-1 items-end gap-2 pb-2">
                        {[55, 35, 92, 45, 65, 50].map((h, i) => (
                          <div
                            key={i}
                            className={`w-full rounded-3xl transition-all duration-700 hover:opacity-90 ${
                              i === 2
                                ? "bg-primary shadow-lg shadow-primary/20"
                                : i === 3
                                  ? "bg-accent/50 hover:bg-accent/70"
                                  : "bg-muted hover:bg-muted/80"
                            }`}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Analytics widget */}
                  <Card className="col-span-3 glass squircle contour border-border bg-primary p-5 text-primary-foreground shadow-elevated transition-transform duration-500 hover:-translate-y-1 sm:p-7">
                    <CardContent className="flex h-full flex-col justify-between p-0">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-foreground/10 backdrop-blur-md">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs opacity-80">{t("landing.preview_growth")}</p>
                        <p className="text-xl font-bold tracking-tight sm:text-2xl">
                          +12.4%
                          <span className="mr-1 text-xs font-normal opacity-70">{t("landing.preview_growth_period")}</span>
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Schedule widget */}
                  <Card className="col-span-3 glass squircle contour border-border p-5 shadow-soft transition-transform duration-500 hover:-translate-y-1 sm:p-7">
                    <CardContent className="flex h-full flex-col justify-between p-0">
                      <div className="flex -space-x-3 rtl:space-x-reverse">
                        <div className="h-10 w-10 rounded-full border-[3px] border-background bg-muted shadow-sm sm:h-11 sm:w-11" />
                        <div className="h-10 w-10 rounded-full border-[3px] border-background bg-accent shadow-sm sm:h-11 sm:w-11" />
                        <div className="h-10 w-10 rounded-full border-[3px] border-background bg-secondary shadow-sm sm:h-11 sm:w-11" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-foreground sm:text-lg">{t("landing.preview_next_session")}</p>
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                          {t("landing.preview_room_time")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="container relative mx-auto px-4 py-16 sm:py-24">
          <div className="mb-10 text-center sm:mb-14">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-accent">
              {t("landing.modules_label")}
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              {t("landing.features_title")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              {t("landing.features_subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureKeys.map(({ key, icon: Icon }) => (
              <Card
                key={key}
                className="group contour border-border bg-card/70 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-card hover:shadow-soft"
              >
                <CardContent className="p-6">
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-accent/30 bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold tracking-tight text-foreground">
                    {t(`features.${key}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`features.${key}.desc`)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <DesktopDownloads />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent" />
            <span className="font-semibold tracking-wide">{t("brand.name")}</span>
            <span>·</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/about" className="hover:text-foreground">
              {t("nav.about")}
            </Link>
            <Link to="/trust" className="hover:text-foreground">
              الثقة والأمان
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              {t("nav.privacy")}
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              {t("nav.terms")}
            </Link>
          </nav>
          <div>{t("footer.rights")}</div>
        </div>
      </footer>
    </div>
  );
}
