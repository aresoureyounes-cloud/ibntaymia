import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  Clock,
  FileSpreadsheet,
  FileText,
  Lock,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { exportToExcel, exportToPdf } from "@/lib/export-utils";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HandDrawnStar } from "@/components/HandDrawnStar";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/dashboard/attendance")({
  component: AttendancePage,
});

type Status = "present" | "absent" | "late" | "excused";
type SessionType = "regular" | "replacement" | "extra";
type SlotRow = {
  id: string;
  class_id: string;
  teacher_id: string | null;
  subject: string;
  start_time: string;
  period_no: number | null;
  classes: { name: string } | null;
};
type ClassRow = { id: string; name: string; level: string | null };
type Student = { id: string; full_name: string };
type SessionRow = {
  id: string;
  class_id: string;
  session_date: string;
  period: string | null;
  subject: string | null;
  classes: { name: string } | null;
};
type ExistingRecord = {
  student_id: string;
  status: Status;
  justified_at: string | null;
  justification_note: string | null;
};

const STATUS_META: Record<Status, { label: string; tone: string }> = {
  present: { label: "حاضر", tone: "bg-primary/15 text-primary border-primary/30" },
  absent: { label: "غائب", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  late: { label: "متأخر", tone: "bg-accent/20 text-accent-foreground border-accent/40" },
  excused: { label: "بعذر", tone: "bg-muted text-muted-foreground border-border" },
};

function AttendancePage() {
  useRealtimeTable("attendance_sessions", ["att_sessions"]);
  useRealtimeTable("attendance_records", ["att_records"]);
  const qc = useQueryClient();
  const { user, hasRole } = useAuth();
  const canOverrideLate =
    hasRole("teacher") || hasRole("admin") || hasRole("director") || hasRole("supervisor");

  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState<string>("1");
  const [subject, setSubject] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [existing, setExisting] = useState<Record<string, ExistingRecord>>({});
  const [justifyTarget, setJustifyTarget] = useState<{ studentId: string; name: string } | null>(
    null,
  );
  const [justifyNote, setJustifyNote] = useState("");
  const [search, setSearch] = useState("");
  const [slotId, setSlotId] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>("regular");
  const weekday = new Date(date + "T12:00:00").getDay();

  const { data: mySlots } = useQuery({
    queryKey: ["my-slots", user?.id, weekday],
    enabled: !!user,
    queryFn: async (): Promise<SlotRow[]> => {
      const { data } = await supabase
        .from("schedule_slots")
        .select("id, class_id, teacher_id, subject, start_time, period_no, classes(name)")
        .eq("teacher_id", user!.id)
        .eq("weekday", weekday)
        .eq("is_active" as never, true as never)
        .order("start_time");
      return (data as unknown as SlotRow[]) ?? [];
    },
  });

  const { data: classSlots } = useQuery({
    queryKey: ["class-slots", classId, weekday],
    enabled: !!classId,
    queryFn: async (): Promise<SlotRow[]> => {
      const { data } = await supabase
        .from("schedule_slots")
        .select("id, class_id, teacher_id, subject, start_time, period_no, classes(name)")
        .eq("class_id", classId)
        .eq("weekday", weekday)
        .eq("is_active" as never, true as never)
        .order("start_time");
      return (data as unknown as SlotRow[]) ?? [];
    },
  });

  const pickSlot = (s: SlotRow) => {
    setSlotId(s.id);
    setClassId(s.class_id);
    setSubject(s.subject);
    if (s.period_no) setPeriod(String(s.period_no));
    setSessionType(s.teacher_id && s.teacher_id !== user?.id ? "replacement" : "regular");
  };

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, level")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-of-class", classId],
    enabled: !!classId,
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name")
        .eq("class_id", classId)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["att_sessions"],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data, error } = await supabase
        .from("attendance_sessions")
        .select("id, class_id, session_date, period, subject, classes(name)")
        .order("session_date", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data as unknown as SessionRow[]) ?? [];
    },
  });

  // Load existing records (e.g. late marks pushed by the gate) for the active session
  const loadExisting = async (sessionId: string) => {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("student_id, status, justified_at, justification_note")
      .eq("session_id", sessionId);
    if (error) return;
    const map: Record<string, ExistingRecord> = {};
    (data ?? []).forEach((r) => {
      map[r.student_id] = r as ExistingRecord;
    });
    setExisting(map);
  };

  useEffect(() => {
    if (activeSessionId) loadExisting(activeSessionId);
  }, [activeSessionId]);

  const isLocked = (studentId: string) => {
    if (canOverrideLate) return false;
    const r = existing[studentId];
    return r?.status === "late" && !r.justified_at;
  };

  const [duplicate, setDuplicate] = useState<{
    id: string;
    className: string | null;
    subject: string | null;
    count: number;
  } | null>(null);

  const openSession = async (sessionId: string, isExisting: boolean) => {
    setActiveSessionId(sessionId);
    const next: Record<string, Status> = {};
    (students ?? []).forEach((s) => (next[s.id] = "present"));
    const { data: prev } = await supabase
      .from("attendance_records")
      .select("student_id, status")
      .eq("session_id", sessionId);
    (prev ?? []).forEach((r) => {
      next[r.student_id] = r.status as Status;
    });
    setMarks(next);
    toast.success(isExisting ? "تم فتح السجل الموجود للتعديل" : "تم فتح جلسة جديدة");
  };

  const startSession = async () => {
    if (!classId || !user) return toast.error("اختر القسم أولاً");

    // Check for an existing record for the same class/date/period before creating one.
    const { data: found, error: findErr } = await supabase
      .from("attendance_sessions")
      .select("id, subject, classes(name)")
      .eq("class_id", classId)
      .eq("session_date", date)
      .eq("period", period)
      .limit(1)
      .maybeSingle();
    if (findErr) return toast.error(findErr.message);

    if (found) {
      const { count } = await supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("session_id", found.id);
      setDuplicate({
        id: found.id,
        className: (found as { classes?: { name?: string } | null }).classes?.name ?? null,
        subject: found.subject ?? null,
        count: count ?? 0,
      });
      return;
    }

    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        class_id: classId,
        teacher_id: user.id,
        session_date: date,
        period,
        subject: subject || null,
        slot_id: slotId,
        session_type: sessionType,
      } as never)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    await openSession(data.id, false);
  };

  const markAll = (status: Status) => {
    setMarks(() => {
      const next: Record<string, Status> = {};
      (students ?? []).forEach((s) => {
        if (!isLocked(s.id)) next[s.id] = status;
      });
      return next;
    });
  };

  const saveSession = async () => {
    if (!activeSessionId) return;
    const allRows = Object.entries(marks).map(([student_id, status]) => ({
      session_id: activeSessionId,
      student_id,
      status,
    }));
    // Skip students whose current record is "late" and not yet justified
    const rows = allRows.filter((r) => !isLocked(r.student_id));
    const skipped = allRows.length - rows.length;

    if (rows.length > 0) {
      const { error } = await supabase
        .from("attendance_records")
        .upsert(rows, { onConflict: "session_id,student_id" });
      if (error) return toast.error(error.message);
    }

    const flagged = rows.filter((r) => r.status === "absent" || r.status === "late");
    if (flagged.length > 0) {
      const notes = flagged.map((r) => {
        const stu = (students ?? []).find((s) => s.id === r.student_id);
        return {
          recipient_id: null,
          recipient_label: `ولي أمر: ${stu?.full_name ?? "—"}`,
          title: r.status === "absent" ? "إشعار غياب" : "إشعار تأخر",
          body: `سُجِّل ${r.status === "absent" ? "غياب" : "تأخر"} الابن/الابنة ${stu?.full_name ?? ""} بتاريخ ${date}.`,
          channel: "sms",
          status: "simulated",
          related_student_id: r.student_id,
          created_by: user?.id ?? null,
        };
      });
      await supabase.from("notifications").insert(notes);
    }

    let msg = `تم حفظ ${rows.length} تسجيلة`;
    if (flagged.length) msg += ` — ${flagged.length} إشعار محاكاة`;
    if (skipped) msg += ` — تم تجاهل ${skipped} متأخر بدون تبرير`;
    toast.success(msg);
    setActiveSessionId(null);
    setMarks({});
    setExisting({});
    qc.invalidateQueries({ queryKey: ["att_sessions"] });
  };

  const submitJustify = async () => {
    if (!justifyTarget || !activeSessionId) return;
    if (!justifyNote.trim()) return toast.error("اكتب سبب التبرير");
    const { error } = await supabase
      .from("attendance_records")
      .update({
        justified_at: new Date().toISOString(),
        justified_by: user?.id ?? null,
        justification_note: justifyNote.trim(),
      })
      .eq("session_id", activeSessionId)
      .eq("student_id", justifyTarget.studentId);
    if (error) return toast.error(error.message);
    toast.success("تم تبرير التأخر — يمكنك الآن تعديل الحالة");
    setJustifyTarget(null);
    setJustifyNote("");
    await loadExisting(activeSessionId);
  };

  const visibleStudents = useMemo(
    () =>
      (students ?? []).filter((s) =>
        search.trim() ? s.full_name.includes(search.trim()) : true,
      ),
    [students, search],
  );

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(marks).forEach((s) => (c[s] += 1));
    return c;
  }, [marks]);

  const lockedCount = useMemo(
    () => (students ?? []).filter((s) => isLocked(s.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, existing],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-primary"><HandDrawnStar size={36} /></span>
          <div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">
              <span className="underline-sketch">تسجيل الحضور</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              افتح جلسة لأي قسم (حصتك، استخلاف، أو حصة إضافية)، وأعد فتحها لتصحيح أي خطأ
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!sessions?.length}
            onClick={() =>
              exportToExcel(
                "attendance-sessions",
                (sessions ?? []).map((s) => ({
                  التاريخ: s.session_date,
                  القسم: s.classes?.name ?? "",
                  الحصة: s.period ?? "",
                  المادة: s.subject ?? "",
                })),
              )
            }
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!sessions?.length}
            onClick={() =>
              exportToPdf(
                "attendance-sessions",
                "Attendance Sessions",
                ["Date", "Class", "Period", "Subject"],
                (sessions ?? []).map((s) => [
                  s.session_date,
                  s.classes?.name ?? "",
                  s.period ?? "",
                  s.subject ?? "",
                ]),
              )
            }
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {!activeSessionId && (
        <Card className="cinema-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" /> جلسة جديدة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(mySlots ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">حصصي في هذا اليوم حسب جدول التوقيت:</p>
                <div className="flex flex-wrap gap-2">
                  {(mySlots ?? []).map((s) => (
                    <Button
                      key={s.id}
                      size="sm"
                      variant={slotId === s.id ? "default" : "outline"}
                      onClick={() => pickSlot(s)}
                    >
                      {s.start_time.slice(0, 5)} · {s.classes?.name ?? ""} · {s.subject}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-6">
            <Select value={classId} onValueChange={(v) => { setClassId(v); setSlotId(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlotId(null); }} />
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue placeholder="الحصة" />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4", "5", "6", "7", "8"].map((p) => (
                  <SelectItem key={p} value={p}>
                    الحصة {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="المادة (اختياري)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">حصة عادية</SelectItem>
                <SelectItem value="replacement">استخلاف</SelectItem>
                <SelectItem value="extra">حصة إضافية</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={startSession} disabled={!classId}>
              <Clock className="me-2 h-4 w-4" /> فتح
            </Button>
            </div>
            {classId && (classSlots ?? []).length > 0 && !slotId && (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>حصص هذا القسم في هذا اليوم:</span>
                {(classSlots ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="rounded border px-2 py-0.5 hover:bg-muted"
                    onClick={() => pickSlot(s)}
                  >
                    {s.start_time.slice(0, 5)} {s.subject}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeSessionId && (
        <Card className="cinema-shadow">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>تأشير الحضور — {students?.length ?? 0} تلميذ</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <Badge className={STATUS_META.present.tone}>حاضر {counts.present}</Badge>
              <Badge className={STATUS_META.absent.tone}>غائب {counts.absent}</Badge>
              <Badge className={STATUS_META.late.tone}>متأخر {counts.late}</Badge>
              <Badge className={STATUS_META.excused.tone}>بعذر {counts.excused}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {lockedCount > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-sm">
                <Lock className="mt-0.5 h-4 w-4 text-orange-500" />
                <div>
                  <p className="font-semibold">{lockedCount} تلميذ مقفل بحالة "متأخر"</p>
                  <p className="text-muted-foreground">
                    تمّ تسجيله من طرف الحارس. لا يمكن تغيير حالته إلى حاضر/غائب قبل تبرير التأخر —
                    اضغط زر "تبرير" أمام التلميذ.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button size="sm" variant="outline" onClick={() => markAll("present")}>
                الكل حاضر
              </Button>
              <Button size="sm" variant="outline" onClick={() => markAll("absent")}>
                الكل غائب
              </Button>
              <Input
                placeholder="بحث عن تلميذ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full sm:w-56"
              />
            </div>

            {visibleStudents.map((s) => {
              const cur = marks[s.id] ?? "present";
              const locked = isLocked(s.id);
              const ex = existing[s.id];
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-md border bg-card px-3 py-2 ${locked ? "border-orange-500/40" : "border-border"}`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{s.full_name}</span>
                    {locked && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">
                        مقفل: تأخر مسجَّل من البوابة، يستوجب التبرير قبل التعديل
                      </span>
                    )}
                    {ex?.justified_at && (
                      <span className="text-xs text-muted-foreground">
                        مبرَّر: {ex.justification_note ?? "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {locked ? (
                      <>
                        <Badge className={STATUS_META.late.tone}>متأخر — مقفل</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setJustifyTarget({ studentId: s.id, name: s.full_name });
                            setJustifyNote("");
                          }}
                        >
                          <ShieldCheck className="me-1 h-3.5 w-3.5" /> تبرير
                        </Button>
                      </>
                    ) : (
                      (["present", "late", "absent", "excused"] as Status[]).map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant={cur === st ? "default" : "ghost"}
                          onClick={() => setMarks((m) => ({ ...m, [s.id]: st }))}
                          className="h-8"
                        >
                          {STATUS_META[st].label}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-end gap-2 pt-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setActiveSessionId(null);
                  setMarks({});
                  setExisting({});
                }}
              >
                <X className="me-2 h-4 w-4" /> إلغاء
              </Button>
              <Button onClick={saveSession}>
                <Save className="me-2 h-4 w-4" /> حفظ الجلسة
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> الجلسات الأخيرة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(sessions ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد جلسات بعد.</p>
          )}
          <div className="space-y-2">
            {(sessions ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{s.classes?.name ?? "—"}</span>
                <span className="text-muted-foreground">
                  {s.session_date} · حصة {s.period ?? "—"} {s.subject ? `· ${s.subject}` : ""}
                </span>
                <Check className="h-4 w-4 text-primary" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!justifyTarget} onOpenChange={(o) => !o && setJustifyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تبرير تأخر — {justifyTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              اكتب سبب التبرير. بعد الحفظ تستطيع تعديل حالة الحضور.
            </p>
            <Textarea
              value={justifyNote}
              onChange={(e) => setJustifyNote(e.target.value)}
              placeholder="مثال: قدّم ورقة طبية، عذر مقبول من ولي الأمر…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setJustifyTarget(null)}>
              إلغاء
            </Button>
            <Button onClick={submitJustify}>
              <ShieldCheck className="me-2 h-4 w-4" /> حفظ التبرير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicate} onOpenChange={(o) => !o && setDuplicate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>يوجد تسجيل حضور سابق لهذه الحصة</DialogTitle>
          </DialogHeader>
          {duplicate && (
            <div className="space-y-1 text-sm">
              <p>
                القسم: <b>{duplicate.className ?? "—"}</b> · التاريخ:{" "}
                <span className="ltr">{date}</span> · الحصة: {period}
              </p>
              <p>المادة: {duplicate.subject ?? "—"}</p>
              <p>عدد التلاميذ المسجلين: {duplicate.count}</p>
              <p className="text-muted-foreground">
                لا يمكن إنشاء سجل ثانٍ لنفس القسم والحصة. افتح السجل الموجود لتعديله.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDuplicate(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                const id = duplicate!.id;
                setDuplicate(null);
                void openSession(id, true);
              }}
            >
              فتح السجل الموجود للتعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
