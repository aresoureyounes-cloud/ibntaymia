import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/today")({
  head: () => ({ meta: [{ title: "حصص اليوم — إداروم" }] }),
  component: TodayPage,
});

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TodayPage() {
  const { user } = useAuth();
  const today = localDate();
  const weekday = new Date().getDay();
  const nowHM = new Date().toTimeString().slice(0, 5);
  useRealtimeTable("attendance_sessions", ["today-sessions", user?.id, today]);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["today-slots", user?.id, weekday],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, subject, start_time, end_time, room, group_label, classes(name)")
        .eq("teacher_id", user!.id)
        .eq("weekday", weekday)
        .eq("is_active", true)
        .order("start_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["today-sessions", user?.id, today],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_sessions")
        .select("id, slot_id, session_type, subject, classes(name), attendance_records(status)")
        .eq("teacher_id", user!.id)
        .eq("session_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["today-subs", user?.id, today],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("substitution_requests")
          .select("id, schedule_slots(subject, start_time, end_time), classes(name)")
          .eq("substitute_teacher_id", user!.id)
          .eq("request_date", today)
          .eq("status", "approved")
      ).data ?? [],
  });

  const missing = slots.filter((s) => s.end_time.slice(0, 5) <= nowHM && !sessions.some((x) => x.slot_id === s.id));
  const extra = sessions.filter((x) => !x.slot_id || !slots.some((s) => s.id === x.slot_id));

  return (
    <div className="space-y-6">
      <PageHeader title={`حصص اليوم — ${DAYS[weekday]}`} description={today} icon={<CalendarCheck className="h-8 w-8" />} />

      {missing.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-2 pt-4 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {missing.length} حصة انتهت دون تسجيل الحضور.
          </CardContent>
        </Card>
      )}

      {subs.length > 0 && (
        <Card>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-medium">حصص استخلاف مكلّف بها اليوم:</p>
            {subs.map((s) => (
              <p key={s.id} className="text-muted-foreground">
                {s.schedule_slots?.start_time.slice(0, 5)}–{s.schedule_slots?.end_time.slice(0, 5)} · {s.schedule_slots?.subject} · {s.classes?.name}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
      {!isLoading && slots.length === 0 && <p className="text-sm text-muted-foreground">لا حصص لك في جدول اليوم.</p>}

      <div className="space-y-2">
        {slots.map((s) => {
          const done = sessions.find((x) => x.slot_id === s.id);
          const current = s.start_time.slice(0, 5) <= nowHM && nowHM < s.end_time.slice(0, 5);
          const absent = done?.attendance_records.filter((r) => r.status === "absent").length ?? 0;
          return (
            <Card key={s.id} className={current ? "border-primary" : ""}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    <span className="ltr">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span> · {s.subject} · {s.classes?.name}
                    {s.group_label !== "all" ? ` (${s.group_label})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.room ? `القاعة ${s.room}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  {current && <Badge><Clock className="me-1 h-3 w-3" />الآن</Badge>}
                  {done ? (
                    <Badge variant="secondary"><CheckCircle2 className="me-1 h-3 w-3" />مسجَّل · {absent} غائب</Badge>
                  ) : (
                    <Link to="/dashboard/attendance">
                      <Button size="lg" className="min-h-11">تسجيل الحضور</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {extra.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">جلسات أخرى سجلتها اليوم (استخلاف / إضافية):</p>
          {extra.map((x) => (
            <p key={x.id} className="text-muted-foreground">{x.subject ?? "—"} · {x.classes?.name} · {x.attendance_records.length} تلميذ</p>
          ))}
        </div>
      )}
    </div>
  );
}
