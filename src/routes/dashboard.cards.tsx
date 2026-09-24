import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, Search, Trash2, UserPlus, Link2Off, Zap, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { RfidScannerInput } from "@/components/RfidScannerInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HandDrawnStar } from "@/components/HandDrawnStar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard/cards")({
  component: CardsPage,
});

type CardRow = {
  id: string;
  card_uid: string;
  student_id: string | null;
  status: string;
  note: string | null;
  assigned_at: string | null;
  last_seen_at: string | null;
  students: { id: string; full_name: string; classes: { name: string } | null } | null;
};

type Student = {
  id: string;
  full_name: string;
  classes: { name: string } | null;
};

function CardsPage() {
  useRealtimeTable("rfid_cards", ["rfid_cards"]);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [manualUid, setManualUid] = useState("");

  const { data: cards } = useQuery({
    queryKey: ["rfid_cards"],
    queryFn: async (): Promise<CardRow[]> => {
      const { data, error } = await supabase
        .from("rfid_cards")
        .select(
          "id, card_uid, student_id, status, note, assigned_at, last_seen_at, students(id, full_name, classes(name))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as CardRow[]) ?? [];
    },
  });

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

  const handleScan = async (uid: string) => {
    // Check if already exists
    const { data: existing } = await supabase
      .from("rfid_cards")
      .select("id, card_uid, students(full_name)")
      .eq("card_uid", uid)
      .maybeSingle();

    if (existing) {
      const ex = existing as unknown as { students: { full_name: string } | null };
      toast.info(`بطاقة مسجّلة بالفعل${ex.students ? ` لـ ${ex.students.full_name}` : ""}`);
      return;
    }

    // Insert as unassigned, then open dialog to assign
    const { error } = await supabase.from("rfid_cards").insert({ card_uid: uid, status: "active" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`تم التقاط بطاقة جديدة: ${uid}`);
    setPendingUid(uid);
  };

  const assignToStudent = async (studentId: string) => {
    if (!pendingUid) return;
    const { error } = await supabase
      .from("rfid_cards")
      .update({ student_id: studentId, assigned_at: new Date().toISOString() })
      .eq("card_uid", pendingUid);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم ربط البطاقة بالتلميذ");
    setPendingUid(null);
    setStudentSearch("");
    qc.invalidateQueries({ queryKey: ["rfid_cards"] });
  };

  const unassign = async (id: string) => {
    const { error } = await supabase
      .from("rfid_cards")
      .update({ student_id: null, assigned_at: null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم فك الربط");
  };

  const deleteCard = async (id: string) => {
    if (!confirm("حذف هذه البطاقة نهائياً؟")) return;
    const { error } = await supabase.from("rfid_cards").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "active" ? "disabled" : "active";
    const { error } = await supabase.from("rfid_cards").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "active" ? "تم التفعيل" : "تم التعطيل");
  };

  const filtered = (cards ?? []).filter(
    (c) => !search || c.card_uid.includes(search) || c.students?.full_name.includes(search),
  );

  const filteredStudents = (students ?? []).filter((s) =>
    s.full_name.toLowerCase().includes(studentSearch.toLowerCase()),
  );

  const assigned = (cards ?? []).filter((c) => c.student_id).length;
  const unassigned = (cards ?? []).length - assigned;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 text-primary"><HandDrawnStar size={36} /></span>
          <div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">
              <span className="underline-sketch">البطاقات الرقمية (RFID)</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              مرّر بطاقة EM4100 فوق القارئ المتصل بالـ USB — سيتم التقاطها تلقائياً
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/dashboard/cards/print">
            <Printer className="h-4 w-4" />
            طباعة البطاقات
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">إجمالي البطاقات</p>
            <p className="text-3xl font-bold">{cards?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">مرتبطة</p>
            <p className="text-3xl font-bold text-primary">{assigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">غير مرتبطة</p>
            <p className="text-3xl font-bold text-amber-600">{unassigned}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>القارئ المباشر</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <RfidScannerInput onScan={handleScan} paused={pendingUid !== null} />
          <div className="flex items-center gap-2">
            <Input
              placeholder="أو أدخل رقم بطاقة يدوياً للمحاكاة"
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              className="ltr"
            />
            <Button
              variant="outline"
              onClick={() => {
                if (manualUid.trim()) {
                  handleScan(manualUid.trim());
                  setManualUid("");
                }
              }}
            >
              <Zap className="me-2 h-4 w-4" /> محاكاة
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> كل البطاقات
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم أو اسم"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم البطاقة</TableHead>
                <TableHead>التلميذ</TableHead>
                <TableHead>القسم</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    لا توجد بطاقات بعد. مرّر أول بطاقة فوق القارئ.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono ltr">{c.card_uid}</TableCell>
                  <TableCell>
                    {c.students?.full_name ?? <Badge variant="outline">غير مرتبطة</Badge>}
                  </TableCell>
                  <TableCell>{c.students?.classes?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status === "active" ? "نشطة" : "معطّلة"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 space-x-reverse">
                    {!c.student_id && (
                      <Button size="sm" variant="outline" onClick={() => setPendingUid(c.card_uid)}>
                        <UserPlus className="me-1 h-3 w-3" /> ربط
                      </Button>
                    )}
                    {c.student_id && (
                      <Button size="sm" variant="ghost" onClick={() => unassign(c.id)}>
                        <Link2Off className="me-1 h-3 w-3" /> فك
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(c.id, c.status)}>
                      {c.status === "active" ? "تعطيل" : "تفعيل"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteCard(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={pendingUid !== null} onOpenChange={(o) => !o && setPendingUid(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              ربط البطاقة <span className="font-mono text-primary ltr">{pendingUid}</span> بتلميذ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="ابحث باسم التلميذ..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-80 overflow-y-auto rounded border">
              {filteredStudents.slice(0, 50).map((s) => (
                <button
                  key={s.id}
                  className="flex w-full items-center justify-between border-b px-3 py-2 text-start hover:bg-muted"
                  onClick={() => assignToStudent(s.id)}
                >
                  <span className="font-medium">{s.full_name}</span>
                  <Badge variant="secondary">{s.classes?.name ?? "—"}</Badge>
                </button>
              ))}
              {filteredStudents.length === 0 && (
                <p className="p-3 text-center text-sm text-muted-foreground">لا توجد نتائج</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingUid(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
