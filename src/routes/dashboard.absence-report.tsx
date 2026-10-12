import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { exportToExcel, exportToPdf } from "@/lib/export-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HandDrawnStar } from "@/components/HandDrawnStar";

export const Route = createFileRoute("/dashboard/absence-report")({
  component: AbsenceReportPage,
  head: () => ({
    meta: [
      { title: "تقرير الغياب اليومي — إداروم" },
      {
        name: "description",
        content: "تقرير يومي لغيابات وتأخرات التلاميذ حسب القسم مع تصدير Excel وPDF وإشعار الأولياء.",
      },
      { property: "og:title", content: "تقرير الغياب اليومي — إداروم" },
      {
        property: "og:description",
        content: "متابعة الغياب والتأخر يوميًا في كل الأقسام وإشعار الأولياء بنقرة واحدة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "present" | "absent" | "late" | "excused";

type Row = {
  student_id: string;
  status: Status;
  justified_at: string | null;
  justification_note: string | null;
  students: { id: string; full_name: string; class_id: string | null } | null;
  attendance_sessions: {
    session_date: string;
    period: string | null;
    subject: string | null;
    classes: { name: string } | null;
  } | null;
};

const STATUS_LABEL: Record<Status, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused: "بعذر",
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function AbsenceReportPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [sending, setSending] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["absence-report", date],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "student_id, status, justified_at, justification_note, students(id, full_name, class_id), attendance_sessions!inner(session_date, period, subject, classes(name))",
        )
        .in("status", ["absent", "late", "excused"])
        .eq("attendance_sessions.session_date", date);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const { data: topAbsentees } = useQuery({
    queryKey: ["top-absentees", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          "student_id, status, students(full_name), attendance_sessions!inner(session_date)",
        )
        .eq("status", "absent")
        .gte("attendance_sessions.session_date", daysAgo(30))
        .lte("attendance_sessions.session_date", date);
      if (error) throw error;
      const tally = new Map<string, { name: string; count: number }>();
      ((data as unknown as { student_id: string; students: { full_name: string } | null }[]) ?? []).forEach(
        (r) => {
          const prev = tally.get(r.student_id);
          tally.set(r.student_id, {
            name: r.students?.full_name ?? "—",
            count: (prev?.count ?? 0) + 1,
          });
        },
      );
      return [...tally.entries()]
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
  });

  const list = rows ?? [];

  const counts = useMemo(() => {
    const c = { absent: 0, late: 0, excused: 0, unjustified: 0 };
    list.forEach((r) => {
      if (r.status === "absent") c.absent += 1;
      if (r.status === "late") c.late += 1;
      if (r.status === "excused") c.excused += 1;
      if (r.status !== "excused" && !r.justified_at) c.unjustified += 1;
    });
    return c;
  }, [list]);

  const byClass = useMemo(() => {
    const map = new Map<string, Row[]>();
    list.forEach((r) => {
      const key = r.attendance_sessions?.classes?.name ?? "قسم غير محدّد";
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [list]);

  const tableRows = useMemo(
    () =>
      list.map((r) => ({
        التاريخ: r.attendance_sessions?.session_date ?? date,
        القسم: r.attendance_sessions?.classes?.name ?? "—",
        التلميذ: r.students?.full_name ?? "—",
        الحالة: STATUS_LABEL[r.status],
        الحصة: r.attendance_sessions?.period ?? "—",
        المادة: r.attendance_sessions?.subject ?? "—",
        التبرير: r.justified_at ? (r.justification_note ?? "مبرَّر") : "غير مبرَّر",
      })),
    [list, date],
  );

  const notifyParents = async () => {
    const targets = list.filter((r) => r.status !== "excused" && !r.justified_at);
    if (targets.length === 0) return toast.info("لا توجد حالات غير مبرَّرة لإشعارها");
    setSending(true);
    const notes = targets.map((r) => ({
      recipient_id: null,
      recipient_label: `ولي أمر: ${r.students?.full_name ?? "—"}`,
      title: r.status === "absent" ? "إشعار غياب" : "إشعار تأخر",
      body: `سُجِّل ${STATUS_LABEL[r.status]} للتلميذ(ة) ${r.students?.full_name ?? ""} بتاريخ ${date} — ${
        r.attendance_sessions?.classes?.name ?? ""
      }.`,
      channel: "sms",
      status: "simulated",
      related_student_id: r.student_id,
      created_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("notifications").insert(notes);
    setSending(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`تم إرسال ${notes.length} إشعارًا لأولياء الأمور`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-primary">
            <HandDrawnStar size={36} />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">
              <span className="underline-sketch">تقرير الغياب اليومي</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              كل غيابات وتأخرات اليوم في كل الأقسام، في صفحة واحدة قابلة للطباعة والإرسال
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!tableRows.length}
            onClick={() => exportToExcel(`absence-${date}`, tableRows)}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!tableRows.length}
            onClick={() =>
              exportToPdf(
                `absence-${date}`,
                `Daily Absence Report — ${date}`,
                ["Date", "Class", "Student", "Status", "Period", "Subject", "Justification"],
                tableRows.map((r) => [
                  r.التاريخ,
                  r.القسم,
                  r.التلميذ,
                  r.الحالة,
                  r.الحصة,
                  r.المادة,
                  r.التبرير,
                ]),
              )
            }
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
          <Button size="sm" className="gap-2" disabled={sending} onClick={notifyParents}>
            <BellRing className="h-4 w-4" /> إشعار الأولياء
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "غائب", value: counts.absent, icon: Users },
          { label: "متأخر", value: counts.late, icon: CalendarDays },
          { label: "بعذر", value: counts.excused, icon: FileText },
          { label: "غير مبرَّر", value: counts.unjustified, icon: AlertTriangle },
        ].map((k) => (
          <Card key={k.label} className="cinema-shadow">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="font-display text-3xl">{k.value}</p>
              </div>
              <k.icon className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>التفصيل حسب القسم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
          {!isLoading && byClass.length === 0 && (
            <p className="text-sm text-muted-foreground">
              لا توجد غيابات مسجّلة في هذا التاريخ. سجّل الحضور من صفحة «الحضور» أولاً.
            </p>
          )}
          {byClass.map(([className, items]) => (
            <div key={className} className="rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="font-semibold">{className}</span>
                <Badge variant="outline">{items.length} حالة</Badge>
              </div>
              <div className="divide-y divide-border">
                {items.map((r, i) => (
                  <div
                    key={`${r.student_id}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{r.students?.full_name ?? "—"}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        حصة {r.attendance_sessions?.period ?? "—"}
                      </span>
                      <Badge
                        className={
                          r.status === "absent"
                            ? "bg-destructive/15 text-destructive border-destructive/30"
                            : r.status === "late"
                              ? "bg-accent/20 text-accent-foreground border-accent/40"
                              : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {STATUS_LABEL[r.status]}
                      </Badge>
                      {r.status !== "excused" && (
                        <Badge variant="outline">
                          {r.justified_at ? "مبرَّر" : "غير مبرَّر"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> الأكثر غيابًا (آخر 30 يومًا)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(topAbsentees ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p>
          ) : (
            <div className="space-y-2">
              {(topAbsentees ?? []).map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="me-2 text-muted-foreground">{i + 1}.</span>
                    {s.name}
                  </span>
                  <Badge
                    className={
                      s.count >= 5
                        ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-muted text-muted-foreground border-border"
                    }
                  >
                    {s.count} غياب
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
