import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DAYS = 7;

function lastDays(n: number) {
  const out: { key: string; date: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push({ key: d.toISOString().slice(0, 10), date: d });
  }
  return out;
}

type Point = { day: string; label: string; in: number; out: number };

function ChartFrame({
  title,
  children,
  loading,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64 pt-2">
        {loading ? <Skeleton className="h-full w-full rounded-xl" /> : children}
      </CardContent>
    </Card>
  );
}

/** Real data charts for the overview: 7-day gate traffic + attendance breakdown. */
export function OverviewCharts() {
  const { t, i18n } = useTranslation();
  const days = useMemo(() => lastDays(DAYS), []);
  const since = days[0]!.date.toISOString();

  const { data: scans, isLoading: scansLoading } = useQuery({
    queryKey: ["overview-chart-scans", since],
    queryFn: async () => {
      const { data } = await supabase
        .from("card_scans")
        .select("direction, scanned_at")
        .gte("scanned_at", since)
        .order("scanned_at", { ascending: true })
        .limit(5000);
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: ["overview-chart-attendance", since],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("status, created_at")
        .gte("created_at", since)
        .limit(5000);
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric" }),
    [i18n.language],
  );

  const traffic: Point[] = useMemo(() => {
    const base = new Map<string, Point>();
    for (const d of days) {
      base.set(d.key, { day: d.key, label: fmt.format(d.date), in: 0, out: 0 });
    }
    for (const s of scans ?? []) {
      const k = new Date(s.scanned_at as string).toISOString().slice(0, 10);
      const p = base.get(k);
      if (!p) continue;
      if (s.direction === "in") p.in += 1;
      else p.out += 1;
    }
    return [...base.values()];
  }, [scans, days, fmt]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of attendance ?? []) {
      const k = (r.status as string) ?? "unknown";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const palette: Record<string, string> = {
      present: "var(--color-primary)",
      late: "var(--color-accent)",
      absent: "var(--color-destructive)",
      excused: "var(--color-muted-foreground)",
    };
    return Object.entries(counts).map(([k, v]) => ({
      name: t(`attendance.status_${k}`, { defaultValue: k }),
      value: v,
      fill: palette[k] ?? "var(--color-muted-foreground)",
    }));
  }, [attendance, t]);

  const hasAttendance = statusData.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ChartFrame title={t("overview.chart_traffic")} loading={scansLoading}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={traffic} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="in"
                name={t("overview.dir_in")}
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#gIn)"
              />
              <Area
                type="monotone"
                dataKey="out"
                name={t("overview.dir_out")}
                stroke="var(--color-accent)"
                strokeWidth={2}
                fill="url(#gOut)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <ChartFrame title={t("overview.chart_attendance")} loading={attLoading}>
        {hasAttendance ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={3}
                stroke="var(--color-background)"
                strokeWidth={2}
              >
                {statusData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--color-popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            {t("common.no_data")}
          </div>
        )}
      </ChartFrame>
    </div>
  );
}

/** Compact weekly bar chart, reusable on role dashboards. */
export function WeeklyScansBar() {
  const { t, i18n } = useTranslation();
  const days = useMemo(() => lastDays(DAYS), []);
  const since = days[0]!.date.toISOString();
  const fmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: "short" }),
    [i18n.language],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["weekly-scans-bar", since],
    queryFn: async () => {
      const { data } = await supabase
        .from("card_scans")
        .select("scanned_at")
        .gte("scanned_at", since)
        .limit(5000);
      return data ?? [];
    },
    staleTime: 120_000,
  });

  const rows = useMemo(() => {
    const base = new Map<string, { label: string; total: number }>();
    for (const d of days) base.set(d.key, { label: fmt.format(d.date), total: 0 });
    for (const s of data ?? []) {
      const k = new Date(s.scanned_at as string).toISOString().slice(0, 10);
      const row = base.get(k);
      if (row) row.total += 1;
    }
    return [...base.values()];
  }, [data, days, fmt]);

  return (
    <ChartFrame title={t("overview.chart_weekly")} loading={isLoading}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--color-popover-foreground)",
            }}
          />
          <Bar dataKey="total" name={t("overview.scans")} fill="var(--color-primary)" radius={8} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
