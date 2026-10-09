import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Repeat, Check, X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/substitutions")({
  head: () => ({ meta: [{ title: "طلبات استبدال الحصص — إداروم" }] }),
  component: SubstitutionsPage,
});

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "outline" },
  approved: { label: "مقبول", variant: "default" },
  rejected: { label: "مرفوض", variant: "destructive" },
};

function SubstitutionsPage() {
  const { user, hasRole } = useAuth();
  const isMgmt = hasRole("admin") || hasRole("director") || hasRole("supervisor");
  const qc = useQueryClient();
  useRealtimeTable("substitution_requests", ["subs"]);

  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [subId, setSubId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: teachers } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => (await supabase.rpc("list_teachers")).data ?? [],
  });
  const tName = (id: string | null) => teachers?.find((t) => t.id === id)?.full_name ?? "—";

  const weekday = date ? new Date(date + "T12:00:00").getDay() : null;
  const { data: mySlots } = useQuery({
    queryKey: ["my-slots", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("schedule_slots")
          .select("id, class_id, subject, weekday, start_time, end_time, classes(name)")
          .eq("teacher_id", user!.id)
          .eq("is_active", true)
          .order("start_time")
      ).data ?? [],
  });
  const daySlots = (mySlots ?? []).filter((s) => s.weekday === weekday);

  const { data: rows } = useQuery({
    queryKey: ["subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("substitution_requests")
        .select(
          "id, requester_id, substitute_teacher_id, request_date, reason, status, review_note, created_at, classes(name), schedule_slots(subject, start_time, end_time)",
        )
        .order("request_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!date) return toast.error("اختر تاريخ الحصة");
    if (!slotId) return toast.error("اختر الحصة من جدولك");
    if (!reason.trim()) return toast.error("اكتب سبب الطلب");
    const slot = daySlots.find((s) => s.id === slotId);
    setSaving(true);
    const { error } = await supabase.from("substitution_requests").insert({
      requester_id: user!.id,
      request_date: date,
      slot_id: slotId,
      class_id: slot?.class_id ?? null,
      substitute_teacher_id: subId || null,
      reason: reason.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم إرسال الطلب إلى الإدارة");
    setSlotId("");
    setSubId("");
    setReason("");
    qc.invalidateQueries({ queryKey: ["subs"] });
  };

  const review = async (row: { id: string; requester_id: string; substitute_teacher_id: string | null; request_date: string }, status: "approved" | "rejected") => {
    const note = notes[row.id]?.trim() || null;
    const { error } = await supabase
      .from("substitution_requests")
      .update({ status, review_note: note, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    const title = status === "approved" ? "تم قبول طلب استبدال الحصة" : "تم رفض طلب استبدال الحصة";
    const recipients = [row.requester_id, ...(status === "approved" && row.substitute_teacher_id ? [row.substitute_teacher_id] : [])];
    await supabase.from("notifications").insert(
      recipients.map((rid) => ({
        recipient_id: rid,
        title: rid === row.requester_id ? title : "كُلّفت بحصة استخلاف",
        body: `تاريخ الحصة: ${row.request_date}${note ? ` — ${note}` : ""}`,
        channel: "inapp",
        status: "sent",
        created_by: user!.id,
      })),
    );
    toast.success(status === "approved" ? "تم القبول" : "تم الرفض");
    qc.invalidateQueries({ queryKey: ["subs"] });
  };

  const cancel = async (id: string) => {
    const { error } = await supabase.from("substitution_requests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["subs"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات استبدال الحصص"
        description="يطلب الأستاذ تعويض حصة أو استخلافها، وتقبل الإدارة الطلب أو ترفضه."
        icon={<Repeat className="h-8 w-8" />}
      />

      {hasRole("teacher") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">طلب جديد</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>تاريخ الحصة</Label>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlotId(""); }} />
            </div>
            <div className="space-y-1">
              <Label>الحصة</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={slotId} onChange={(e) => setSlotId(e.target.value)} disabled={!date}>
                <option value="">{date ? (daySlots.length ? "اختر" : `لا حصص لك يوم ${DAYS[weekday!]}`) : "اختر التاريخ أولاً"}</option>
                {daySlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.subject} · {s.classes?.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>الأستاذ المقترح للاستخلاف (اختياري)</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={subId} onChange={(e) => setSubId(e.target.value)}>
                <option value="">بدون</option>
                {(teachers ?? []).filter((t) => t.id !== user?.id).map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>السبب</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button onClick={submit} disabled={saving} className="w-fit">إرسال الطلب</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(rows ?? []).length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات.</p>}
        {(rows ?? []).map((r) => {
          const st = STATUS[r.status] ?? STATUS.pending;
          return (
            <Card key={r.id}>
              <CardContent className="space-y-2 pt-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {r.schedule_slots?.subject ?? "—"} · {r.classes?.name ?? "—"} ·{" "}
                    <span className="ltr">{r.request_date} {r.schedule_slots ? `${r.schedule_slots.start_time.slice(0, 5)}–${r.schedule_slots.end_time.slice(0, 5)}` : ""}</span>
                  </p>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>
                <p className="text-muted-foreground">الطالب: {tName(r.requester_id)} · البديل المقترح: {tName(r.substitute_teacher_id)}</p>
                <p>{r.reason}</p>
                {r.review_note && <p className="text-muted-foreground">ردّ الإدارة: {r.review_note}</p>}
                {isMgmt && r.status === "pending" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="max-w-sm" placeholder="ملاحظة (اختياري)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                    <Button size="sm" onClick={() => review(r, "approved")}><Check className="me-1 h-4 w-4" />قبول</Button>
                    <Button size="sm" variant="destructive" onClick={() => review(r, "rejected")}><X className="me-1 h-4 w-4" />رفض</Button>
                  </div>
                )}
                {r.requester_id === user?.id && r.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => cancel(r.id)}><Trash2 className="me-1 h-4 w-4" />إلغاء الطلب</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
