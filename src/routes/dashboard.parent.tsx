import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarPlus,
  ClipboardList,
  FileText,
  HandCoins,
  Megaphone,
  Phone,
  Printer,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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

export const Route = createFileRoute("/dashboard/parent")({
  component: ParentDashboard,
  head: () => ({
    meta: [
      { title: "بوابة الولي — إداروم" },
      {
        name: "description",
        content:
          "بوابة ولي الأمر: متابعة أبناءك، تبرير الغياب، طلب مقابلة، الواجبات والاختبارات القادمة، والتقرير الشهري.",
      },
      { property: "og:title", content: "بوابة الولي — إداروم" },
      {
        property: "og:description",
        content: "متابعة أبنائك وتبرير الغياب وطلب مقابلات من مكان واحد.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Child = {
  id: string;
  full_name: string;
  class_id: string | null;
  classes: { name: string } | null;
};

type AttRow = {
  id: string;
  status: string;
  justified_at: string | null;
  attendance_sessions: { session_date: string; subject: string | null } | null;
};

const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const inDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function ParentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  useRealtimeTable("notifications", ["parent-notif"]);
  useRealtimeTable("attendance_records", ["child-att"]);
  useRealtimeTable("absence_justifications", ["child-justif"]);
  useRealtimeTable("meeting_requests", ["parent-meetings"]);

  // ---- children ----
  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ["parent-children", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("parent_student")
        .select("student_id, students(id, full_name, class_id, classes(name))")
        .eq("parent_user_id", user.id);
      if (error) throw error;
      type Row = {
        students: Child | null;
      };
      return ((data ?? []) as unknown as Row[])
        .map((r) => r.students)
        .filter((s): s is Child => Boolean(s));
    },
  });

  const [childId, setChildId] = useState<string | undefined>();
  const selected = children?.find((s) => s.id === childId);

  // ---- attendance last 30 days ----
  const { data: attendance } = useQuery({
    queryKey: ["child-att", childId],
    enabled: !!childId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, justified_at, attendance_sessions(session_date, subject)")
        .eq("student_id", childId!)
        .gte("attendance_sessions.session_date", daysAgoISO(30))
        .lte("attendance_sessions.session_date", todayISO())
        .order("attendance_sessions.session_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as AttRow[]) ?? [];
    },
  });

  const stats = useMemo(() => {
    const rows = attendance ?? [];
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    rows.forEach((r) => {
      if (r.status in c) c[r.status as keyof typeof c] += 1;
    });
    const total = rows.length;
    const rate = total ? Math.round((c.present / total) * 100) : null;
    return { ...c, total, rate };
  }, [attendance]);

  // ---- unjustified absences (last 30 days) ----
  const unjustified = useMemo(
    () =>
      (attendance ?? []).filter(
        (r) =>
          (r.status === "absent" || r.status === "late") &&
          !r.justified_at &&
          r.attendance_sessions?.session_date,
      ),
    [attendance],
  );

  // ---- justifications submitted ----
  const { data: justifications } = useQuery({
    queryKey: ["child-justif", childId],
    enabled: !!childId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absence_justifications")
        .select("id, record_id, absence_date, reason, status, review_note, created_at")
        .eq("student_id", childId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const justifiedRecords = useMemo(
    () => new Set((justifications ?? []).map((j) => j.record_id)),
    [justifications],
  );

  // ---- homework (next 7 days) ----
  const { data: homework } = useQuery({
    queryKey: ["parent-homework", user?.id, selected?.class_id],
    enabled: !!selected?.class_id,
    queryFn: async () => {
      if (!selected?.class_id) return [];
      const { data, error } = await supabase
        .from("homework")
        .select("id, subject, title, description, due_date")
        .eq("class_id", selected.class_id)
        .gte("due_date", todayISO())
        .lte("due_date", inDaysISO(7))
        .order("due_date", { ascending: true })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- upcoming exams (child's class) ----
  const { data: exams } = useQuery({
    queryKey: ["parent-exams", childId],
    enabled: !!selected,
    queryFn: async () => {
      // child's class via students row
      const { data: stu } = await supabase
        .from("students")
        .select("class_id")
        .eq("id", childId!)
        .maybeSingle();
      if (!stu?.class_id) return [];
      const { data, error } = await supabase
        .from("exams")
        .select("id, subject, exam_date, room, status")
        .eq("class_id", stu.class_id)
        .gte("exam_date", todayISO())
        .neq("status", "cancelled")
        .order("exam_date", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- meeting requests ----
  const { data: meetings } = useQuery({
    queryKey: ["parent-meetings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_requests")
        .select(
          "id, student_id, preferred_date, preferred_slot, message, status, review_note, created_at",
        )
        .eq("parent_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- notifications & decisions ----
  const { data: notif } = useQuery({
    queryKey: ["parent-notif", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, channel, status, created_at")
        .or(`recipient_id.eq.${user!.id},recipient_label.eq.parent`)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: decisions } = useQuery({
    queryKey: ["decisions-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_decisions")
        .select("id, title, body, starts_at")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  // ---- profile (phone) ----
  const { data: profile } = useQuery({
    queryKey: ["parent-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const [phone, setPhone] = useState<string | undefined>();
  const [savingPhone, setSavingPhone] = useState(false);

  // ---- justification dialog ----
  const [justifyTarget, setJustifyTarget] = useState<AttRow | null>(null);
  const [justReason, setJustReason] = useState("");
  const [savingJust, setSavingJust] = useState(false);

  const submitJustification = async () => {
    if (!justifyTarget || !childId) return;
    if (justReason.trim().length < 5) {
      toast.error(t("parent.reason_too_short"));
      return;
    }
    setSavingJust(true);
    const { error } = await supabase.from("absence_justifications").insert({
      record_id: justifyTarget.id,
      student_id: childId,
      absence_date: justifyTarget.attendance_sessions?.session_date ?? todayISO(),
      reason: justReason.trim(),
      status: "pending",
    });
    setSavingJust(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(t("parent.justif_sent"));
    setJustifyTarget(null);
    setJustReason("");
    qc.invalidateQueries({ queryKey: ["child-justif", childId] });
  };

  // ---- meeting dialog ----
  const [meetOpen, setMeetOpen] = useState(false);
  const [meetDate, setMeetDate] = useState(todayISO());
  const [meetSlot, setMeetSlot] = useState("morning");
  const [meetMsg, setMeetMsg] = useState("");
  const [savingMeet, setSavingMeet] = useState(false);

  const submitMeeting = async () => {
    if (!user || !selected) return;
    setSavingMeet(true);
    const { error } = await supabase.from("meeting_requests").insert({
      parent_user_id: user.id,
      student_id: selected.id,
      preferred_date: meetDate,
      preferred_slot: meetSlot,
      message: meetMsg.trim() || null,
      status: "pending",
    });
    setSavingMeet(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(t("parent.meeting_sent"));
    setMeetOpen(false);
    setMeetMsg("");
    qc.invalidateQueries({ queryKey: ["parent-meetings", user.id] });
  };

  const savePhone = async () => {
    if (!user || phone === undefined) return;
    setSavingPhone(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: phone.trim() || null })
      .eq("id", user.id);
    setSavingPhone(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(t("parent.phone_saved"));
    qc.invalidateQueries({ queryKey: ["parent-profile", user.id] });
  };

  const MEETING_SLOTS = [
    { value: "morning", label: t("parent.slot_morning") },
    { value: "noon", label: t("parent.slot_noon") },
    { value: "afternoon", label: t("parent.slot_afternoon") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title={t("parent.title")}
        description={t("parent.subtitle")}
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="ml-2 h-4 w-4" />
            {t("parent.print_report")}
          </Button>
        }
      />

      {/* ---- child selector ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("parent.select_child")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!loadingChildren && (children?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("parent.no_children")}</p>
          ) : (
            <Select value={childId} onValueChange={setChildId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder={t("parent.select_child")} />
              </SelectTrigger>
              <SelectContent>
                {(children ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} {s.classes?.name ? `— ${s.classes.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* ---- 30-day summary + monthly report ---- */}
      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">
              {t("parent.summary_30d", { name: selected.full_name })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ["present", stats.present, "default"],
                  ["absent", stats.absent, "destructive"],
                  ["late", stats.late, "secondary"],
                  ["excused", stats.excused, "secondary"],
                  ["rate", stats.rate, "outline"],
                ] as const
              ).map(([key, value, variant]) => (
                <div
                  key={key}
                  className="rounded-xl border bg-card p-3 text-center print:break-inside-avoid"
                >
                  <p className="text-2xl font-bold">
                    {value === null ? "—" : value}
                    {key === "rate" && value !== null ? "%" : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`parent.summary_${key}`)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- unjustified absences: justify from parent ---- */}
      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <HandCoins className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("parent.unjustified_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unjustified.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("parent.no_unjustified")}</p>
            )}
            {unjustified.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {a.attendance_sessions?.session_date} —{" "}
                    {a.attendance_sessions?.subject ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`attendance.status_${a.status}`)}
                  </p>
                </div>
                <Button size="sm" onClick={() => setJustifyTarget(a)}>
                  {t("parent.justify_btn")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---- submitted justifications ---- */}
      {selected && (justifications ?? []).length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("parent.justifications_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(justifications ?? []).map((j) => (
              <div key={j.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{j.absence_date}</span>
                  <Badge
                    variant={
                      j.status === "approved"
                        ? "default"
                        : j.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {t(`parent.jstatus_${j.status}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{j.reason}</p>
                {j.review_note && (
                  <p className="mt-1 text-xs text-muted-foreground">— {j.review_note}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---- homework + exams ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("parent.homework_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(homework ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("parent.no_homework")}</p>
            )}
            {(homework ?? []).map((h) => (
              <div key={h.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{h.title}</span>
                  <Badge variant="secondary">{h.due_date}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{h.subject}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("parent.exams_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(exams ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("parent.no_exams")}</p>
            )}
            {(exams ?? []).map((e) => (
              <div key={e.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.subject}</span>
                  <Badge variant="secondary">{e.exam_date}</Badge>
                </div>
                {e.room && (
                  <p className="text-xs text-muted-foreground">
                    {t("parent.room")}: {e.room}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ---- meeting requests ---- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("parent.meetings_title")}</CardTitle>
          </div>
          <Button size="sm" onClick={() => setMeetOpen(true)} disabled={!selected}>
            {t("parent.request_meeting")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(meetings ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("parent.no_meetings")}</p>
          )}
          {(meetings ?? []).map((m) => {
            const childName = children?.find((c) => c.id === m.student_id)?.full_name;
            return (
              <div key={m.id} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {m.preferred_date} — {MEETING_SLOTS.find((s) => s.value === m.preferred_slot)?.label ?? m.preferred_slot}
                    {childName ? ` (${childName})` : ""}
                  </span>
                  <Badge
                    variant={
                      m.status === "approved"
                        ? "default"
                        : m.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {t(`parent.jstatus_${m.status}`)}
                  </Badge>
                </div>
                {m.message && <p className="mt-1 text-muted-foreground">{m.message}</p>}
                {m.review_note && (
                  <p className="mt-1 text-xs text-muted-foreground">— {m.review_note}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ---- contact info ---- */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{t("parent.contact_title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="parent-phone">{t("parent.phone_label")}</Label>
            <Input
              id="parent-phone"
              value={phone ?? profile?.phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              className="w-56"
            />
          </div>
          <Button
            onClick={savePhone}
            disabled={savingPhone || phone === undefined}
          >
            {t("common.save")}
          </Button>
        </CardContent>
      </Card>

      {/* ---- notifications + decisions ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{t("nav.notifications")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(notif ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
            )}
            {(notif ?? []).map((n) => (
              <div key={n.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{n.title}</p>
                  <Badge variant="secondary" className="text-xs uppercase">
                    {n.channel}
                  </Badge>
                </div>
                {n.body && <p className="text-muted-foreground mt-1">{n.body}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

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
              <div key={d.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{d.title}</p>
                {d.body && <p className="text-muted-foreground mt-1">{d.body}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ---- justification dialog ---- */}
      <Dialog open={!!justifyTarget} onOpenChange={(o) => !o && setJustifyTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("parent.justify_btn")} — {justifyTarget?.attendance_sessions?.session_date}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="justif-reason">{t("parent.reason_label")}</Label>
              <Textarea
                id="justif-reason"
                value={justReason}
                onChange={(e) => setJustReason(e.target.value)}
                placeholder={t("parent.reason_placeholder")}
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setJustifyTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submitJustification} disabled={savingJust}>
                {t("parent.submit_justif")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- meeting dialog ---- */}
      <Dialog open={meetOpen} onOpenChange={setMeetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("parent.request_meeting")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="meet-date">{t("parent.date_label")}</Label>
                <Input
                  id="meet-date"
                  type="date"
                  value={meetDate}
                  min={todayISO()}
                  onChange={(e) => setMeetDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("parent.slot_label")}</Label>
                <Select value={meetSlot} onValueChange={setMeetSlot}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_SLOTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="meet-msg">{t("parent.message_label")}</Label>
              <Textarea
                id="meet-msg"
                value={meetMsg}
                onChange={(e) => setMeetMsg(e.target.value)}
                placeholder={t("parent.message_placeholder")}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMeetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submitMeeting} disabled={savingMeet}>
                {t("parent.submit_meeting")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
