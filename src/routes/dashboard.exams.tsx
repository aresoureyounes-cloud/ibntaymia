import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FilePenLine, FileText, Plus, GraduationCap } from "lucide-react";
import { exportToExcel, exportToPdf } from "@/lib/export-utils";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HandDrawnStar } from "@/components/HandDrawnStar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dashboard/exams")({
  head: () => ({
    meta: [
      { title: "مواعيد الاختبارات — إداروم" },
      { name: "description", content: "إداروم: مواعيد الاختبارات في الثانوية الجزائرية." },
      { property: "og:title", content: "مواعيد الاختبارات — إداروم" },
      { property: "og:description", content: "إداروم: مواعيد الاختبارات في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamsPage,
});

const db = supabase;

type ClassRow = { id: string; name: string };
type Exam = {
  id: string;
  subject: string;
  exam_date: string | null;
  room: string | null;
  status: string;
  class_id: string | null;
  classes: { name: string } | null;
};
type StudentRow = { id: string; full_name: string };
type Grade = {
  id: string;
  student_id: string;
  score: number | null;
  max_score: number;
  remark: string | null;
};

function ExamsPage() {
  useRealtimeTable("exams", ["exams"]);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [subject, setSubject] = useState("");
  const [room, setRoom] = useState("");
  const [examDate, setExamDate] = useState("");
  const [classId, setClassId] = useState<string>("none");

  const { data: classes } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await db.from("classes").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: exams } = useQuery({
    queryKey: ["exams"],
    queryFn: async (): Promise<Exam[]> => {
      const { data, error } = await db
        .from("exams")
        .select("id, subject, exam_date, room, status, class_id, classes(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = async () => {
    if (!subject.trim()) return toast.error("اكتب المادة");
    const payload = {
      subject: subject.trim(),
      room: room.trim() || null,
      exam_date: examDate || null,
      class_id: classId === "none" ? null : classId,
    };
    const { error } = await db.from("exams").insert(payload);
    if (error) return toast.error(friendlyError(error));
    setSubject("");
    setRoom("");
    setExamDate("");
    setClassId("none");
    qc.invalidateQueries({ queryKey: ["exams"] });
    toast.success("تمت إضافة الامتحان");
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
              <span className="underline-sketch">تنظيم الامتحانات</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              برمجة الامتحانات والقاعات، وإدخال النقاط لكل تلميذ.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!exams?.length}
            onClick={() =>
              exportToExcel(
                "exams",
                (exams ?? []).map((e) => ({
                  المادة: e.subject,
                  القسم: e.classes?.name ?? "كل الأقسام",
                  القاعة: e.room ?? "",
                  التاريخ: e.exam_date ?? "",
                  الحالة: e.status,
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
            disabled={!exams?.length}
            onClick={() =>
              exportToPdf(
                "exams",
                "Exams",
                ["Subject", "Class", "Room", "Date", "Status"],
                (exams ?? []).map((e) => [
                  e.subject,
                  e.classes?.name ?? "all",
                  e.room ?? "",
                  e.exam_date ?? "",
                  e.status,
                ]),
              )
            }
          >
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilePenLine className="h-5 w-5" /> امتحان جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-5">
          <Input
            placeholder="المادة"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Input placeholder="القاعة" value={room} onChange={(e) => setRoom(e.target.value)} />
          <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger>
              <SelectValue placeholder="القسم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">كل الأقسام</SelectItem>
              {(classes ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={add}>
            <Plus className="me-2 h-4 w-4" /> إضافة
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {(exams ?? []).map((e) => (
          <Card key={e.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-semibold">{e.subject}</p>
                <p className="text-sm text-muted-foreground">
                  {e.classes?.name ?? "كل الأقسام"} · {e.room ?? "بدون قاعة"}
                  {e.exam_date ? ` · ${e.exam_date}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{e.status}</Badge>
                <GradesDialog exam={e} userId={user?.id ?? null} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GradesDialog({ exam, userId }: { exam: Exam; userId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: students } = useQuery({
    queryKey: ["exam-students", exam.id, exam.class_id],
    enabled: open,
    queryFn: async (): Promise<StudentRow[]> => {
      let q = db.from("students").select("id, full_name").order("full_name");
      if (exam.class_id) q = q.eq("class_id", exam.class_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: grades } = useQuery({
    queryKey: ["exam-grades", exam.id],
    enabled: open,
    queryFn: async (): Promise<Grade[]> => {
      const { data, error } = await db
        .from("grades")
        .select("id, student_id, score, max_score, remark")
        .eq("exam_id", exam.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [draft, setDraft] = useState<Record<string, { score: string; remark: string }>>({});

  const valueFor = (sid: string) => {
    if (draft[sid] !== undefined) return draft[sid];
    const g = grades?.find((x) => x.student_id === sid);
    return { score: g?.score?.toString() ?? "", remark: g?.remark ?? "" };
  };

  const save = async () => {
    const rows: Array<{
      exam_id: string;
      student_id: string;
      score: number | null;
      max_score: number;
      remark: string | null;
      entered_by: string | null;
    }> = [];
    for (const s of students ?? []) {
      const v = valueFor(s.id);
      if (v.score === "" && !v.remark) continue;
      const score = v.score === "" ? null : Number(v.score);
      if (score !== null && (Number.isNaN(score) || score < 0 || score > 20)) {
        toast.error(`نقطة ${s.full_name} يجب أن تكون بين 0 و 20`);
        return;
      }
      rows.push({
        exam_id: exam.id,
        student_id: s.id,
        score,
        max_score: 20,
        remark: v.remark || null,
        entered_by: userId,
      });
    }
    if (rows.length === 0) {
      toast.message("لا توجد نقاط للحفظ");
      return;
    }
    const { error } = await db.from("grades").upsert(rows, { onConflict: "exam_id,student_id" });
    if (error) return toast.error(friendlyError(error));
    qc.invalidateQueries({ queryKey: ["exam-grades", exam.id] });
    setDraft({});
    toast.success(`تم حفظ ${rows.length} نقطة`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <GraduationCap className="me-1.5 h-4 w-4" /> النقاط
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            نقاط امتحان: {exam.subject} ({exam.classes?.name ?? "كل الأقسام"})
          </DialogTitle>
        </DialogHeader>
        {(students ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد تلاميذ في هذا القسم.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground">
              <div className="col-span-6">التلميذ</div>
              <div className="col-span-2">العلامة /20</div>
              <div className="col-span-4">ملاحظة</div>
            </div>
            {(students ?? []).map((s) => {
              const v = valueFor(s.id);
              return (
                <div key={s.id} className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-6 truncate text-sm">{s.full_name}</div>
                  <Input
                    className="col-span-2"
                    type="number"
                    min={0}
                    max={20}
                    step="0.25"
                    value={v.score}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [s.id]: { ...v, score: e.target.value } }))
                    }
                  />
                  <Input
                    className="col-span-4"
                    placeholder="ملاحظة"
                    value={v.remark}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [s.id]: { ...v, remark: e.target.value } }))
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
          <Button onClick={save} disabled={(students ?? []).length === 0}>
            حفظ النقاط
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
