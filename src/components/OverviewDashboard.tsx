import { useAuth } from "@/lib/use-auth";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { memo, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  CreditCard,
  CalendarCheck,
  Bell,
  Megaphone,
  Award,
  BookOpen,
  Bus,
  FilePenLine,
  ScanLine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OverviewCharts } from "@/components/OverviewCharts";

const db = supabase;

type Quick = { to: string; icon: LucideIcon; labelKey: string };

/** One channel, multi-table realtime — invalidates the overview keys. */
function useOverviewRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["overview-stats"] });
      qc.invalidateQueries({ queryKey: ["overview-decisions"] });
      qc.invalidateQueries({ queryKey: ["overview-scans"] });
    };
    const ch = supabase
      .channel("overview-unified")
      .on("postgres_changes", { event: "*", schema: "public", table: "card_scans" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_decisions" },
        invalidate,
      )
      .subscribe();

    // Pause/resume realtime when the tab goes to background — saves battery on mobile.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") supabase.removeChannel(ch);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

const StatCard = memo(function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
});

const QuickActionCard = memo(function QuickActionCard({ q, label }: { q: Quick; label: string }) {
  return (
    <Link to={q.to}>
      <Card className="group transition-colors hover:bg-secondary">
        <CardContent className="flex items-center gap-3 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <q.icon className="h-5 w-5" />
          </div>
          <span className="font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
});

export function OverviewDashboard({
  roleKey,
  quickActions,
}: {
  roleKey: string;
  quickActions: Quick[];
}) {
  const { t } = useTranslation();
  useOverviewRealtime();
  const { hasRole } = useAuth();
  const isMgmt = hasRole("admin") || hasRole("director") || hasRole("supervisor");

  // Single round-trip for all counters (was 6 parallel HEAD requests).
  const { data: stats } = useQuery({
    queryKey: ["overview-stats"],
    enabled: isMgmt,
    queryFn: async () => {
      const { data } = await db.rpc("get_overview_stats");
      return (data ?? {}) as Record<string, number>;
    },
    staleTime: 60_000,
  });

  const { data: decisions } = useQuery({
    queryKey: ["overview-decisions"],
    queryFn: async () => {
      const { data } = await db
        .from("school_decisions")
        .select("id, title, body, decision_type, starts_at")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(4);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: recentScans } = useQuery({
    queryKey: ["overview-scans"],
    queryFn: async () => {
      const { data } = await db
        .from("card_scans")
        .select("id, card_uid, direction, scanned_at, students(full_name)")
        .order("scanned_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const statCards = useMemo(
    () => [
      { icon: Users, label: t("nav.students"), value: stats?.students ?? 0 },
      { icon: CreditCard, label: t("nav.cards"), value: stats?.cards ?? 0 },
      { icon: CalendarCheck, label: t("nav.attendance"), value: stats?.attendance ?? 0 },
      { icon: Bell, label: t("nav.notifications"), value: stats?.notifications ?? 0 },
      { icon: BookOpen, label: t("overview.classes"), value: stats?.classes ?? 0 },
      { icon: ScanLine, label: t("overview.scans"), value: stats?.scans ?? 0 },
    ],
    [stats, t],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{t("dashboard.your_role")}</p>
        <h1 className="text-2xl font-bold md:text-3xl">{t(`roles.${roleKey}`)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("overview.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
        ))}
      </div>

      <OverviewCharts />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t("overview.quick_actions")}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickActions.map((q) => (
            <QuickActionCard key={q.to} q={q} label={t(q.labelKey)} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("nav.decisions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(decisions ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
            )}
            {(decisions ?? []).map((d) => (
              <div key={d.id} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{d.title}</p>
                  <Badge variant="secondary">{d.decision_type}</Badge>
                </div>
                {d.body && <p className="mt-1 text-muted-foreground">{d.body}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("overview.recent_scans")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(recentScans ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
            )}
            {(recentScans ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{s.students?.full_name ?? s.card_uid}</p>
                  <p className="ltr text-xs text-muted-foreground">
                    {new Date(s.scanned_at).toLocaleString()}
                  </p>
                </div>
                <Badge variant={s.direction === "in" ? "default" : "secondary"}>
                  {s.direction === "in" ? t("overview.dir_in") : t("overview.dir_out")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const quickActionsAdmin: Quick[] = [
  { to: "/dashboard/students", icon: Users, labelKey: "nav.students" },
  { to: "/dashboard/cards", icon: CreditCard, labelKey: "nav.cards" },
  { to: "/dashboard/attendance", icon: CalendarCheck, labelKey: "nav.attendance" },
  { to: "/dashboard/notifications", icon: Bell, labelKey: "nav.notifications" },
  { to: "/dashboard/decisions", icon: Megaphone, labelKey: "nav.decisions" },
  { to: "/dashboard/behavior", icon: Award, labelKey: "nav.behavior" },
  { to: "/dashboard/library", icon: BookOpen, labelKey: "nav.library" },
  { to: "/dashboard/exams", icon: FilePenLine, labelKey: "nav.exams" },
];

export const quickActionsDirector: Quick[] = [
  { to: "/dashboard/decisions", icon: Megaphone, labelKey: "nav.decisions" },
  { to: "/dashboard/students", icon: Users, labelKey: "nav.students" },
  { to: "/dashboard/attendance", icon: CalendarCheck, labelKey: "nav.attendance" },
  { to: "/dashboard/notifications", icon: Bell, labelKey: "nav.notifications" },
  { to: "/dashboard/exams", icon: FilePenLine, labelKey: "nav.exams" },
  { to: "/dashboard/guidance", icon: Award, labelKey: "nav.guidance" },
  { to: "/dashboard/trips", icon: Bus, labelKey: "nav.trips" },
  { to: "/dashboard/library", icon: BookOpen, labelKey: "nav.library" },
];

export const quickActionsSupervisor: Quick[] = [
  { to: "/dashboard/attendance", icon: CalendarCheck, labelKey: "nav.attendance" },
  { to: "/dashboard/behavior", icon: Award, labelKey: "nav.behavior" },
  { to: "/dashboard/cards", icon: CreditCard, labelKey: "nav.cards" },
  { to: "/dashboard/notifications", icon: Bell, labelKey: "nav.notifications" },
  { to: "/dashboard/students", icon: Users, labelKey: "nav.students" },
  { to: "/dashboard/guidance", icon: Award, labelKey: "nav.guidance" },
];
