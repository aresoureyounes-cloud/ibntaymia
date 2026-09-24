import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, Smartphone, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { useAuth } from "@/lib/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dashboard/notifications")({
  component: NotificationsPage,
});

type Notif = {
  id: string;
  title: string;
  body: string | null;
  channel: "inapp" | "email" | "sms";
  status: string;
  recipient_label: string | null;
  created_at: string;
  students: { full_name: string } | null;
};

const channelIcon = {
  inapp: Bell,
  email: Mail,
  sms: Smartphone,
} as const;

function NotificationsPage() {
  useRealtimeTable("notifications", ["notifications"]);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"inapp" | "email" | "sms">("inapp");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, title, body, channel, status, recipient_label, created_at, students:related_student_id(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as Notif[]) ?? [];
    },
  });

  const send = async () => {
    if (!title.trim()) return toast.error("اكتب عنوان الإشعار");
    setSending(true);
    const { error } = await supabase.from("notifications").insert({
      title: title.trim(),
      body: body.trim() || null,
      channel,
      status: channel === "inapp" ? "sent" : "simulated",
      recipient_label: recipientLabel.trim() || "الجميع",
      created_by: user?.id ?? null,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setTitle("");
    setBody("");
    setRecipientLabel("");
    qc.invalidateQueries({ queryKey: ["notifications"] });
    toast.success(channel === "inapp" ? "تم الإرسال" : "تم التسجيل (محاكاة قناة خارجية)");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإشعارات"
        description="سجل آخر الإشعارات (داخل التطبيق فعلي، البريد/SMS محاكاة في انتظار ربط مزود)"
        icon={<Bell className="h-8 w-8" />}
      />

      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> إشعار جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="العنوان"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            placeholder="المستهدَف (اختياري)"
            value={recipientLabel}
            onChange={(e) => setRecipientLabel(e.target.value)}
          />
          <Textarea
            className="md:col-span-2"
            placeholder="نص الرسالة"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inapp">داخل التطبيق</SelectItem>
              <SelectItem value="email">البريد (محاكاة)</SelectItem>
              <SelectItem value="sms">SMS (محاكاة)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={send} disabled={sending} className="w-fit">
            <Send className="me-2 h-4 w-4" /> إرسال
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> آخر 100 إشعار
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-muted-foreground">جارٍ التحميل...</p>}
          {(data ?? []).length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">لا توجد إشعارات بعد.</p>
          )}
          {(data ?? []).map((n) => {
            const Icon = channelIcon[n.channel];
            return (
              <div
                key={n.id}
                className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{n.title}</p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="uppercase">
                        {n.channel}
                      </Badge>
                      <Badge variant={n.status === "simulated" ? "secondary" : "default"}>
                        {n.status === "simulated" ? "محاكاة" : "مُرسل"}
                      </Badge>
                    </div>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.recipient_label ?? "مستخدم"} · {new Date(n.created_at).toLocaleString("ar")}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
