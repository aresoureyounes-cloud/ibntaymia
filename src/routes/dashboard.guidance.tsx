import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarCheck, CreditCard, Award } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/dashboard/guidance")({ component: GuidancePage });

function GuidancePage() {
  useRealtimeTable("students", ["guidance_stats"]);
  useRealtimeTable("attendance_records", ["guidance_stats"]);
  useRealtimeTable("rfid_cards", ["guidance_stats"]);
  useRealtimeTable("behavior_records", ["guidance_charts"]);

  const { data } = useQuery({
    queryKey: ["guidance_stats"],
    queryFn: async () => {
      const [students, attendance, cards, behavior] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("attendance_records").select("id", { count: "exact", head: true }),
        supabase.from("rfid_cards").select("id", { count: "exact", head: true }),
        supabase.from("behavior_records").select("id", { count: "exact", head: true }),
      ]);
      return {
        students: students.count ?? 0,
        attendance: attendance.count ?? 0,
        cards: cards.count ?? 0,
        behavior: behavior.count ?? 0,
      };
    },
  });

  const { data: charts } = useQuery({
    queryKey: ["guidance_charts"],
    queryFn: async () => {
      const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString();
      const [attRes, behRes] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("status, created_at")
          .gte("created_at", since)
          .limit(5000),
        supabase
          .from("behavior_records")
          .select("record_type, points")
          .limit(5000),
      ]);
      const attRows = (attRes.data ?? []) as { status: string; created_at: string }[];
      const behRows = (behRes.data ?? []) as { record_type: string; points: number }[];

      // Last 14 days attendance trend
      const days: Record<string, { day: string; present: number; late: number; absent: number }> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        days[key] = { day: key.slice(5), present: 0, late: 0, absent: 0 };
      }
      for (const r of attRows) {
        const key = r.created_at.slice(0, 10);
        if (!days[key]) continue;
        if (r.status === "present") days[key].present++;
        else if (r.status === "late") days[key].late++;
        else if (r.status === "absent") days[key].absent++;
      }

      // Attendance status pie (all-time)
      const statusCounts: Record<string, number> = {};
      for (const r of attRows) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

      // Behavior positive vs negative
      let positive = 0;
      let negative = 0;
      for (const r of behRows) {
        if (r.points >= 0) positive++;
        else negative++;
      }

      return {
        trend: Object.values(days),
        pie: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
        behavior: [
          { name: "إيجابي", value: positive },
          { name: "سلبي", value: negative },
        ],
      };
    },
  });

  const stats = [
    { label: "التلاميذ", value: data?.students ?? 0, icon: Users },
    { label: "تسجيلات الحضور", value: data?.attendance ?? 0, icon: CalendarCheck },
    { label: "البطاقات", value: data?.cards ?? 0, icon: CreditCard },
    { label: "ملاحظات السلوك", value: data?.behavior ?? 0, icon: Award },
  ];
  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--accent))"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="التوجيه والإحصاء"
        description="مؤشرات سريعة تتحدث تلقائياً."
        icon={<Users className="h-8 w-8" />}
      />
      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="cinema-shadow">
            <CardContent className="flex items-center gap-4 py-6">
              <span className="grid h-12 w-12 place-items-center rounded-md bg-primary/10 text-primary">
                <s.icon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-3xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="cinema-shadow">
          <CardHeader>
            <CardTitle>الحضور خلال آخر 14 يوم</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" name="حاضر" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="late" name="متأخر" stroke="hsl(var(--accent))" strokeWidth={2} />
                <Line type="monotone" dataKey="absent" name="غائب" stroke="hsl(var(--destructive))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="cinema-shadow">
          <CardHeader>
            <CardTitle>توزيع حالات الحضور</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={charts?.pie ?? []} dataKey="value" nameKey="name" outerRadius={90} label>
                  {(charts?.pie ?? []).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="cinema-shadow lg:col-span-2">
          <CardHeader>
            <CardTitle>السلوك — إيجابي مقابل سلبي</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.behavior ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
