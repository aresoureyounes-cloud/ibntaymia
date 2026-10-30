import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, UserX } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { availableTeachers, freeSlots, type Slot } from "@/lib/legal-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/free-periods")({
  component: FreePeriodsPage,
  head: () => ({
    meta: [
      { title: "غياب الأساتذة وحصص الفراغ — إداروم" },
      { name: "description", content: "تسجيل غياب الأستاذ، استخراج الحصص الفارغة، وتقرير الاستخلاف أو المراجعة أو التسريح." },
      { property: "og:title", content: "غياب الأساتذة وحصص الفراغ — إداروم" },
      { property: "og:description", content: "تنظيم حصص الفراغ يومياً دون ترك الأقسام في الشارع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type SlotRow = Slot & { room: string | null; classes: { name: string } | null };
const DECISION: Record<string, string> = { substitute: "استخلاف", study_room: "قاعة المراجعة / المكتبة", dismissed: "تسريح القسم" };
const todayStr = () => new Date().toISOString().slice(0, 10);

function FreePeriodsPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [teacher, setTeacher] = useState("");
  const [reason, setReason] = useState("");
  const weekday = new Date(date + "T12:00:00").getDay();

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_teachers");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: slots = [] } = useQuery({
    queryKey: ["all-slots"],
    queryFn: async (): Promise<SlotRow[]> => {
      const { data, error } = await supabase.from("schedule_slots").select("id, class_id, teacher_id, weekday, start_time, end_time, subject, room, is_active, classes(name)");
      if (error) throw error;
      return (data ?? []) as unknown as SlotRow[];
    },
  });
  const { data: absences = [] } = useQuery({
    queryKey: ["teacher-absences", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("teacher_absences").select("*").eq("absence_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: decisions = [] } = useQuery({
    queryKey: ["fp-decisions", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("free_period_decisions").select("*").eq("decision_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const name = (id: string | null) => teachers.find((t) => t.id === id)?.full_name ?? "—";
  const free = useMemo(
    () => (freeSlots(slots, absences, weekday) as SlotRow[]).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [slots, absences, weekday],
  );
  const absentIds = absences.map((a) => a.teacher_id);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["teacher-absences", date] });
    qc.invalidateQueries({ queryKey: ["fp-decisions", date] });
  };

  const addAbsence = async () => {
    if (!teacher) return toast.error("اختر الأستاذ");
    const { error } = await supabase.from("teacher_absences").insert({ teacher_id: teacher, absence_date: date, reason: reason || null });
    if (error) return toast.error(friendlyError(error));
    toast.success("سُجل غياب الأستاذ");
    setTeacher(""); setReason("");
    refresh();
  };
  const removeAbsence = async (id: string) => {
    const { error } = await supabase.from("teacher_absences").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    refresh();
  };
  const decide = async (sl: SlotRow, decision: string, substitute?: string) => {
    const { error } = await supabase.from("free_period_decisions").upsert(
      { slot_id: sl.id, class_id: sl.class_id, decision_date: date, decision, substitute_teacher_id: substitute ?? null },
      { onConflict: "slot_id,decision_date" },
    );
    if (error) return toast.error(friendlyError(error));
    toast.success(DECISION[decision]);
    refresh();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Clock className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">غياب الأساتذة وحصص الفراغ</h1>
          <p className="text-sm text-muted-foreground">سجّل الأستاذ الغائب، فتظهر حصصه الفارغة لتقرر لكل حصة.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserX className="h-4 w-4" /> تسجيل غياب أستاذ</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="text-sm">التاريخ<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-sm">الأستاذ
            <select className="block h-10 rounded-md border border-input bg-background px-3" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">— اختر —</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </label>
          <label className="text-sm">السبب<Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="عطلة مرضية، مهمة..." /></label>
          <Button onClick={addAbsence}>تسجيل (اليوم كاملاً)</Button>
        </CardContent>
        {absences.length > 0 && (
          <CardContent className="flex flex-wrap gap-2">
            {absences.map((a) => (
              <Badge key={a.id} variant="secondary" className="gap-2">{name(a.teacher_id)}{a.reason ? ` — ${a.reason}` : ""}
                <button className="text-destructive" onClick={() => removeAbsence(a.id)}>×</button></Badge>
            ))}
          </CardContent>
        )}
      </Card>

      <h2 className="text-lg font-semibold">حصص الفراغ ({free.length})</h2>
      {slots.length === 0 && <p className="text-muted-foreground">لم يُدخل الجدول الأسبوعي بعد؛ تظهر حصص الفراغ بعد إدخاله.</p>}
      {slots.length > 0 && free.length === 0 && <p className="text-muted-foreground">لا توجد حصص فارغة في هذا اليوم.</p>}
      <div className="grid gap-3">
        {free.map((sl) => {
          const d = decisions.find((x) => x.slot_id === sl.id);
          const avail = availableTeachers(sl, slots, teachers.map((t) => t.id), absentIds);
          return (
            <Card key={sl.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{sl.start_time.slice(0, 5)}–{sl.end_time.slice(0, 5)}</Badge>
                  <span className="font-semibold">{sl.classes?.name}</span>
                  <span className="text-sm text-muted-foreground">{sl.subject} — {name(sl.teacher_id)}</span>
                  {d ? <Badge variant="secondary">{DECISION[d.decision]}{d.substitute_teacher_id ? `: ${name(d.substitute_teacher_id)}` : ""}</Badge>
                    : <Badge variant="destructive">بدون قرار</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" defaultValue=""
                    onChange={(e) => e.target.value && decide(sl, "substitute", e.target.value)}>
                    <option value="">استخلاف بـ… ({avail.length} متاح)</option>
                    {avail.map((id) => <option key={id} value={id}>{name(id)}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => decide(sl, "study_room")}>قاعة المراجعة</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(sl, "dismissed")}>تسريح القسم</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
