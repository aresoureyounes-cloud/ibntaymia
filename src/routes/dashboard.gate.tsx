import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const cardUidSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "card_uid format");
const visitorNameSchema = z.string().trim().min(2).max(120);
const noteSchema = z.string().trim().max(500);
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
  Clock,
  UserPlus,
  AlertTriangle,
  ShieldCheck,
  Circle,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { useAuth } from "@/lib/use-auth";
import { RfidScannerInput } from "@/components/RfidScannerInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { HandDrawnStar } from "@/components/HandDrawnStar";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/dashboard/gate")({
  component: GatePage,
});

type ScanMode = "normal" | "late" | "visitor" | "warning" | "exceptional" | "denied";

type ModeMeta = {
  id: ScanMode;
  label: string;
  desc: string;
  light: string; // tailwind bg color for the light
  border: string;
  icon: LucideIcon;
};

const MODES: ModeMeta[] = [
  {
    id: "normal",
    label: "عادي",
    desc: "دخول/خروج اعتيادي",
    light: "bg-green-500",
    border: "border-green-500",
    icon: CheckCircle2,
  },
  {
    id: "late",
    label: "متأخر",
    desc: "تسجيل تأخر + إشعار الأستاذ",
    light: "bg-orange-500",
    border: "border-orange-500",
    icon: Clock,
  },
  {
    id: "visitor",
    label: "زائر / ولي",
    desc: "شخص من خارج المؤسسة",
    light: "bg-blue-500",
    border: "border-blue-500",
    icon: UserPlus,
  },
  {
    id: "warning",
    label: "تنبيه",
    desc: "إضافة تنبيه إلى ملف التلميذ",
    light: "bg-yellow-500",
    border: "border-yellow-500",
    icon: AlertTriangle,
  },
  {
    id: "exceptional",
    label: "استثنائي",
    desc: "دخول/خروج بترخيص خاص",
    light: "bg-purple-500",
    border: "border-purple-500",
    icon: ShieldCheck,
  },
  {
    id: "denied",
    label: "رفض",
    desc: "منع الدخول/الخروج",
    light: "bg-red-600",
    border: "border-red-600",
    icon: XCircle,
  },
];

type RecentScan = {
  id: string;
  card_uid: string;
  direction: string;
  scanned_at: string;
  mode: string | null;
  note: string | null;
  visitor_name: string | null;
  students: { full_name: string; classes: { name: string } | null } | null;
};

type LookupResult = {
  ok: boolean;
  mode: ScanMode;
  card_uid: string;
  student_name?: string;
  class_name?: string;
  status?: string;
  reason?: string;
};

