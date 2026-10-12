import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Award, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dashboard/behavior")({ component: BehaviorPage });

type Student = { id: string; full_name: string; classes: { name: string } | null };
type Behavior = {
  id: string;
  title: string;
  record_type: string;
  points: number;
  recorded_at: string;
  students: Student | null;
};
const db = supabase;

function BehaviorPage() {
  useRealtimeTable("behavior_records", ["behavior_records"]);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(5);

  const { data: students } = useQuery({
    queryKey: ["students-lite"],
    queryFn: async (): Promise<Student[]> => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, classes(name)")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as Student[]) ?? [];
    },
  });

  const { data } = useQuery({
    queryKey: ["behavior_records"],
    queryFn: async (): Promise<Behavior[]> => {
      const { data, error } = await db
        .from("behavior_records")
        .select("id, title, record_type, points, recorded_at, students(full_name, classes(name))")
        .order("recorded_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data as Behavior[]) ?? [];
    },
  });

  const save = async () => {
    if (!studentId || !title.trim()) return toast.error("اختر التلميذ واكتب السبب");
    const { error } = await db.from("behavior_records").insert({
      student_id: studentId,
      title: title.trim(),
      points,
      record_type: points >= 0 ? "positive" : "negative",
      recorded_by: user?.id ?? null,
    });
    if (error) return toast.error(friendlyError(error));
    setTitle("");
    setPoints(5);
    qc.invalidateQueries({ queryKey: ["behavior_records"] });
    toast.success("تم تسجيل الملاحظة");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="السلوك والتحفيز"
        description="نقاط، ملاحظات، وتحفيز قابل للتتبع."
        icon={<Award className="h-8 w-8" />}
      />
      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" /> تسجيل سلوك
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger>
              <SelectValue placeholder="التلميذ" />
            </SelectTrigger>
            <SelectContent>
              {(students ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="السبب" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          <Button onClick={save}>
            <Save className="me-2 h-4 w-4" /> حفظ
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(data ?? []).map((r) => (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{r.students?.full_name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">
                  {r.title} · {r.students?.classes?.name ?? ""}
                </p>
              </div>
              <Badge variant={r.points >= 0 ? "default" : "destructive"}>
                {r.points > 0 ? "+" : ""}
                {r.points}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
