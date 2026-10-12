import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/meetings")({
  head: () => ({ meta: [{ title: "طلبات مقابلة الأولياء — إداروم" }] }),
  component: MeetingsPage,
});

const LABEL: Record<string, string> = { pending: "قيد الانتظار", approved: "مقبول", rejected: "مرفوض", done: "تمت" };
const FILTERS = ["pending", "approved", "rejected", "done", "all"] as const;

function MeetingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useRealtimeTable("meeting_requests", ["staff-meetings"]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["staff-meetings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_requests")
        .select("id, parent_user_id, preferred_date, preferred_slot, message, status, review_note, created_at, students(full_name, classes(name))")
        .order("preferred_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = (data ?? []).filter((r) => filter === "all" || r.status === filter);

  const setStatus = async (r: { id: string; parent_user_id: string; preferred_date: string | null }, status: string) => {
    const note = notes[r.id]?.trim() || null;
    const { error } = await supabase
      .from("meeting_requests")
      .update({ status, review_note: note, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return toast.error(friendlyError(error));
    if (status !== "done") {
      await supabase.from("notifications").insert({
        recipient_id: r.parent_user_id,
        title: status === "approved" ? "تم قبول طلب المقابلة" : "تم رفض طلب المقابلة",
        body: `التاريخ المطلوب: ${r.preferred_date ?? "—"}${note ? ` — ${note}` : ""}`,
        channel: "inapp",
        status: "sent",
        created_by: user!.id,
      });
    }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["staff-meetings"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="طلبات مقابلة الأولياء" description="قبول أو رفض طلبات الأولياء، مع ملاحظة تصل للولي في إشعاراته." icon={<CalendarClock className="h-8 w-8" />} />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "الكل" : LABEL[f]} ({(data ?? []).filter((r) => f === "all" || r.status === f).length})
          </Button>
        ))}
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات.</p>}
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2 pt-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {r.students?.full_name ?? "—"} <span className="text-muted-foreground">— {r.students?.classes?.name ?? ""}</span>
                </p>
                <Badge variant={r.status === "rejected" ? "destructive" : r.status === "pending" ? "outline" : "default"}>{LABEL[r.status] ?? r.status}</Badge>
              </div>
              <p className="ltr text-muted-foreground">{r.preferred_date ?? "—"} {r.preferred_slot ? `· ${r.preferred_slot}` : ""}</p>
              {r.message && <p>{r.message}</p>}
              {r.review_note && <p className="text-muted-foreground">الملاحظة: {r.review_note}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {r.status === "pending" && (
                  <>
                    <Input className="max-w-sm" placeholder="ملاحظة للولي (مثلاً: الموعد الساعة 10:00)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                    <Button size="sm" onClick={() => setStatus(r, "approved")}>قبول</Button>
                    <Button size="sm" variant="destructive" onClick={() => setStatus(r, "rejected")}>رفض</Button>
                  </>
                )}
                {r.status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r, "done")}>تمت المقابلة</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
