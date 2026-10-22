import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, Plus, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/dashboard/decisions")({
  head: () => ({
    meta: [
      { title: "القرارات والاستدعاءات — إداروم" },
      { name: "description", content: "إداروم: القرارات والاستدعاءات في الثانوية الجزائرية." },
      { property: "og:title", content: "القرارات والاستدعاءات — إداروم" },
      {
        property: "og:description",
        content: "إداروم: القرارات والاستدعاءات في الثانوية الجزائرية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DecisionsPage,
});

type Decision = {
  id: string;
  title: string;
  decision_type: string;
  body: string | null;
  status: string;
  created_at: string;
};

const db = supabase;

function DecisionsPage() {
  useRealtimeTable("school_decisions", ["school_decisions"]);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["school_decisions"],
    queryFn: async (): Promise<Decision[]> => {
      const { data, error } = await db
        .from("school_decisions")
        .select("id, title, decision_type, body, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addDecision = async () => {
    if (!title.trim()) return toast.error("اكتب عنوان القرار");
    const { error } = await db.from("school_decisions").insert({
      title: title.trim(),
      body: body.trim() || null,
      decision_type: "announcement",
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(friendlyError(error));
    setTitle("");
    setBody("");
    qc.invalidateQueries({ queryKey: ["school_decisions"] });
    toast.success("تم حفظ القرار");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="قرارات الإدارة"
        description="إعلانات، استدعاءات، تعليق دراسة، وإلغاء حصص بتحديث فوري."
        icon={<Megaphone className="h-8 w-8" />}
      />

      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> قرار جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            placeholder="عنوان القرار"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="تفاصيل مختصرة"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button onClick={addDecision} className="w-fit">
            <Save className="me-2 h-4 w-4" /> حفظ
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {isLoading && <p className="text-muted-foreground">جارٍ التحميل...</p>}
        {(data ?? []).map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{item.title}</h2>
                <Badge variant="secondary">{item.status}</Badge>
              </div>
              {item.body && <p className="text-sm text-muted-foreground">{item.body}</p>}
              <p className="text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleString("ar")}
              </p>
            </CardContent>
          </Card>
        ))}
        {(data ?? []).length === 0 && !isLoading && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              لا توجد قرارات بعد.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
