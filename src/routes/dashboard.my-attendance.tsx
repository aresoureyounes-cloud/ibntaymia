import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardCheck, Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askAttendanceQuestion } from "@/lib/attendance-qa.functions";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { ExportButtons } from "@/components/ExportButtons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/my-attendance")({
  head: () => ({ meta: [{ title: "سجل الحضور والغياب — إداروم" }] }),
  component: MyAttendancePage,
});

const ST: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  present: { label: "حاضر", variant: "secondary" },
  absent: { label: "غائب", variant: "destructive" },
  late: { label: "متأخر", variant: "outline" },
  excused: { label: "غياب مبرر", variant: "default" },
};

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** School year starts in September. */
function schoolYearStart() {
  const n = new Date();
  return fmt(new Date(n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1, 8, 1));
}

const PRESETS = [
  { k: "month", l: "هذا الشهر", from: () => { const n = new Date(); return fmt(new Date(n.getFullYear(), n.getMonth(), 1)); } },
  { k: "30", l: "آخر 30 يوماً", from: () => { const n = new Date(); n.setDate(n.getDate() - 30); return fmt(n); } },
  { k: "trim", l: "آخر 3 أشهر", from: () => { const n = new Date(); n.setMonth(n.getMonth() - 3); return fmt(n); } },
  { k: "year", l: "السنة الدراسية", from: schoolYearStart },
];

