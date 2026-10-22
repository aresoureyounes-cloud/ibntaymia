import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth, type AppRole } from "@/lib/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  GraduationCap,
  ClipboardList,
  Users,
  Bell,
  Library,
  ScanLine,
  ArrowLeft,
  Wrench,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — إداروم" },
      { name: "description", content: "إداروم: لوحة التحكم في الثانوية الجزائرية." },
      { property: "og:title", content: "لوحة التحكم — إداروم" },
      { property: "og:description", content: "إداروم: لوحة التحكم في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardHome,
});

const roleConfig: Record<AppRole, { url: string; icon: typeof ShieldCheck; gradient: string }> = {
  developer: {
    url: "/dashboard/diagnostics",
    icon: Wrench,
    gradient: "from-secondary to-primary",
  },
  admin: {
    url: "/dashboard/admin",
    icon: ShieldCheck,
    gradient: "from-primary to-primary-glow",
  },
  director: {
    url: "/dashboard/director",
    icon: GraduationCap,
    gradient: "from-primary to-secondary",
  },
  supervisor: {
    url: "/dashboard/supervisor",
    icon: ClipboardList,
    gradient: "from-secondary to-primary",
  },
  teacher: {
    url: "/dashboard/teacher",
    icon: Users,
    gradient: "from-primary-glow to-primary",
  },
  parent: {
    url: "/dashboard/parent",
    icon: Bell,
    gradient: "from-secondary to-primary-glow",
  },
  student: {
    url: "/dashboard/student",
    icon: Library,
    gradient: "from-primary to-primary-glow",
  },
  gate_monitor: {
    url: "/dashboard/gate",
    icon: ScanLine,
    gradient: "from-primary-glow to-secondary",
  },
};

function DashboardHome() {
  const { t } = useTranslation();
  const { user, roles, loading } = useAuth();

  return (
    <div className="space-y-8">
      <div className="animate-reveal">
        <p className="text-sm font-medium text-muted-foreground">{t("dashboard.welcome")}</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {user?.user_metadata?.full_name || user?.email}
        </h1>
      </div>

      {loading ? (
        <Card className="glass contour border-border">
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("common.loading")}
          </CardContent>
        </Card>
      ) : roles.length === 0 ? (
        <Card className="glass contour border-border">
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("dashboard.no_role")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="animate-reveal" style={{ animationDelay: "0.1s" }}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("dashboard.switch_role")}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => {
                const cfg = roleConfig[role];
                const Icon = cfg.icon;
                return (
                  <Link key={role} to={cfg.url}>
                    <Card className="group glass contour border-border transition-all duration-300 hover:-translate-y-1 hover:bg-card hover:shadow-soft">
                      <CardContent className="relative flex items-center gap-4 py-6">
                        <div
                          className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${cfg.gradient} text-primary-foreground shadow-sm`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">{t(`roles.${role}`)}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("dashboard.your_role")}
                          </div>
                        </div>
                        <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1 rtl:rotate-180 rtl:group-hover:translate-x-1" />
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
