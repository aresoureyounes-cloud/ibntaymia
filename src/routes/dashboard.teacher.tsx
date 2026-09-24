import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Award, FilePenLine, Users, Plus, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/teacher")({
  component: TeacherDashboard,
});

function TeacherDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useRealtimeTable("attendance_sessions", ["teacher-sessions"]);
  useRealtimeTable("exams", ["teacher-exams"]);
  useRealtimeTable("classes", ["all-classes"]);

  const { data: sessions } = useQuery({
    queryKey: ["teacher-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_sessions")
        .select("id, session_date, subject, period, classes(name)")
        .eq("teacher_id", user!.id)
        .order("session_date", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["all-classes"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, level").order("name");
      return data ?? [];
    },
  });

  const { data: exams } = useQuery({
    queryKey: ["teacher-exams"],
    queryFn: async () => {
      const { data } = await supabase
        .from("exams")
        .select("id, subject, exam_date, room, status, classes(name)")
        .order("exam_date", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{t("roles.teacher")}</p>
        <h1 className="text-2xl font-bold md:text-3xl">{user?.email}</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction to="/dashboard/attendance" icon={CalendarCheck} label={t("nav.attendance")} />
        <QuickAction to="/dashboard/behavior" icon={Award} label={t("nav.behavior")} />
        <QuickAction to="/dashboard/exams" icon={FilePenLine} label={t("nav.exams")} />
        <QuickAction to="/dashboard/students" icon={Users} label={t("nav.students")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("teacher.recent_sessions")}</CardTitle>
            <Link to="/dashboard/attendance">
              <Button size="sm" variant="outline">
                <Plus className="me-1 h-3 w-3" />
                {t("teacher.new_session")}
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sessions ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
            )}
            {(sessions ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {s.subject ?? "—"}{" "}
                    <span className="text-muted-foreground">— {s.classes?.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground ltr">
                    {s.session_date} {s.period ? `· ${s.period}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("teacher.my_classes")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {(classes ?? []).map((c) => (
              <Link
                key={c.id}
                to="/dashboard/students"
                className="rounded border px-3 py-2 text-sm hover:bg-accent/30"
              >
                <p className="font-medium">{c.name}</p>
                {c.level && <p className="text-xs text-muted-foreground">{c.level}</p>}
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("nav.exams")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(exams ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
            )}
            {(exams ?? []).map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {e.subject}{" "}
                    <span className="text-muted-foreground">— {e.classes?.name ?? ""}</span>
                  </p>
                  <p className="text-xs text-muted-foreground ltr">
                    {e.exam_date} {e.room ? `· ${e.room}` : ""}
                  </p>
                </div>
                <Badge variant={e.status === "scheduled" ? "default" : "secondary"}>
                  {e.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to}>
      <Card className="group transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex items-center gap-3 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <span className="font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
