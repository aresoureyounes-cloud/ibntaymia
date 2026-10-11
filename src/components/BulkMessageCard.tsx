import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const TARGETS = [
  { v: "teachers", l: "كل الأساتذة" },
  { v: "parents", l: "كل الأولياء" },
  { v: "students", l: "كل التلاميذ" },
  { v: "class_parents", l: "أولياء قسم معيّن" },
  { v: "class_students", l: "تلاميذ قسم معيّن" },
  { v: "everyone", l: "كل الحسابات" },
];

/** Sends one in-app notification to every account in the chosen group (management only). */
export function BulkMessageCard() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const isMgmt = hasRole("admin") || hasRole("director") || hasRole("supervisor");
  const [target, setTarget] = useState("parents");
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const needsClass = target.startsWith("class_");

  const { data: classes } = useQuery({
    queryKey: ["all-classes"],
    enabled: isMgmt,
    queryFn: async () => (await supabase.from("classes").select("id, name, level").order("name")).data ?? [],
  });

  if (!isMgmt) return null;

  const send = async () => {
    if (!title.trim()) return toast.error("اكتب عنوان الرسالة");
    if (needsClass && !classId) return toast.error("اختر القسم");
    const label = TARGETS.find((t) => t.v === target)?.l;
    if (!confirm(`إرسال الرسالة إلى: ${label}؟`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("send_bulk_notification", {
      _target: target,
      _class_id: needsClass ? classId : (null as unknown as string),
      _title: title,
      _body: body,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data) toast.warning("لا توجد حسابات في هذه الفئة، لم تُرسل أي رسالة");
    else toast.success(`أُرسلت إلى ${data} حساب`);
    setTitle("");
    setBody("");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" /> رسالة جماعية
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>المستلمون</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            {TARGETS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        {needsClass && (
          <div className="space-y-1">
            <Label>القسم</Label>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">اختر</option>
              {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1 md:col-span-2">
          <Label>العنوان</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>النص</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <Button onClick={send} disabled={busy} className="w-fit">إرسال</Button>
      </CardContent>
    </Card>
  );
}
