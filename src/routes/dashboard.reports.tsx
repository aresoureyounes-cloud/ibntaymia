import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Printer, BarChart3 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/dashboard/reports")({
  head: () => ({
    meta: [
      { title: "التقارير والكشوف — إداروم" },
      {
        name: "description",
        content: "كشوف النقاط، معدلات التلاميذ، وإحصائيات الحضور والسلوك قابلة للطباعة والتصدير.",
      },
      { property: "og:title", content: "التقارير والكشوف — إداروم" },
      {
        property: "og:description",
        content: "كشوف النقاط وإحصائيات الحضور القابلة للطباعة في إداروم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const db = supabase;

type ClassRow = { id: string; name: string; level: string | null };
type StudentRow = { id: string; full_name: string };
type GradeRow = {
  student_id: string;
  score: number | null;
  max_score: number;
  exams: { subject: string; class_id: string | null } | null;
};
type AttRow = {
  student_id: string;
  status: string;
  attendance_sessions: { class_id: string; session_date: string } | null;
};
type BehaviorRow = { student_id: string | null; points: number; record_type: string };

function ReportsPage() {
  const { t } = useTranslation();
  const [classId, setClassId] = useState<string>("");

  const { data: classes } = useQuery({
    queryKey: ["report-classes"],
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await db.from("classes").select("id, name, level").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["report-students", classId],
    enabled: !!classId,
    queryFn: async (): Promise<StudentRow[]> => {
      const { data, error } = await db
        .from("students")
        .select("id, full_name")
        .eq("class_id", classId)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: grades } = useQuery({
    queryKey: ["report-grades", classId],
    enabled: !!classId,
    queryFn: async (): Promise<GradeRow[]> => {
      const { data, error } = await db
        .from("grades")
        .select("student_id, score, max_score, exams!inner(subject, class_id)")
        .eq("exams.class_id", classId);
      if (error) throw error;
      return (data ?? []) as unknown as GradeRow[];
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ["report-attendance", classId],
    enabled: !!classId,
    queryFn: async (): Promise<AttRow[]> => {
      const { data, error } = await db
        .from("attendance_records")
        .select("student_id, status, attendance_sessions!inner(class_id, session_date)")
        .eq("attendance_sessions.class_id", classId);
      if (error) throw error;
      return (data ?? []) as unknown as AttRow[];
    },
  });

  const { data: behavior } = useQuery({
    queryKey: ["report-behavior", classId],
    enabled: !!classId,
    queryFn: async (): Promise<BehaviorRow[]> => {
      const ids = (students ?? []).map((s) => s.id);
      if (!ids.length) return [];
      const { data, error } = await db
        .from("behavior_records")
        .select("student_id, points, record_type")
        .in("student_id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useMemo(
    () => Array.from(new Set((grades ?? []).map((g) => g.exams?.subject).filter(Boolean) as string[])).sort(),
    [grades],
  );

  const rows = useMemo(() => {
    return (students ?? []).map((s) => {
      const perSubject: Record<string, number | null> = {};
      for (const subj of subjects) {
        const gs = (grades ?? []).filter(
          (g) => g.student_id === s.id && g.exams?.subject === subj && g.score !== null,
        );
        perSubject[subj] = gs.length
          ? gs.reduce((a, g) => a + (g.score! / g.max_score) * 20, 0) / gs.length
          : null;
      }
      const vals = Object.values(perSubject).filter((v): v is number => v !== null);
      const average = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

      const att = (attendance ?? []).filter((a) => a.student_id === s.id);
      const present = att.filter((a) => a.status === "present").length;
      const absent = att.filter((a) => a.status === "absent").length;
      const late = att.filter((a) => a.status === "late").length;
      const rate = att.length ? ((present + late) / att.length) * 100 : null;

      const points = (behavior ?? [])
        .filter((b) => b.student_id === s.id)
        .reduce((a, b) => a + (b.points ?? 0), 0);

      return { student: s, perSubject, average, present, absent, late, rate, points };
    });
  }, [students, subjects, grades, attendance, behavior]);

  const ranked = useMemo(
    () =>
      [...rows]
        .filter((r) => r.average !== null)
        .sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
    [rows],
  );

  const classAverage = useMemo(() => {
    const vals = rows.map((r) => r.average).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [rows]);

  const attendanceAverage = useMemo(() => {
    const vals = rows.map((r) => r.rate).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [rows]);

  const className = classes?.find((c) => c.id === classId)?.name ?? "";

  const fmt = (v: number | null, digits = 2) => (v === null ? "—" : v.toFixed(digits));

  const exportGrades = () =>
    exportToExcel(
      `bulletin-${className || "class"}`,
      rows.map((r) => ({
        [t("reports.student", { defaultValue: "التلميذ" })]: r.student.full_name,
        ...Object.fromEntries(subjects.map((s) => [s, r.perSubject[s] === null ? "" : fmt(r.perSubject[s]!)])),
        [t("reports.average", { defaultValue: "المعدل" })]: r.average === null ? "" : fmt(r.average),
        [t("reports.attendance_rate", { defaultValue: "نسبة الحضور %" })]:
          r.rate === null ? "" : fmt(r.rate, 1),
        [t("reports.behavior_points", { defaultValue: "نقاط السلوك" })]: r.points,
      })),
      "bulletin",
    );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          icon={<BarChart3 className="h-5 w-5" />}
          title={t("reports.title", { defaultValue: "التقارير والكشوف" })}
          description={t("reports.subtitle", {
            defaultValue: "كشوف النقاط، المعدلات، الترتيب، وإحصائيات الحضور والسلوك — جاهزة للطباعة.",
          })}
        />
      </div>

      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="min-w-52 flex-1">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t("reports.pick_class", { defaultValue: "اختر القسم" })}
                />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.level ? ` — ${c.level}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!classId} onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span className="ms-2">{t("reports.print", { defaultValue: "طباعة" })}</span>
          </Button>
          <Button variant="outline" disabled={!classId || !rows.length} onClick={exportGrades}>
            <FileSpreadsheet className="h-4 w-4" />
            <span className="ms-2">{t("reports.export", { defaultValue: "تصدير Excel" })}</span>
          </Button>
        </CardContent>
      </Card>

      {!classId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("reports.empty_class", {
              defaultValue: "اختر قسماً لعرض كشف النقاط والإحصائيات.",
            })}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden print:block">
            <h1 className="text-xl font-bold">
              {t("reports.title", { defaultValue: "التقارير والكشوف" })} — {className}
            </h1>
            <p className="text-sm">{new Date().toLocaleDateString()}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("reports.students_count", { defaultValue: "عدد التلاميذ" })}
              value={String(rows.length)}
            />
            <StatCard
              label={t("reports.class_average", { defaultValue: "معدل القسم /20" })}
              value={fmt(classAverage)}
            />
            <StatCard
              label={t("reports.attendance_rate", { defaultValue: "نسبة الحضور %" })}
              value={fmt(attendanceAverage, 1)}
            />
            <StatCard
              label={t("reports.subjects_count", { defaultValue: "عدد المواد" })}
              value={String(subjects.length)}
            />
          </div>

          <Tabs defaultValue="bulletin">
            <TabsList className="print:hidden">
              <TabsTrigger value="bulletin">
                {t("reports.bulletin", { defaultValue: "كشف النقاط" })}
              </TabsTrigger>
              <TabsTrigger value="attendance">
                {t("reports.attendance_tab", { defaultValue: "الحضور" })}
              </TabsTrigger>
              <TabsTrigger value="ranking">
                {t("reports.ranking", { defaultValue: "الترتيب" })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bulletin" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("reports.bulletin", { defaultValue: "كشف النقاط" })} — {className}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b border-border text-start text-muted-foreground">
                        <th className="py-2 pe-4 text-start">
                          {t("reports.student", { defaultValue: "التلميذ" })}
                        </th>
                        {subjects.map((s) => (
                          <th key={s} className="px-3 py-2 text-start">
                            {s}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-start">
                          {t("reports.average", { defaultValue: "المعدل" })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.student.id} className="border-b border-border/50">
                          <td className="py-2 pe-4 font-medium">{r.student.full_name}</td>
                          {subjects.map((s) => (
                            <td key={s} className="px-3 py-2">
                              {fmt(r.perSubject[s] ?? null)}
                            </td>
                          ))}
                          <td className="px-3 py-2 font-semibold">
                            {r.average !== null && r.average >= 10 ? (
                              <Badge variant="secondary">{fmt(r.average)}</Badge>
                            ) : (
                              fmt(r.average)
                            )}
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td colSpan={subjects.length + 2} className="py-8 text-center text-muted-foreground">
                            {t("reports.no_students", { defaultValue: "لا يوجد تلاميذ في هذا القسم." })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attendance" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("reports.attendance_stats", { defaultValue: "إحصائيات الحضور" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 pe-4 text-start">
                          {t("reports.student", { defaultValue: "التلميذ" })}
                        </th>
                        <th className="px-3 py-2 text-start">
                          {t("reports.present", { defaultValue: "حاضر" })}
                        </th>
                        <th className="px-3 py-2 text-start">
                          {t("reports.late", { defaultValue: "متأخر" })}
                        </th>
                        <th className="px-3 py-2 text-start">
                          {t("reports.absent", { defaultValue: "غائب" })}
                        </th>
                        <th className="px-3 py-2 text-start">
                          {t("reports.attendance_rate", { defaultValue: "نسبة الحضور %" })}
                        </th>
                        <th className="px-3 py-2 text-start">
                          {t("reports.behavior_points", { defaultValue: "نقاط السلوك" })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.student.id} className="border-b border-border/50">
                          <td className="py-2 pe-4 font-medium">{r.student.full_name}</td>
                          <td className="px-3 py-2">{r.present}</td>
                          <td className="px-3 py-2">{r.late}</td>
                          <td className="px-3 py-2">{r.absent}</td>
                          <td className="px-3 py-2">{fmt(r.rate, 1)}</td>
                          <td className="px-3 py-2">{r.points}</td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">
                            {t("reports.no_students", { defaultValue: "لا يوجد تلاميذ في هذا القسم." })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ranking" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("reports.ranking", { defaultValue: "الترتيب" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ranked.map((r, i) => (
                    <div
                      key={r.student.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="flex-1 font-medium">{r.student.full_name}</span>
                      <span className="font-semibold">{fmt(r.average)}</span>
                    </div>
                  ))}
                  {!ranked.length && (
                    <p className="py-8 text-center text-muted-foreground">
                      {t("reports.no_grades", { defaultValue: "لا توجد علامات مسجّلة بعد." })}
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