function GatePage() {
  useRealtimeTable("card_scans", ["card_scans_recent"]);
  const { user } = useAuth();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [mode, setMode] = useState<ScanMode>("normal");
  const [lastResult, setLastResult] = useState<LookupResult | null>(null);
  const [manualUid, setManualUid] = useState("");
  const [note, setNote] = useState("");
  const [visitorName, setVisitorName] = useState("");

  const currentMode = useMemo(() => MODES.find((m) => m.id === mode) ?? MODES[0], [mode]);

  const { data: recent } = useQuery({
    queryKey: ["card_scans_recent"],
    queryFn: async (): Promise<RecentScan[]> => {
      const { data, error } = await supabase
        .from("card_scans")
        .select(
          "id, card_uid, direction, scanned_at, mode, note, visitor_name, students(full_name, classes(name))",
        )
        .order("scanned_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown as RecentScan[]) ?? [];
    },
  });

  // Auto-clear the big result card after 5s
  useEffect(() => {
    if (!lastResult) return;
    const t = window.setTimeout(() => setLastResult(null), 5000);
    return () => window.clearTimeout(t);
  }, [lastResult]);

  const sendLateNotifications = async (studentId: string, studentName: string, reason: string) => {
    // Find the student's class and any teacher who has a session today for that class
    const today = new Date().toISOString().slice(0, 10);
    const { data: student } = await supabase
      .from("students")
      .select("class_id")
      .eq("id", studentId)
      .maybeSingle();

    if (!student?.class_id) return { sessions: 0, teachers: 0 };

    const { data: sessions } = await supabase
      .from("attendance_sessions")
      .select("id, teacher_id, subject")
      .eq("class_id", student.class_id)
      .eq("session_date", today);

    const sessionList = sessions ?? [];
    const teachers = Array.from(new Set(sessionList.map((s) => s.teacher_id).filter(Boolean)));

    // 1) Mark the student as LATE/BLOCKED in every today's session
    if (sessionList.length > 0) {
      const attendanceRows = sessionList.map((s) => ({
        session_id: s.id,
        student_id: studentId,
        status: "late",
        note: reason
          ? `وصل متأخراً عبر البوابة — ${reason}`
          : "وصل متأخراً عبر البوابة (ممنوع من حضور الحصة حتى التبرير)",
      }));
      await supabase.from("attendance_records").upsert(attendanceRows, {
        onConflict: "session_id,student_id",
      } as never);
    }

    // 2) Push an in-app notification to every concerned teacher
    if (teachers.length > 0) {
      const rows = teachers.map((tid) => ({
        recipient_id: tid,
        recipient_label: "teacher",
        title: `🟠 تأخر التلميذ ${studentName}`,
        body: reason
          ? `سُجِّل متأخراً ومُنع من حضور الحصة. السبب: ${reason}`
          : "سُجِّل متأخراً عند البوابة ومُنع من حضور الحصة حتى التبرير.",
        channel: "inapp",
        status: "sent",
        related_student_id: studentId,
        created_by: user?.id ?? null,
      }));
      await supabase.from("notifications").insert(rows);
    }

    // 3) Trace the reason in the student's behavior history
    await supabase.from("behavior_records").insert({
      student_id: studentId,
      title: "تأخر عن الحصة",
      note: reason || "تأخر مسجَّل عند البوابة — في انتظار التبرير.",
      record_type: "negative",
      points: 0,
      recorded_by: user?.id ?? null,
    });

    return { sessions: sessionList.length, teachers: teachers.length };
  };

  const addWarningBehavior = async (studentId: string, reason: string) => {
    await supabase.from("behavior_records").insert({
      student_id: studentId,
      title: "تنبيه من البوابة",
      note: reason || "تنبيه مسجّل من طرف الحارس عند البوابة.",
      record_type: "negative",
      points: -1,
      recorded_by: user?.id ?? null,
    });
  };

  const insertScan = async (params: {
    card_uid: string;
    student_id: string | null;
    mode: ScanMode;
    note: string | null;
    visitor_name: string | null;
  }) => {
    const { error } = await supabase.from("card_scans").insert({
      card_uid: params.card_uid,
      student_id: params.student_id,
      direction,
      mode: params.mode,
      note: params.note,
      visitor_name: params.visitor_name,
      scanned_by: user?.id ?? null,
    });
    return error;
  };

  const handleScan = async (uid: string) => {
    // Validate the note for every mode that accepts free text
    const noteParsed = noteSchema.safeParse(note);
    if (!noteParsed.success) {
      toast.error("الملاحظة طويلة جدًا (الحدّ 500 حرف)");
      return;
    }
    const cleanNote = noteParsed.data || null;

    // VISITOR mode: log a scan without a card lookup
    if (mode === "visitor") {
      const vParsed = visitorNameSchema.safeParse(visitorName || "زائر بدون اسم");
      if (!vParsed.success) {
        toast.error("اسم الزائر غير صالح");
        return;
      }
      const err = await insertScan({
        card_uid: uid || `VISITOR-${Date.now()}`,
        student_id: null,
        mode: "visitor",
        note: cleanNote,
        visitor_name: vParsed.data,
      });
      if (err) {
        toast.error(err.message);
        return;
      }
      setLastResult({
        ok: true,
        mode: "visitor",
        card_uid: uid || "—",
        student_name: vParsed.data,
      });
      setVisitorName("");
      setNote("");
      return;
    }

    // Validate card UID for non-visitor scans
    const uidParsed = cardUidSchema.safeParse(uid);
    if (!uidParsed.success) {
      toast.error("رقم البطاقة غير صالح");
      return;
    }

    // All other modes: look up the card
    const { data: card } = await supabase
      .from("rfid_cards")
      .select("card_uid, status, student_id, students(full_name, classes(name))")
      .eq("card_uid", uidParsed.data)
      .maybeSingle();

    if (!card) {
      setLastResult({
        ok: false,
        mode: "denied",
        card_uid: uid,
        reason: "بطاقة غير مسجّلة",
      });
      await insertScan({
        card_uid: uid,
        student_id: null,
        mode: "denied",
        note: "بطاقة غير معروفة",
        visitor_name: null,
      });
      return;
    }

    const c = card as unknown as {
      card_uid: string;
      status: string;
      student_id: string | null;
      students: { full_name: string; classes: { name: string } | null } | null;
    };

    if (c.status !== "active") {
      setLastResult({
        ok: false,
        mode: "denied",
        card_uid: uid,
        student_name: c.students?.full_name,
        class_name: c.students?.classes?.name,
        reason: "البطاقة معطّلة",
      });
      await insertScan({
        card_uid: uid,
        student_id: c.student_id,
        mode: "denied",
        note: "بطاقة معطّلة",
        visitor_name: null,
      });
      return;
    }

    const err = await insertScan({
      card_uid: uid,
      student_id: c.student_id,
      mode,
      note: note.trim() || null,
      visitor_name: null,
    });
    if (err) {
      toast.error(err.message);
      return;
    }

    await supabase
      .from("rfid_cards")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("card_uid", uid);

    // Side-effects per mode
    if (c.student_id) {
      if (mode === "late") {
        const r = await sendLateNotifications(
          c.student_id,
          c.students?.full_name ?? "تلميذ",
          note.trim(),
        );
        toast.success(`سُجِّل متأخراً ومُنع من ${r.sessions} حصة — أُشعر ${r.teachers} أستاذ`);
      } else if (mode === "warning") {
        await addWarningBehavior(c.student_id, note.trim());
        toast.success("تم إضافة التنبيه إلى ملف التلميذ");
      }
    }

    setLastResult({
      ok: true,
      mode,
      card_uid: uid,
      student_name: c.students?.full_name ?? "بطاقة موظف",
      class_name: c.students?.classes?.name,
    });
    setNote("");
  };

  const resultMeta = lastResult ? (MODES.find((m) => m.id === lastResult.mode) ?? MODES[0]) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-primary"><HandDrawnStar size={36} /></span>
          <div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">
              <span className="underline-sketch">نقطة المراقبة — البوابة</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              اختر الوضع والاتجاه ثم مرّر البطاقة أو أدخل رقمها يدوياً
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={direction === "in" ? "default" : "outline"}
            onClick={() => setDirection("in")}
            size="lg"
          >
            <ArrowRight className="me-2 h-4 w-4" /> دخول
          </Button>
          <Button
            variant={direction === "out" ? "default" : "outline"}
            onClick={() => setDirection("out")}
            size="lg"
          >
            <ArrowLeft className="me-2 h-4 w-4" /> خروج
          </Button>
        </div>
      </div>

      {/* Traffic light row */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">وضع المسح</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-center transition ${
                    active ? `${m.border} bg-muted shadow` : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-4 w-4 rounded-full ${m.light} ${
                        active ? "ring-2 ring-offset-2 ring-foreground/30" : "opacity-60"
                      }`}
                    />
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-[11px] leading-tight text-muted-foreground">{m.desc}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <RfidScannerInput onScan={handleScan} />

      {/* Contextual inputs */}
      <Card className={`border-2 ${currentMode.border}`}>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-2 text-sm">
            <Circle
              className={`h-3 w-3 fill-current ${currentMode.light.replace("bg-", "text-")}`}
            />
            <span className="font-medium">الوضع الحالي: {currentMode.label}</span>
          </div>

          {mode === "visitor" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="visitor-name">اسم الزائر</Label>
                <Input
                  id="visitor-name"
                  value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  placeholder="مثال: ولي التلميذ فلان..."
                />
              </div>
              <div>
                <Label htmlFor="visitor-uid">رقم وثيقة الزائر (اختياري)</Label>
                <Input
                  id="visitor-uid"
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  placeholder="رقم بطاقة الهوية..."
                  className="ltr"
                />
              </div>
            </div>
          )}

          {(mode === "late" ||
            mode === "warning" ||
            mode === "exceptional" ||
            mode === "denied") && (
            <div>
              <Label htmlFor="note">
                {mode === "late" && "سبب التأخر (سيُرسل للأستاذ)"}
                {mode === "warning" && "سبب التنبيه (يُحفظ في سجل التلميذ)"}
                {mode === "exceptional" && "سبب الدخول الاستثنائي"}
                {mode === "denied" && "سبب الرفض"}
              </Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اكتب السبب أو الملاحظة هنا..."
                rows={2}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="إدخال يدوي لرقم البطاقة (في حال نسيانها)..."
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              className="ltr max-w-xs"
            />
            <Button
              onClick={() => {
                const uid = manualUid.trim();
                if (mode === "visitor" || uid) {
                  handleScan(uid);
                  setManualUid("");
                } else {
                  toast.error("أدخل رقم البطاقة أولاً");
                }
              }}
            >
              <Zap className="me-2 h-4 w-4" /> تسجيل
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Big result */}
      {lastResult && resultMeta && (
        <Card className={`border-4 ${resultMeta.border}`}>
          <CardContent className="flex items-center gap-6 py-8">
            <div className="flex flex-col items-center gap-2">
              <span
                className={`inline-block h-20 w-20 animate-pulse rounded-full ${resultMeta.light} shadow-lg`}
              />
              <Badge variant={lastResult.ok ? "default" : "destructive"} className="text-base">
                {resultMeta.label}
              </Badge>
            </div>
            <div className="flex-1">
              <p className="text-3xl font-bold md:text-4xl">
                {lastResult.student_name ?? "غير معروف"}
              </p>
              {lastResult.class_name && (
                <p className="mt-1 text-lg text-muted-foreground md:text-xl">
                  {lastResult.class_name}
                </p>
              )}
              {lastResult.reason && (
                <p className="mt-2 text-base font-medium text-destructive md:text-lg">
                  {lastResult.reason}
                </p>
              )}
              <p className="mt-3 font-mono text-sm text-muted-foreground ltr">
                {lastResult.card_uid}
              </p>
            </div>
            <Badge variant="outline" className="px-3 py-2 text-base">
              {direction === "in" ? "دخول" : "خروج"}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>آخر القراءات (مباشر)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(recent ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد قراءات بعد</p>
            )}
            {(recent ?? []).map((s) => {
              const m = MODES.find((x) => x.id === (s.mode as ScanMode)) ?? MODES[0];
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className={`inline-block h-3 w-3 rounded-full ${m.light}`} />
                    {s.direction === "in" ? (
                      <ArrowRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowLeft className="h-4 w-4 text-amber-600" />
                    )}
                    <div>
                      <p className="font-medium">
                        {s.students?.full_name ?? s.visitor_name ?? (
                          <span className="italic text-muted-foreground">بطاقة غير معروفة</span>
                        )}
                      </p>
                      <p className="ltr text-xs text-muted-foreground">{s.card_uid}</p>
                      {s.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">ملاحظة: {s.note}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-end">
                    <Badge variant="outline" className="text-xs">
                      {m.label}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {s.students?.classes?.name ?? ""}
                    </p>
                    <p className="ltr text-xs text-muted-foreground">
                      {new Date(s.scanned_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