function MyAttendancePage() {
  const { user, hasRole } = useAuth();
  const isStudent = hasRole("student") && !hasRole("parent");
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState(PRESETS[0].from());
  const [to, setTo] = useState(fmt(new Date()));
  const [status, setStatus] = useState("all");
  const ask = useServerFn(askAttendanceQuestion);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaLog, setQaLog] = useState<{ q: string; a: string }[]>([]);
  useRealtimeTable("attendance_records", ["my-att"]);

  const { data: kids = [] } = useQuery({
    queryKey: ["my-att-kids", user?.id, isStudent],
    enabled: !!user,
    queryFn: async () => {
      if (isStudent) {
        const { data } = await supabase.from("students").select("id, full_name").eq("user_id", user!.id);
        return data ?? [];
      }
      const { data } = await supabase
        .from("parent_student")
        .select("students(id, full_name)")
        .eq("parent_user_id", user!.id);
      return (data ?? []).map((r) => r.students).filter(Boolean) as { id: string; full_name: string }[];
    },
  });
  const sid = studentId || kids[0]?.id || "";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-att", sid, from, to],
    enabled: !!sid && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, note, justified_at, attendance_sessions!inner(session_date, period, subject, session_type)")
        .eq("student_id", sid)
        .gte("attendance_sessions.session_date", from)
        .lte("attendance_sessions.session_date", to);
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (b.attendance_sessions.session_date + (b.attendance_sessions.period ?? "")).localeCompare(
          a.attendance_sessions.session_date + (a.attendance_sessions.period ?? ""),
        ),
      );
    },
  });

  const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);

  const totals = useMemo(() => {
    const t = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of rows) if (r.status in t) t[r.status as keyof typeof t]++;
    return t;
  }, [rows]);
  const rate = rows.length ? Math.round(((rows.length - totals.absent) / rows.length) * 100) : null;

  const months = useMemo(() => {
    const m = new Map<string, { present: number; absent: number; late: number; excused: number; days: Set<string> }>();
    for (const r of rows) {
      const d = r.attendance_sessions.session_date;
      const k = d.slice(0, 7);
      const e = m.get(k) ?? { present: 0, absent: 0, late: 0, excused: 0, days: new Set<string>() };
      if (r.status in e) (e as unknown as Record<string, number>)[r.status]++;
      if (r.status === "absent") e.days.add(d);
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);
  const monthName = (k: string) => new Date(k + "-01T12:00:00").toLocaleDateString("ar-DZ", { month: "long", year: "numeric" });
  const kidName = kids.find((k) => k.id === sid)?.full_name ?? "";

  const askQuestion = async () => {
    const q = question.trim();
    if (q.length < 2 || asking || !sid) return;
    if (!navigator.onLine) {
      setQaError("هذه الميزة تحتاج اتصالاً بالإنترنت.");
      return;
    }
    setAsking(true);
    setQaError(null);
    try {
      const r = await ask({
        data: {
          question: q,
          studentName: kidName || "التلميذ",
          from,
          to,
          rows: filtered.map((x) => ({
            date: x.attendance_sessions.session_date,
            period: x.attendance_sessions.period,
            subject: x.attendance_sessions.subject,
            status: x.status,
            note: x.note,
          })),
        },
      });
      if (!r.ok) {
        setQaError(r.error);
        return;
      }
      setQaLog((prev) => [{ q, a: r.answer }, ...prev].slice(0, 10));
      setQuestion("");
    } catch {
      setQaError("تعذر الإجابة الآن، حاول مرة أخرى.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل الحضور والغياب"
        description="كل حصة سُجّل فيها الحضور، مع ملخص لكل شهر."
        icon={<ClipboardCheck className="h-8 w-8" />}
        actions={
          <ExportButtons
            filename="attendance"
            title={`سجل الحضور — ${kidName} (${from} → ${to})`}
            rows={filtered.map((r) => ({
              التاريخ: r.attendance_sessions.session_date,
              الحصة: r.attendance_sessions.period ?? "",
              المادة: r.attendance_sessions.subject ?? "",
              الحالة: ST[r.status]?.label ?? r.status,
              ملاحظة: r.note ?? "",
            }))}
          />
        }
      />

      {!isLoading && kids.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {isStudent ? "حسابك غير مربوط بملف تلميذ بعد. راجع الإدارة." : "لم يُربط أي تلميذ بحسابك بعد. راجع الإدارة."}
          </CardContent>
        </Card>
      )}

      {kids.length > 0 && (
        <Card>
          <CardContent className="grid gap-3 pt-5 md:grid-cols-4">
            {kids.length > 1 && (
              <div className="space-y-1 md:col-span-4">
                <Label>التلميذ</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={sid} onChange={(e) => setStudentId(e.target.value)}>
                  {kids.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-2 md:col-span-4">
              {PRESETS.map((p) => (
                <Button key={p.k} size="sm" variant={from === p.from() && to === fmt(new Date()) ? "default" : "outline"} onClick={() => { setFrom(p.from()); setTo(fmt(new Date())); }}>
                  {p.l}
                </Button>
              ))}
            </div>
            <div className="space-y-1"><Label>من</Label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>إلى</Label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1 md:col-span-2"><Label>الحالة</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">الكل</option>
                {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {sid && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["الحصص المسجلة", rows.length],
              ["حاضر", totals.present],
              ["غائب", totals.absent],
              ["متأخر", totals.late],
              ["نسبة الحضور", rate === null ? "—" : `${rate}%`],
            ].map(([l, v]) => (
              <Card key={l as string}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">الملخص الشهري</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {months.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا بيانات في هذه الفترة.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b"><th className="py-2 text-start">الشهر</th><th>حاضر</th><th>غائب</th><th>أيام الغياب</th><th>متأخر</th><th>مبرر</th></tr>
                  </thead>
                  <tbody>
                    {months.map(([k, m]) => (
                      <tr key={k} className="border-b text-center last:border-0">
                        <td className="py-2 text-start font-medium">{monthName(k)}</td>
                        <td>{m.present}</td>
                        <td className={m.absent ? "font-semibold text-destructive" : ""}>{m.absent}</td>
                        <td>{m.days.size}</td>
                        <td>{m.late}</td>
                        <td>{m.excused}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">التفاصيل ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
              {!isLoading && filtered.length === 0 && <p className="text-sm text-muted-foreground">لا سجلات.</p>}
              {filtered.map((r) => {
                const s = ST[r.status] ?? { label: r.status, variant: "outline" as const };
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{r.attendance_sessions.subject ?? "—"}</p>
                      <p className="ltr text-xs text-muted-foreground">
                        {r.attendance_sessions.session_date}{r.attendance_sessions.period ? ` · ${r.attendance_sessions.period}` : ""}
                      </p>
                      {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <Badge variant={s.variant}>{s.label}{r.justified_at ? " · مبرر" : ""}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
