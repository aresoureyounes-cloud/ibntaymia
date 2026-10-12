import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarRange, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/weekly")({
  head: () => ({ meta: [{ title: "الملخص الأسبوعي — إداروم" }] }),
  component: WeeklyPage,
});

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Algerian school week: Sunday → Thursday. */
function weekRange(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return { from: fmt(d), to: fmt(end) };
}

function WeeklyPage() {
  const [offset, setOffset] = useState(0);
  const { from, to } = weekRange(offset);

  const { data, isLoading } = useQuery({
    queryKey: ["weekly", from],
    queryFn: async () => {
      const [sess, just, meet, subs, events] = await Promise.all([
        supabase
          .from("attendance_sessions")
          .select("id, session_date, session_type, classes(name), attendance_records(status, student_id, students(full_name, classes(name)))")
          .gte("session_date", from)
          .lte("session_date", to),
        supabase.from("absence_justifications").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("meeting_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("substitution_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("school_events").select("id, title, starts_on, event_type").gte("starts_on", fmt(new Date())).order("starts_on").limit(8),
      ]);
      if (sess.error) throw sess.error;
      return {
        sessions: sess.data ?? [],
        pendingJust: just.count ?? 0,
        pendingMeet: meet.count ?? 0,
        pendingSubs: subs.count ?? 0,
        events: events.data ?? [],
      };
    },
  });

  const sessions = data?.sessions ?? [];
  const records = sessions.flatMap((s) => s.attendance_records);
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const rate = records.length ? Math.round(((records.length - absent) / records.length) * 100) : null;

  const perStudent = new Map<string, { name: string; cls: string; absent: number; late: number }>();
  for (const r of records) {
    if (r.status !== "absent" && r.status !== "late") continue;
    const e = perStudent.get(r.student_id) ?? { name: r.students?.full_name ?? "—", cls: r.students?.classes?.name ?? "", absent: 0, late: 0 };
    if (r.status === "absent") e.absent++;
    else e.late++;
    perStudent.set(r.student_id, e);
  }
  const top = [...perStudent.values()].sort((a, b) => b.absent - a.absent || b.late - a.late).slice(0, 15);

  const perClass = new Map<string, { sessions: number; absent: number; total: number }>();
  for (const s of sessions) {
    const k = s.classes?.name ?? "—";
    const e = perClass.get(k) ?? { sessions: 0, absent: 0, total: 0 };
    e.sessions++;
    e.total += s.attendance_records.length;
    e.absent += s.attendance_records.filter((r) => r.status === "absent").length;
    perClass.set(k, e);
  }

  const Stat = ({ label, value, to }: { label: string; value: string | number; to?: string }) => {
    const body = (
      <Card className={to ? "transition hover:shadow-md" : ""}>
        <CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </CardContent>
      </Card>
    );
    return to ? <Link to={to}>{body}</Link> : body;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الملخص الأسبوعي" description={`من ${from} إلى ${to}`} icon={<CalendarRange className="h-8 w-8" />} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOffset(offset - 1)}><ChevronRight className="h-4 w-4" />الأسبوع السابق</Button>
        <Button size="sm" variant="outline" onClick={() => setOffset(0)} disabled={offset === 0}>هذا الأسبوع</Button>
        <Button size="sm" variant="outline" onClick={() => setOffset(offset + 1)} disabled={offset >= 0}>الأسبوع التالي<ChevronLeft className="h-4 w-4" /></Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="جلسات الحضور المسجلة" value={sessions.length} />
        <Stat label="نسبة الحضور" value={rate === null ? "—" : `${rate}%`} />
        <Stat label="حالات الغياب" value={absent} />
        <Stat label="حالات التأخر" value={late} />
        <Stat label="تبريرات غياب تنتظر الرد" value={data?.pendingJust ?? 0} to="/dashboard/absence-report" />
        <Stat label="طلبات مقابلة تنتظر الرد" value={data?.pendingMeet ?? 0} to="/dashboard/meetings" />
        <Stat label="طلبات استبدال تنتظر الرد" value={data?.pendingSubs ?? 0} to="/dashboard/substitutions" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">الأكثر غياباً هذا الأسبوع</CardTitle>
            <ExportButtons filename="weekly-absences" title={`الأكثر غياباً ${from} → ${to}`} rows={top.map((s) => ({ التلميذ: s.name, القسم: s.cls, الغياب: s.absent, التأخر: s.late }))} />
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {top.length === 0 && <p className="text-muted-foreground">لا غيابات مسجلة.</p>}
            {top.map((s, i) => (
              <div key={i} className="flex justify-between rounded border px-3 py-1.5">
                <span>{s.name} <span className="text-muted-foreground">— {s.cls}</span></span>
                <span>{s.absent} غ · {s.late} ت</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">حسب القسم</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {perClass.size === 0 && <p className="text-muted-foreground">لا بيانات.</p>}
            {[...perClass.entries()].sort().map(([k, v]) => (
              <div key={k} className="flex justify-between rounded border px-3 py-1.5">
                <span>{k}</span>
                <span className="text-muted-foreground">{v.sessions} جلسة · {v.absent} غياب من {v.total}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">المواعيد القادمة</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data?.events ?? []).length === 0 && <p className="text-muted-foreground">لا مواعيد قادمة.</p>}
            {(data?.events ?? []).map((e) => (
              <p key={e.id}><span className="ltr text-muted-foreground">{e.starts_on}</span> · {e.title}</p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
