import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Inbox, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { friendlyError } from "@/lib/friendly-error";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/inbox")({
  head: () => ({ meta: [{ title: "رسائلي — إداروم" }] }),
  component: InboxPage,
});

function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [onlyUnread, setOnlyUnread] = useState(false);
  useRealtimeTable("notifications", ["inbox", user?.id]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["inbox", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, created_at, read_at, recipient_label")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const unread = data.filter((n) => !n.read_at).length;
  const rows = onlyUnread ? data.filter((n) => !n.read_at) : data;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inbox", user?.id] });
    qc.invalidateQueries({ queryKey: ["sidebar-unread", user?.id] });
  };

  const markRead = async (id: string) => {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    refresh();
  };
  const markAll = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user!.id)
      .is("read_at", null);
    if (error) return toast.error(friendlyError(error));
    toast.success("تم تعليم كل الرسائل كمقروءة");
    refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="رسائلي" description={`${unread} رسالة غير مقروءة`} icon={<Inbox className="h-8 w-8" />} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={onlyUnread ? "outline" : "default"} onClick={() => setOnlyUnread(false)}>الكل ({data.length})</Button>
        <Button size="sm" variant={onlyUnread ? "default" : "outline"} onClick={() => setOnlyUnread(true)}>غير المقروءة ({unread})</Button>
        <Button size="sm" variant="outline" onClick={markAll} disabled={!unread} className="ms-auto">
          <CheckCheck className="me-1 h-4 w-4" /> تعليم الكل كمقروء
        </Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
      {!isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد رسائل.</p>}
      <div className="space-y-2">
        {rows.map((n) => (
          <Card key={n.id} className={n.read_at ? "opacity-70" : "border-primary/50"}>
            <CardContent className="space-y-1 pt-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{n.title}</p>
                {!n.read_at && <Badge>جديد</Badge>}
              </div>
              {n.body && <p className="whitespace-pre-wrap">{n.body}</p>}
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{new Date(n.created_at).toLocaleString("ar-DZ")}{n.recipient_label ? ` · ${n.recipient_label}` : ""}</span>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>تعليم كمقروء</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
