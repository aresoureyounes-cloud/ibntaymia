import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtTime, toMinutes } from "@/lib/student-data";

export const Route = createFileRoute("/dashboard/schedule")({
  head: () => ({
    meta: [
      { title: "جدول التوقيت والواجبات | إداروم" },
      { name: "description", content: "إدارة جدول توقيت الأقسام والأساتذة ونشر الواجبات في إداروم." },
      { property: "og:title", content: "جدول التوقيت والواجبات | إداروم" },
      { property: "og:description", content: "جدول توقيت أسبوعي لكل قسم وأستاذ مع منع التعارض." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

// Algerian school week: Sunday → Thursday (Saturday optional)
const DAYS = [
  { wd: 0, label: "الأحد" },
  { wd: 1, label: "الإثنين" },
  { wd: 2, label: "الثلاثاء" },
  { wd: 3, label: "الأربعاء" },
  { wd: 4, label: "الخميس" },
  { wd: 6, label: "السبت" },
];
const GROUPS: Record<string, string> = { all: "القسم كاملاً", g1: "الفوج 1", g2: "الفوج 2" };

type Slot = {
  id: string;
  class_id: string;
  teacher_id: string | null;
  subject: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
  note: string | null;
  period_no: number | null;
  group_label: string;
  is_active: boolean;
  classes: { name: string } | null;
};

type Form = {
  id?: string;
  class_id: string;
  teacher_id: string;
  subject: string;
  weekday: string;
  start: string;
  end: string;
  room: string;
  period_no: string;
  group_label: string;
  note: string;
};

const emptyForm = (classId: string, teacherId: string): Form => ({
  class_id: classId,
  teacher_id: teacherId,
  subject: "",
  weekday: "0",
  start: "08:00",
  end: "09:00",
  room: "",
  period_no: "",
  group_label: "all",
  note: "",
});

function explain(msg: string) {
  const i = msg.indexOf(":");
  return msg.startsWith("SCHED_") && i > 0 ? msg.slice(i + 1).trim() : msg;
}

function SchedulePage() {
  const { t } = useTranslation();
  const { user, hasRole } = useAuth();
  const canEdit = hasRole("admin") || hasRole("director") || hasRole("supervisor");
  const qc = useQueryClient();
  useRealtimeTable("schedule_slots", ["schedule"]);
  const [mode, setMode] = useState<"class" | "teacher">("class");
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [copyTarget, setCopyTarget] = useState("");

  const { data: classes } = useQuery({
    queryKey: ["classes-all"],
    queryFn: async () => (await supabase.from("classes").select("id, name").order("name")).data ?? [],
  });
  const { data: teachers } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_teachers" as never);
      return ((data as unknown) as { id: string; full_name: string }[]) ?? [];
    },
  });
  const teacherName = (id: string | null) =>
    id ? (teachers ?? []).find((x) => x.id === id)?.full_name ?? "—" : "بدون أستاذ";

  const filterId = mode === "class" ? classId : teacherId;
  const { data: slots } = useQuery({
    queryKey: ["schedule", mode, filterId],
    enabled: !!filterId,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("*, classes(name)")
        .eq(mode === "class" ? "class_id" : "teacher_id", filterId)
        .order("start_time");
      if (error) throw error;
      return (data as unknown as Slot[]) ?? [];
    },
  });

  // distinct time rows for the grid
  const times = useMemo(() => {
    const set = new Map<string, string>();
    (slots ?? []).forEach((s) => set.set(`${s.start_time}-${s.end_time}`, s.start_time));
    return [...set.entries()].sort((a, b) => toMinutes(a[1]) - toMinutes(b[1])).map(([k]) => k);
  }, [slots]);

  const weeklyHours = useMemo(
    () =>
      (slots ?? [])
        .filter((s) => s.is_active)
        .reduce((a, s) => a + (toMinutes(s.end_time) - toMinutes(s.start_time)), 0) / 60,
    [slots],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["schedule"] });

  const save = async () => {
    if (!form) return;
    if (!form.class_id || !form.subject.trim()) return toast.error("القسم والمادة مطلوبان");
    if (toMinutes(form.end) <= toMinutes(form.start)) return toast.error(t("sched.bad_time"));
    const row = {
      class_id: form.class_id,
      teacher_id: form.teacher_id || null,
      subject: form.subject.trim(),
      weekday: Number(form.weekday),
      start_time: form.start,
      end_time: form.end,
      room: form.room.trim() || null,
      note: form.note.trim() || null,
      period_no: form.period_no ? Number(form.period_no) : null,
      group_label: form.group_label,
    };
    const q = form.id
      ? supabase.from("schedule_slots").update(row as never).eq("id", form.id)
      : supabase.from("schedule_slots").insert(row as never);
    const { error } = await q;
    if (error) return toast.error(explain(error.message));
    toast.success(form.id ? "عُدّلت الحصة" : t("sched.slot_added"));
    setForm(null);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذه الحصة؟ جلسات الحضور السابقة تبقى محفوظة.")) return;
    const { error } = await supabase.from("schedule_slots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const toggleActive = async (s: Slot) => {
    const { error } = await supabase
      .from("schedule_slots")
      .update({ is_active: !s.is_active } as never)
      .eq("id", s.id);
    if (error) return toast.error(explain(error.message));
    refresh();
  };

  const copySchedule = async () => {
    if (!copyTarget || copyTarget === classId) return;
    const rows = (slots ?? []).map((s) => ({
      class_id: copyTarget,
      teacher_id: null,
      subject: s.subject,
      weekday: s.weekday,
      start_time: s.start_time,
      end_time: s.end_time,
      room: null,
      period_no: s.period_no,
      group_label: s.group_label,
    }));
    let ok = 0;
    const errors: string[] = [];
    for (const r of rows) {
      const { error } = await supabase.from("schedule_slots").insert(r as never);
      if (error) errors.push(explain(error.message));
      else ok++;
    }
    toast[errors.length ? "warning" : "success"](
      `نُسخت ${ok} حصة${errors.length ? ` — تعذّر ${errors.length} بسبب تعارض` : ""} (بدون أستاذ وقاعة، عيّنهما يدوياً)`,
    );
    setCopyTarget("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.schedule")}
        description={canEdit ? "إعداد جدول التوقيت مع منع تعارض الأستاذ والقاعة والقسم تلقائياً." : "جدول التوقيت (قراءة فقط)."}
        icon={<CalendarDays className="h-5 w-5" />}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "class" | "teacher")}>
            <TabsList>
              <TabsTrigger value="class">حسب القسم</TabsTrigger>
              <TabsTrigger value="teacher">حسب الأستاذ</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "class" ? (
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-52"><SelectValue placeholder={t("sched.pick_class")} /></SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="اختر الأستاذ" /></SelectTrigger>
              <SelectContent>
                {user && <SelectItem value={user.id}>جدولي أنا</SelectItem>}
                {(teachers ?? []).filter((x) => x.id !== user?.id).map((x) => (
                  <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filterId && <Badge variant="secondary">الحجم الساعي الأسبوعي: {weeklyHours.toFixed(1)} سا</Badge>}
          <div className="ms-auto flex flex-wrap gap-2">
            {canEdit && (
              <Button onClick={() => setForm(emptyForm(classId, mode === "teacher" ? teacherId : ""))}>
                <Plus className="h-4 w-4" /> {t("sched.add_slot")}
              </Button>
            )}
            {canEdit && mode === "class" && classId && (slots ?? []).length > 0 && (
              <div className="flex gap-1">
                <Select value={copyTarget} onValueChange={setCopyTarget}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="نسخ إلى قسم..." /></SelectTrigger>
                  <SelectContent>
                    {(classes ?? []).filter((c) => c.id !== classId).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" aria-label="نسخ" disabled={!copyTarget} onClick={copySchedule}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!filterId ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">اختر قسماً أو أستاذاً لعرض الجدول.</CardContent></Card>
      ) : (
        <Tabs defaultValue="grid">
          <TabsList>
            <TabsTrigger value="grid">الجدول الأسبوعي</TabsTrigger>
            {mode === "class" && <TabsTrigger value="homework">{t("st.tab_homework")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="grid" className="mt-4">
            {times.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("common.no_data")}</CardContent></Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border p-2 text-start">التوقيت</th>
                      {DAYS.map((d) => <th key={d.wd} className="border p-2">{d.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {times.map((key) => {
                      const [st, en] = key.split("-");
                      return (
                        <tr key={key}>
                          <td className="whitespace-nowrap border p-2 font-mono text-xs">{fmtTime(st!)}–{fmtTime(en!)}</td>
                          {DAYS.map((d) => {
                            const cell = (slots ?? []).filter(
                              (s) => s.weekday === d.wd && s.start_time === st && s.end_time === en,
                            );
                            return (
                              <td key={d.wd} className="border p-1 align-top">
                                {cell.map((s) => (
                                  <div
                                    key={s.id}
                                    className={`mb-1 rounded-md border bg-primary/5 p-2 ${s.is_active ? "" : "opacity-40 line-through"}`}
                                  >
                                    <p className="font-medium">{s.subject}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {mode === "class" ? teacherName(s.teacher_id) : s.classes?.name}
                                      {s.room ? ` · ${s.room}` : ""}
                                      {s.group_label !== "all" ? ` · ${GROUPS[s.group_label]}` : ""}
                                    </p>
                                    {canEdit && (
                                      <div className="mt-1 flex gap-1">
                                        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="تعديل"
                                          onClick={() => setForm({
                                            id: s.id, class_id: s.class_id, teacher_id: s.teacher_id ?? "",
                                            subject: s.subject, weekday: String(s.weekday),
                                            start: fmtTime(s.start_time), end: fmtTime(s.end_time),
                                            room: s.room ?? "", period_no: s.period_no ? String(s.period_no) : "",
                                            group_label: s.group_label, note: s.note ?? "",
                                          })}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => toggleActive(s)}>
                                          {s.is_active ? "إيقاف" : "تفعيل"}
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("common.delete")} onClick={() => remove(s.id)}>
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          {mode === "class" && (
            <TabsContent value="homework" className="mt-4">
              <HomeworkPanel classId={classId} userId={user?.id ?? null} />
            </TabsContent>
          )}
        </Tabs>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? "تعديل حصة" : t("sched.add_slot")}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger><SelectValue placeholder="القسم" /></SelectTrigger>
                <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.teacher_id || "none"} onValueChange={(v) => setForm({ ...form, teacher_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="الأستاذ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون أستاذ</SelectItem>
                  {(teachers ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder={t("sched.subject")} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <Select value={form.weekday} onValueChange={(v) => setForm({ ...form, weekday: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d) => <SelectItem key={d.wd} value={String(d.wd)}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
              <label className="text-xs text-muted-foreground">البداية<Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
              <label className="text-xs text-muted-foreground">النهاية<Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
              <Input placeholder={t("sched.room")} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
              <Input type="number" min={1} max={10} placeholder="رقم الحصة" value={form.period_no} onChange={(e) => setForm({ ...form, period_no: e.target.value })} />
              <Select value={form.group_label} onValueChange={(v) => setForm({ ...form, group_label: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(GROUPS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="ملاحظة" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>إلغاء</Button>
            <Button onClick={save}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HomeworkPanel({ classId, userId }: { classId: string; userId: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [s, setS] = useState({ subject: "", title: "", desc: "", due: "" });
  const { data: homework } = useQuery({
    queryKey: ["homework-admin", classId],
    queryFn: async () =>
      (await supabase.from("homework").select("id, subject, title, description, due_date").eq("class_id", classId).order("due_date")).data ?? [],
  });
  const add = async () => {
    if (!s.title.trim() || !s.subject.trim()) return;
    const { error } = await supabase.from("homework").insert({
      class_id: classId, teacher_id: userId, subject: s.subject.trim(), title: s.title.trim(),
      description: s.desc.trim() || null, due_date: s.due || null,
    });
    if (error) return toast.error(error.message);
    setS({ subject: s.subject, title: "", desc: "", due: "" });
    toast.success(t("sched.homework_added"));
    qc.invalidateQueries({ queryKey: ["homework-admin", classId] });
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("homework").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["homework-admin", classId] });
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t("sched.add_homework")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder={t("sched.subject")} value={s.subject} onChange={(e) => setS({ ...s, subject: e.target.value })} />
            <Input placeholder={t("sched.title")} value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} />
            <Input type="date" value={s.due} onChange={(e) => setS({ ...s, due: e.target.value })} />
          </div>
          <Textarea placeholder={t("sched.details")} value={s.desc} onChange={(e) => setS({ ...s, desc: e.target.value })} />
          <Button onClick={add} disabled={!s.title.trim() || !s.subject.trim()}><Plus className="h-4 w-4" /> {t("common.add")}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6">
          {(homework ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>}
          {(homework ?? []).map((h) => (
            <div key={h.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium">{h.title}<span className="ms-2 text-xs text-muted-foreground">{h.subject}</span></p>
                {h.description && <p className="text-sm text-muted-foreground">{h.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{h.due_date ?? "—"}</Badge>
                <Button size="icon" variant="ghost" aria-label={t("common.delete")} onClick={() => del(h.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
