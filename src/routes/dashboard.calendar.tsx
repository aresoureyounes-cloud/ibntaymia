import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/calendar")({
  head: () => ({ meta: [{ title: "تقويم مواعيد المدرسة — إداروم" }] }),
  component: CalendarPage,
});

const TYPES: Record<string, string> = { holiday: "عطلة", meeting: "اجتماع", exam: "اختبارات", council: "مجلس قسم", event: "نشاط", other: "أخرى" };
const AUD: Record<string, string> = { all: "الجميع", staff: "الأساتذة فقط", families: "التلاميذ والأولياء" };

function CalendarPage() {
  const { hasRole } = useAuth();
  const isMgmt = hasRole("admin") || hasRole("director") || hasRole("supervisor");
  const qc = useQueryClient();
  useRealtimeTable("school_events", ["school-events"]);
  const [f, setF] = useState({ title: "", event_type: "event", starts_on: "", ends_on: "", audience: "all", description: "" });
  const [showPast, setShowPast] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["school-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_events").select("*").order("starts_on");
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = (data ?? []).filter((e) => showPast || (e.ends_on ?? e.starts_on) >= today);

  const add = async () => {
    if (!f.title.trim() || !f.starts_on) return toast.error("العنوان وتاريخ البداية مطلوبان");
    if (f.ends_on && f.ends_on < f.starts_on) return toast.error("تاريخ النهاية قبل البداية");
    const { error } = await supabase.from("school_events").insert({
      ...f,
      title: f.title.trim(),
      ends_on: f.ends_on || null,
      description: f.description.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    setF({ ...f, title: "", starts_on: "", ends_on: "", description: "" });
    qc.invalidateQueries({ queryKey: ["school-events"] });
  };
  const remove = async (id: string) => {
    if (!confirm("حذف هذا الموعد؟")) return;
    const { error } = await supabase.from("school_events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["school-events"] });
  };

  // group by month
  const groups = rows.reduce<Record<string, typeof rows>>((acc, e) => {
    const k = e.starts_on.slice(0, 7);
    (acc[k] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title="تقويم مواعيد المدرسة" description="العطل والاجتماعات والاختبارات ومجالس الأقسام." icon={<CalendarDays className="h-8 w-8" />} />

      {isMgmt && (
        <Card>
          <CardHeader><CardTitle className="text-base">موعد جديد</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-3"><Label>العنوان</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="space-y-1"><Label>النوع</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="space-y-1"><Label>من</Label><Input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></div>
            <div className="space-y-1"><Label>إلى (اختياري)</Label><Input type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></div>
            <div className="space-y-1"><Label>يظهر لـ</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
                {Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="space-y-1 md:col-span-2"><Label>تفاصيل</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <Button onClick={add} className="w-fit">إضافة</Button>
          </CardContent>
        </Card>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> عرض المواعيد السابقة
      </label>

      {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مواعيد قادمة.</p>}
      {Object.entries(groups).map(([month, list]) => (
        <div key={month} className="space-y-2">
          <h2 className="font-semibold">{new Date(month + "-01T12:00:00").toLocaleDateString("ar-DZ", { month: "long", year: "numeric" })}</h2>
          {list.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-start justify-between gap-3 pt-5 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">{e.title}</p>
                  <p className="ltr text-muted-foreground">{e.starts_on}{e.ends_on && e.ends_on !== e.starts_on ? ` → ${e.ends_on}` : ""}</p>
                  {e.description && <p>{e.description}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge>{TYPES[e.event_type] ?? e.event_type}</Badge>
                  {isMgmt && <Badge variant="outline">{AUD[e.audience]}</Badge>}
                  {isMgmt && <Button size="icon" variant="ghost" onClick={() => remove(e.id)} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
