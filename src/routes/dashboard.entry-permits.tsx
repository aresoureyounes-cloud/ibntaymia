import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Printer, Ticket } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/entry-permits")({
  component: EntryPermitsPage,
  head: () => ({
    meta: [
      { title: "تصاريح الدخول — إداروم" },
      { name: "description", content: "تحرير تصريح الدخول بعد الغياب أو التأخر، وتبرير الغياب، وسجل التصاريح اليومي." },
      { property: "og:title", content: "تصاريح الدخول — إداروم" },
      { property: "og:description", content: "Billet d'entrée رقمي مطبوع ومربوط بسجل الحضور." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Student = { id: string; full_name: string; national_student_id: string | null; classes: { name: string } | null };
type Permit = {
  id: string; daily_no: number; permit_date: string; kind: string; justified: boolean; reason: string | null;
  period: string | null; entry_time: string; students: { full_name: string; classes: { name: string } | null } | null;
};
const REASONS = ["مرض", "شهادة طبية", "حضور الولي", "ظرف عائلي", "مواصلات"];
const STATUS: Record<string, string> = { absent: "غائب", late: "متأخر" };

function EntryPermitsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<"absence" | "late">("absence");
  const [reason, setReason] = useState("");
  const [period, setPeriod] = useState("");
  const [printing, setPrinting] = useState<Permit | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ["permit-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async (): Promise<Student[]> => {
      const t = q.trim().replace(/[%,()]/g, "");
      const { data, error } = await supabase.from("students")
        .select("id, full_name, national_student_id, classes(name)")
        .or(`full_name.ilike.%${t}%,national_student_id.ilike.%${t}%`).limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as Student[];
    },
  });
  const { data: records = [] } = useQuery({
    queryKey: ["permit-records", student?.id],
    enabled: !!student,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_records")
        .select("id, status, attendance_sessions!inner(session_date, period, subject)")
        .eq("student_id", student!.id).in("status", ["absent", "late"]).is("justified_at", null)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; status: string; attendance_sessions: { session_date: string; period: string | null; subject: string | null } }[];
    },
  });
  const { data: permits = [] } = useQuery({
    queryKey: ["permits-today"],
    queryFn: async (): Promise<Permit[]> => {
      const { data, error } = await supabase.from("entry_permits")
        .select("id, daily_no, permit_date, kind, justified, reason, period, entry_time, students(full_name, classes(name))")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Permit[];
    },
  });

  const choose = (s: Student) => { setStudent(s); setPicked([]); setQ(""); };

  const issue = async (justified: boolean) => {
    if (!student) return;
    if (justified && !reason.trim()) return toast.error("اختر أو اكتب سبب التبرير");
    const { data, error } = await supabase.from("entry_permits").insert({
      student_id: student.id, kind, justified, reason: reason.trim() || null, period: period || null, record_ids: justified ? picked : [],
    }).select("id, daily_no, permit_date, kind, justified, reason, period, entry_time, students(full_name, classes(name))").single();
    if (error) return toast.error(friendlyError(error));
    toast.success(`تصريح رقم ${data.daily_no}`);
    qc.invalidateQueries({ queryKey: ["permits-today"] });
    qc.invalidateQueries({ queryKey: ["permit-records", student.id] });
    setPrinting(data as unknown as Permit);
    setStudent(null); setReason(""); setPeriod(""); setPicked([]);
  };

  if (printing) return <PermitSlip p={printing} onClose={() => setPrinting(null)} />;

  const today = new Date().toISOString().slice(0, 10);
  const todays = permits.filter((p) => p.permit_date === today);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Ticket className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">تصاريح الدخول</h1>
          <p className="text-sm text-muted-foreground">التلميذ الغائب أو المتأخر لا يدخل القسم إلا بتصريح. التبرير يُخرج الغياب من المسار القانوني.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">تحرير تصريح</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!student ? (
            <>
              <Input placeholder="اسم التلميذ أو رقم التعريف" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="grid gap-1">
                {results.map((s) => (
                  <button key={s.id} className="rounded-md border p-2 text-start hover:bg-muted" onClick={() => choose(s)}>
                    {s.full_name} <span className="text-sm text-muted-foreground">— {s.classes?.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{student.full_name}</span><Badge variant="outline">{student.classes?.name}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setStudent(null)}>تغيير</Button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={kind === "absence" ? "default" : "outline"} onClick={() => setKind("absence")}>بعد غياب</Button>
                <Button size="sm" variant={kind === "late" ? "default" : "outline"} onClick={() => setKind("late")}>تأخر</Button>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">الغيابات/التأخرات غير المبررة ({records.length}) — اختر ما يشمله التبرير:</p>
                {records.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد.</p>}
                <div className="grid gap-1">
                  {records.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={picked.includes(r.id)}
                        onChange={(e) => setPicked((p) => e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id))} />
                      {r.attendance_sessions.session_date} — {STATUS[r.status]} {r.attendance_sessions.period ? `— الحصة ${r.attendance_sessions.period}` : ""} {r.attendance_sessions.subject ?? ""}
                    </label>
                  ))}
                </div>
                {records.length > 1 && <Button size="sm" variant="link" onClick={() => setPicked(records.map((r) => r.id))}>تحديد الكل</Button>}
              </div>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => <Button key={r} size="sm" variant={reason === r ? "default" : "outline"} onClick={() => setReason(r)}>{r}</Button>)}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="سبب آخر" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Input placeholder="يدخل في الحصة (مثال: 3)" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => issue(true)}>تصريح — مبرر</Button>
                <Button variant="outline" onClick={() => issue(false)}>تصريح — غير مبرر</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">سجل اليوم ({todays.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة السجل</Button>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {todays.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 border-b py-1">
              <Badge>{p.daily_no}</Badge>
              <span>{new Date(p.entry_time).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="font-medium">{p.students?.full_name}</span>
              <span className="text-muted-foreground">{p.students?.classes?.name}</span>
              <Badge variant={p.justified ? "secondary" : "destructive"}>{p.justified ? `مبرر: ${p.reason}` : "غير مبرر"}</Badge>
              <Button size="sm" variant="ghost" className="print:hidden" onClick={() => setPrinting(p)}><Printer className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PermitSlip({ p, onClose }: { p: Permit; onClose: () => void }) {
  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</Button>
        <Button variant="outline" onClick={onClose}>رجوع</Button>
      </div>
      <div className="w-[105mm] space-y-2 border-2 border-foreground p-4 text-sm">
        <p className="text-center font-bold">ثانوية ابن تيمية — تصريح دخول</p>
        <div className="flex justify-between"><span>رقم: {p.daily_no}</span><span>{p.permit_date}</span></div>
        <p>التلميذ(ة): <b>{p.students?.full_name}</b></p>
        <p>القسم: <b>{p.students?.classes?.name}</b></p>
        <p>ساعة الدخول: {new Date(p.entry_time).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}{p.period ? ` — الحصة ${p.period}` : ""}</p>
        <p>النوع: {p.kind === "late" ? "تأخر" : "بعد غياب"} — {p.justified ? `مبرر (${p.reason})` : "غير مبرر"}</p>
        <div className="flex justify-between pt-6"><span>المراقب العام</span><span>الختم</span></div>
      </div>
    </div>
  );
}
