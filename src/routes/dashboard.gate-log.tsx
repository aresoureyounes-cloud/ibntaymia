import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  ShieldCheck,
  UserPlus,
  FileSpreadsheet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportToExcel } from "@/lib/export-utils";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { useAuth } from "@/lib/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dashboard/gate-log")({
  head: () => ({
    meta: [
      { title: "سجل البوابة المؤجلة — إداروم" },
      { name: "description", content: "إداروم: سجل البوابة المؤجلة في الثانوية الجزائرية." },
      { property: "og:title", content: "سجل البوابة المؤجلة — إداروم" },
      { property: "og:description", content: "إداروم: سجل البوابة المؤجلة في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GateLogPage,
});

type ScanMode = "normal" | "late" | "visitor" | "warning" | "exceptional" | "denied";

type Scan = {
  id: string;
  scanned_at: string;
  card_uid: string;
  mode: ScanMode;
  direction: string;
  note: string | null;
  visitor_name: string | null;
  student_id: string | null;
  students: { full_name: string; class_id: string | null } | null;
};

const MODE_META: Record<ScanMode, { label: string; tone: string; icon: LucideIcon }> = {
  normal: {
    label: "عادي",
    tone: "bg-green-500/15 text-green-600 border-green-500/30",
    icon: CheckCircle2,
  },
  late: {
    label: "متأخر",
    tone: "bg-orange-500/15 text-orange-600 border-orange-500/30",
    icon: Clock,
  },
  visitor: {
    label: "زائر / ولي",
    tone: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    icon: UserPlus,
  },
  warning: {
    label: "تنبيه",
    tone: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
    icon: AlertTriangle,
  },
  exceptional: {
    label: "استثنائي",
    tone: "bg-purple-500/15 text-purple-600 border-purple-500/30",
    icon: ShieldCheck,
  },
  denied: {
    label: "ممنوع",
    tone: "bg-destructive/15 text-destructive border-destructive/30",
    icon: XCircle,
  },
};

function GateLogPage() {
  useRealtimeTable("card_scans", ["gate-log"]);
  const { user } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: scans, isLoading } = useQuery({
    queryKey: ["gate-log", from, to, mode],
    queryFn: async (): Promise<Scan[]> => {
      let q = supabase
        .from("card_scans")
        .select(
          "id, scanned_at, card_uid, mode, direction, note, visitor_name, student_id, students(full_name, class_id)",
        )
        .gte("scanned_at", `${from}T00:00:00`)
        .lte("scanned_at", `${to}T23:59:59`)
        .order("scanned_at", { ascending: false })
        .limit(500);
      if (mode !== "all") q = q.eq("mode", mode);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Scan[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return scans ?? [];
    return (scans ?? []).filter(
      (row) =>
        row.card_uid?.toLowerCase().includes(s) ||
        row.visitor_name?.toLowerCase().includes(s) ||
        row.students?.full_name?.toLowerCase().includes(s) ||
        row.note?.toLowerCase().includes(s),
    );
  }, [scans, search]);

  const stats = useMemo(() => {
    const c: Record<string, number> = { total: filtered.length };
    filtered.forEach((r) => {
      c[r.mode] = (c[r.mode] ?? 0) + 1;
    });
    return c;
  }, [filtered]);

  const copyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      toast.success("تم نسخ رقم البطاقة");
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  const notifyTeacher = async (row: Scan) => {
    if (!row.student_id || !row.students?.class_id) {
      toast.error("لا يمكن تحديد التلميذ أو القسم لإرسال الإشعار");
      return;
    }
    setBusyId(row.id);
    const today = new Date().toISOString().slice(0, 10);
    const { data: sessions } = await supabase
      .from("attendance_sessions")
      .select("teacher_id, subject")
      .eq("class_id", row.students.class_id)
      .eq("session_date", today);

    const teachers = Array.from(new Set((sessions ?? []).map((s) => s.teacher_id).filter(Boolean)));
    if (teachers.length === 0) {
      toast.error("لا توجد حصص اليوم لهذا القسم — لا يوجد أستاذ لإشعاره");
      setBusyId(null);
      return;
    }

    const reason = row.note?.trim() || "بدون سبب محدّد";
    const title = `🚫 رُفض دخول التلميذ ${row.students.full_name ?? ""}`.trim();
    const body = `سُجِّل رفض دخول عند البوابة. السبب: ${reason}. رقم البطاقة: ${row.card_uid}.`;

    const rows = teachers.map((tid) => ({
      recipient_id: tid,
      recipient_label: "teacher",
      title,
      body,
      channel: "inapp",
      status: "sent",
      related_student_id: row.student_id,
      created_by: user?.id ?? null,
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    setBusyId(null);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setNotifiedIds((prev) => new Set(prev).add(row.id));
    toast.success(`تم إشعار ${teachers.length} أستاذ`);
  };

  const buildRows = () =>
    filtered.map((r) => ({
      datetime: new Date(r.scanned_at).toLocaleString("ar"),
      name: r.students?.full_name ?? r.visitor_name ?? "غير معروف",
      uid: r.card_uid,
      mode: MODE_META[r.mode]?.label ?? r.mode,
      direction: r.direction === "in" ? "دخول" : "خروج",
      denyReason: r.mode === "denied" ? (r.note ?? "بدون سبب") : "",
      note: r.note ?? "",
    }));

  const exportCSV = () => {
    const rows = buildRows();
    const headers = ["التاريخ والوقت", "الاسم", "UID", "النوع", "الاتجاه", "سبب المنع", "ملاحظة"];
    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.map(escape).join(","),
      ...rows.map((r) =>
        [r.datetime, r.name, r.uid, r.mode, r.direction, r.denyReason, r.note]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gate-log_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير CSV");
  };

  const exportPDF = () => {
    const rows = buildRows();
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Gate Log  |  ${from}  ->  ${to}  |  mode: ${mode}`, 14, 14);
    if (search) doc.text(`Search: ${search}`, 14, 21);
    autoTable(doc, {
      startY: search ? 26 : 20,
      head: [["Date/Time", "Name", "UID", "Mode", "Dir", "Deny reason", "Note"]],
      body: rows.map((r) => [r.datetime, r.name, r.uid, r.mode, r.direction, r.denyReason, r.note]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 5: { textColor: [200, 0, 0] } },
    });
    doc.save(`gate-log_${from}_${to}.pdf`);
    toast.success("تم تصدير PDF");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-primary">
            <History className="h-8 w-8" />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">
              <span className="underline-sketch">سجلّ البوابة</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              كل عمليات المسح: العادية، المتأخرين، الزوّار، التنبيهات، الدخول الاستثنائي والممنوع
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => exportToExcel(`gate-log_${from}_${to}`, buildRows())}
          >
            <FileSpreadsheet className="me-1.5 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="me-1.5 h-4 w-4" /> تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={filtered.length === 0}>
            <FileText className="me-1.5 h-4 w-4" /> تصدير PDF
          </Button>
        </div>
      </div>

      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">من</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">إلى</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">النوع</label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(Object.keys(MODE_META) as ScanMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_META[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground">
              بحث (رقم البطاقة، الاسم، السبب)
            </label>
            <Input placeholder="ابحث…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">المجموع: {stats.total ?? 0}</Badge>
        {(Object.keys(MODE_META) as ScanMode[]).map((m) =>
          stats[m] ? (
            <Badge key={m} className={MODE_META[m].tone}>
              {MODE_META[m].label}: {stats[m]}
            </Badge>
          ) : null,
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>النتائج ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد عمليات مسح ضمن هذه الفلاتر.</p>
          )}
          <div className="space-y-2">
            {filtered.map((row) => {
              const meta = MODE_META[row.mode] ?? MODE_META.normal;
              const Icon = meta.icon;
              const isVisitor = row.mode === "visitor";
              const isDenied = row.mode === "denied";
              const who = row.students?.full_name ?? row.visitor_name ?? "غير معروف";
              const alreadyNotified = notifiedIds.has(row.id);
              return (
                <div
                  key={row.id}
                  className={`flex flex-col gap-3 rounded-md border p-3 text-sm md:flex-row md:items-center md:justify-between ${
                    isDenied
                      ? "border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20"
                      : isVisitor
                        ? "border-blue-500/40 bg-blue-500/5"
                        : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${meta.tone}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-base">{who}</p>
                        {isVisitor && (
                          <Badge className="bg-blue-500 text-white hover:bg-blue-500 gap-1">
                            <UserPlus className="h-3 w-3" /> زائر
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {row.direction === "in" ? "دخول" : "خروج"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">UID:</span>
                        <code className="ltr rounded bg-muted px-2 py-0.5 font-mono text-xs">
                          {row.card_uid}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => copyUid(row.card_uid)}
                          title="نسخ رقم البطاقة"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {isDenied ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                          <XCircle className="h-3.5 w-3.5" />
                          لم يُسمح بالدخول
                          {row.note ? (
                            <span className="font-normal">— السبب: {row.note}</span>
                          ) : null}
                        </p>
                      ) : row.note ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">سبب: {row.note}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <Badge className={meta.tone}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.scanned_at).toLocaleString("ar")}
                      </span>
                    </div>
                    {isDenied && row.student_id && (
                      <Button
                        size="sm"
                        variant={alreadyNotified ? "outline" : "destructive"}
                        disabled={busyId === row.id || alreadyNotified}
                        onClick={() => notifyTeacher(row)}
                      >
                        <BellRing className="me-1.5 h-3.5 w-3.5" />
                        {alreadyNotified
                          ? "تم الإشعار"
                          : busyId === row.id
                            ? "جارٍ الإرسال…"
                            : "إشعار الأستاذ بالرفض"}
                      </Button>
                    )}
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
