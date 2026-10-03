import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Award,
  BookOpen,
  Bell,
  Megaphone,
  GraduationCap,
  CalendarDays,
  ClipboardList,
  Flame,
  Timer,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  WEEKDAY_KEYS,
  attendanceStreak,
  fmtTime,
  formatCountdown,
  isoDate,
  monthGrid,
  nextSlot,
  toMinutes,
  type Slot,
} from "@/lib/student-data";

const DigitalBadge = lazy(() =>
  import("@/components/DigitalBadge").then((m) => ({ default: m.DigitalBadge })),
);

export const Route = createFileRoute("/dashboard/student")({
  head: () => ({
    meta: [
      { title: "فضاء التلميذ | إداروم" },
      {
        name: "description",
        content:
          "جدول التوقيت، الواجبات، الحضور، النقاط والأهداف الشخصية للتلميذ في منصة إداروم.",
      },
      { property: "og:title", content: "فضاء التلميذ | إداروم" },
      {
        property: "og:description",
        content: "كل ما يخص التلميذ في مكان واحد: التوقيت، الواجبات، الحضور والنقاط.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentDashboard,
});

type StudentRow = {
  id: string;
  full_name: string;
  class_id: string | null;
  classes: { name: string } | null;
};

function StudentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  useRealtimeTable("attendance_records", ["my-attendance"]);
  useRealtimeTable("behavior_records", ["my-behavior"]);
  useRealtimeTable("library_loans", ["my-loans"]);
  useRealtimeTable("notifications", ["my-notif"]);
  useRealtimeTable("school_decisions", ["decisions-public"]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: me } = useQuery({
    queryKey: ["my-student", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StudentRow | null> => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, class_id, classes(name)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as unknown as StudentRow) ?? null;
    },
  });

  const { data: myCard } = useQuery({
    queryKey: ["my-card", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("rfid_cards")
        .select("card_uid")
        .eq("student_id", me!.id)
        .maybeSingle();
      return (data?.card_uid as string | undefined) ?? null;
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ["my-attendance", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("id, status, created_at, attendance_sessions(session_date, subject)")
        .eq("student_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(400);
      return data ?? [];
    },
  });

  const { data: behavior } = useQuery({
    queryKey: ["my-behavior", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("behavior_records")
        .select("id, title, points, record_type, recorded_at")
        .eq("student_id", me!.id)
        .order("recorded_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: loans } = useQuery({
    queryKey: ["my-loans", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("library_loans")
        .select("id, loaned_at, returned_at, due_at, library_items(title, author)")
        .eq("student_id", me!.id)
        .order("loaned_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const { data: decisions } = useQuery({
    queryKey: ["decisions-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("school_decisions")
        .select("id, title, body, decision_type, starts_at")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const { data: grades } = useQuery({
    queryKey: ["my-grades", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("id, score, max_score, remark, exams(subject, exam_date)")
        .eq("student_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const { data: slots } = useQuery({
    queryKey: ["my-schedule", me?.class_id],
    enabled: !!me?.class_id,
    queryFn: async (): Promise<Slot[]> => {
      const { data } = await supabase
        .from("schedule_slots")
        .select("id, subject, weekday, start_time, end_time, room")
        .eq("class_id", me!.class_id!)
        .order("weekday")
        .order("start_time");
      return (data as Slot[]) ?? [];
    },
  });

  const { data: homework } = useQuery({
    queryKey: ["my-homework", me?.class_id],
    enabled: !!me?.class_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("homework")
        .select("id, subject, title, description, due_date")
        .eq("class_id", me!.class_id!)
        .order("due_date", { ascending: true })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: upcomingExams } = useQuery({
    queryKey: ["my-exams", me?.class_id],
    enabled: !!me?.class_id,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("exams")
        .select("id, subject, exam_date, room, status")
        .eq("class_id", me!.class_id!)
        .gte("exam_date", today)
        .order("exam_date", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });


  const { data: notifications } = useQuery({
    queryKey: ["my-notif", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, read_at, created_at")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: justifications } = useQuery({
    queryKey: ["my-justif", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("absence_justifications")
        .select("id, absence_date, reason, status, created_at")
        .eq("student_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const totalPoints = (behavior ?? []).reduce((s, b) => s + (b.points ?? 0), 0);
  const presentCount = (attendance ?? []).filter((a) => a.status === "present").length;
  const absentCount = (attendance ?? []).filter((a) => a.status === "absent").length;
  const activeLoans = (loans ?? []).filter((l) => !l.returned_at).length;
  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attendance ?? []) {
      const d = a.attendance_sessions?.session_date;
      if (!d) continue;
      const prev = map.get(d);
      if (prev === "absent") continue;
      map.set(d, a.status);
    }
    return map;
  }, [attendance]);

  const streak = useMemo(
    () =>
      attendanceStreak(
        (attendance ?? []).map((a) => ({
          status: a.status,
          date: a.attendance_sessions?.session_date ?? null,
        })),
      ),
    [attendance],
  );

  const next = useMemo(() => nextSlot(slots ?? [], now), [slots, now]);

  // ---- mutations (inline; simple + optimistic-free) ----
  const markRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["my-notif", user?.id] });
  };

  const [justifDate, setJustifDate] = useState("");
  const [justifReason, setJustifReason] = useState("");
  const [justifOpen, setJustifOpen] = useState(false);
  const submitJustification = async () => {
    if (!me || !justifReason.trim()) return;
    const { error } = await supabase.from("absence_justifications").insert({
      student_id: me.id,
      absence_date: justifDate || null,
      reason: justifReason.trim(),
    });
    if (error) return toast.error(error.message);
    setJustifOpen(false);
    setJustifReason("");
    setJustifDate("");
    toast.success(t("st.justif_sent"));
    qc.invalidateQueries({ queryKey: ["my-justif", me.id] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={me?.full_name ?? user?.email ?? ""}
        description={t("roles.student")}
        icon={<GraduationCap className="h-5 w-5" />}
        actions={
          me?.classes?.name ? <Badge variant="secondary">{me.classes.name}</Badge> : undefined
        }
      />

      {next && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <Timer className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("st.next_class")}</p>
                <p className="font-semibold">
                  {next.slot.subject} · {fmtTime(next.slot.start_time)}
                  {next.slot.room ? ` · ${next.slot.room}` : ""}
                </p>
              </div>
            </div>
            <p className="font-mono text-xl font-bold tabular-nums text-primary">
              {formatCountdown(next.at.getTime() - now.getTime())}
            </p>
          </CardContent>
        </Card>
      )}

      {me && (
        <Suspense
          fallback={
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                ...
              </CardContent>
            </Card>
          }
        >
          <DigitalBadge
            fullName={me.full_name}
            className={me.classes?.name}
            cardUid={myCard ?? undefined}
            role="student"
          />
        </Suspense>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={CalendarCheck} label={t("student.present")} value={presentCount} />
        <StatCard icon={Bell} label={t("student.absent")} value={absentCount} />
        <StatCard icon={Award} label={t("student.points")} value={totalPoints} />
        <StatCard icon={BookOpen} label={t("student.active_loans")} value={activeLoans} />
        <StatCard icon={Flame} label={t("st.streak")} value={streak} />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview">{t("st.tab_overview")}</TabsTrigger>
          <TabsTrigger value="schedule">{t("st.tab_schedule")}</TabsTrigger>
          <TabsTrigger value="homework">{t("st.tab_homework")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("st.tab_attendance")}</TabsTrigger>
          <TabsTrigger value="notifications">
            {t("st.tab_notifications")}
            {unread > 0 && (
              <Badge className="ms-2" variant="destructive">
                {unread}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---------- OVERVIEW ---------- */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {decisions && decisions.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("nav.decisions")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {decisions.map((d) => (
                  <div key={d.id} className="rounded-md border p-3">
                    <p className="font-medium">{d.title}</p>
                    {d.body && <p className="mt-1 text-sm text-muted-foreground">{d.body}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("nav.behavior")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(behavior ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
                )}
                {(behavior ?? []).slice(0, 8).map((b) => (
                  <Row key={b.id} label={b.title}>
                    <Badge variant={b.record_type === "positive" ? "default" : "destructive"}>
                      {b.points > 0 ? `+${b.points}` : b.points}
                    </Badge>
                  </Row>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("nav.exams")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(upcomingExams ?? []).length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t("st.upcoming_exams")}
                    </p>
                    {(upcomingExams ?? []).map((e) => (
                      <Row key={e.id} label={`${e.subject}${e.room ? ` · ${e.room}` : ""}`}>
                        <Badge variant="secondary">{e.exam_date ?? "—"}</Badge>
                      </Row>
                    ))}
                  </div>
                )}
                {(grades ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
                )}
                {(grades ?? []).slice(0, 8).map((g) => (
                  <Row key={g.id} label={g.exams?.subject ?? "—"} sub={g.remark ?? undefined}>
                    <Badge variant={g.score != null && g.score >= 10 ? "default" : "destructive"}>
                      {g.score != null ? `${g.score} / ${g.max_score}` : "—"}
                    </Badge>
                  </Row>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("nav.library")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(loans ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
                )}
                {(loans ?? []).map((l) => (
                  <Row
                    key={l.id}
                    label={l.library_items?.title ?? "—"}
                    sub={l.library_items?.author ?? undefined}
                  >
                    <Badge variant={l.returned_at ? "secondary" : "default"}>
                      {l.returned_at ? t("library.returned") : t("library.active")}
                    </Badge>
                  </Row>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------- SCHEDULE ---------- */}
        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{t("st.tab_schedule")}</CardTitle>
            </CardHeader>
            <CardContent>
              {(slots ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("st.no_schedule")}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {WEEKDAY_KEYS.map((key, wd) => {
                    const day = (slots ?? [])
                      .filter((s) => s.weekday === wd)
                      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
                    if (day.length === 0) return null;
                    const isToday = now.getDay() === wd;
                    return (
                      <div
                        key={key}
                        className={`rounded-lg border p-3 ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
                      >
                        <p className="mb-2 text-sm font-semibold">{t(`st.day_${key}`)}</p>
                        <div className="space-y-2">
                          {day.map((s) => (
                            <div key={s.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{s.subject}</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                                </span>
                              </div>
                              {s.room && (
                                <p className="text-xs text-muted-foreground">{s.room}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- HOMEWORK ---------- */}
        <TabsContent value="homework" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{t("st.tab_homework")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(homework ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("st.no_homework")}</p>
              )}
              {(homework ?? []).map((h) => {
                const overdue = h.due_date ? h.due_date < new Date().toISOString().slice(0, 10) : false;
                return (
                  <div key={h.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {h.title}
                        <span className="ms-2 text-xs text-muted-foreground">{h.subject}</span>
                      </p>
                      <Badge variant={overdue ? "destructive" : "secondary"}>
                        {h.due_date ?? "—"}
                      </Badge>
                    </div>
                    {h.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{h.description}</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- ATTENDANCE ---------- */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <AttendanceCalendar byDate={attendanceByDate} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{t("st.justifications")}</CardTitle>
              <Dialog open={justifOpen} onOpenChange={setJustifOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!me}>
                    <Plus className="h-4 w-4" /> {t("st.request_justif")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("st.request_justif")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Input
                      type="date"
                      value={justifDate}
                      onChange={(e) => setJustifDate(e.target.value)}
                    />
                    <Textarea
                      placeholder={t("st.justif_reason")}
                      value={justifReason}
                      onChange={(e) => setJustifReason(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button onClick={submitJustification} disabled={!justifReason.trim()}>
                      {t("common.save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-2">
              {(justifications ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
              )}
              {(justifications ?? []).map((j) => (
                <Row key={j.id} label={j.absence_date ?? "—"} sub={j.reason}>
                  <Badge
                    variant={
                      j.status === "approved"
                        ? "default"
                        : j.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {t(`st.status_${j.status}`)}
                  </Badge>
                </Row>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{t("nav.attendance")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(attendance ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
              )}
              {(attendance ?? []).slice(0, 30).map((a) => (
                <Row
                  key={a.id}
                  label={a.attendance_sessions?.subject ?? "—"}
                  sub={a.attendance_sessions?.session_date ?? undefined}
                >
                  <Badge
                    variant={
                      a.status === "present"
                        ? "default"
                        : a.status === "absent"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {t(`attendance.status_${a.status}`)}
                  </Badge>
                </Row>
              ))}
            </CardContent>
          </Card>
        </TabsContent>


        {/* ---------- NOTIFICATIONS ---------- */}
        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{t("nav.notifications")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(notifications ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
              )}
              {(notifications ?? []).map((n) => (
                <div
                  key={n.id}
                  className={`rounded-lg border p-3 ${n.read_at ? "opacity-60" : "border-primary/40 bg-primary/5"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{n.title}</p>
                      {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    </div>
                    {!n.read_at && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                        {t("st.mark_read")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!me && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t("student.not_linked")}{" "}
            <Link to="/dashboard" className="underline">
              {t("dashboard.back_to_dashboard")}
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function AttendanceCalendar({ byDate }: { byDate: Map<string, string> }) {
  const { t } = useTranslation();
  const today = new Date();
  const [offset, setOffset] = useState(0);
  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const cells = monthGrid(view.getFullYear(), view.getMonth());

  const color = (status?: string) =>
    status === "present"
      ? "bg-primary/80 text-primary-foreground"
      : status === "absent"
        ? "bg-destructive/80 text-destructive-foreground"
        : status
          ? "bg-accent text-accent-foreground"
          : "bg-muted/40 text-muted-foreground";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOffset((o) => o + 1)}>
            ›
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAY_KEYS.map((k) => (
            <div key={k} className="py-1 font-medium text-muted-foreground">
              {t(`st.day_${k}`).slice(0, 3)}
            </div>
          ))}
          {cells.map((day, i) =>
            day === null ? (
              <div key={`b${i}`} />
            ) : (
              <div
                key={day}
                className={`grid aspect-square place-items-center rounded-md ${color(
                  byDate.get(isoDate(view.getFullYear(), view.getMonth(), day)),
                )}`}
              >
                {day}
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
