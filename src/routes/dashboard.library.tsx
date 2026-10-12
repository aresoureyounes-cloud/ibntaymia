import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/dashboard/library")({ component: LibraryPage });

type Item = {
  id: string;
  title: string;
  author: string | null;
  total_copies: number;
  available_copies: number;
};
const db = supabase;

function LibraryPage() {
  useRealtimeTable("library_items", ["library_items"]);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const { data } = useQuery({
    queryKey: ["library_items"],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await db
        .from("library_items")
        .select("id, title, author, total_copies, available_copies")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
  });
  const add = async () => {
    if (!title.trim()) return toast.error("اكتب عنوان الكتاب");
    const { error } = await db
      .from("library_items")
      .insert({ title: title.trim(), total_copies: 1, available_copies: 1 });
    if (error) return toast.error(friendlyError(error));
    setTitle("");
    qc.invalidateQueries({ queryKey: ["library_items"] });
    toast.success("تمت الإضافة");
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="المكتبة والكتب"
        description="جرد الكتب والتوزيع التجريبي."
        icon={<BookOpen className="h-8 w-8" />}
      />
      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> كتاب جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان الكتاب"
          />
          <Button onClick={add}>
            <Plus className="me-2 h-4 w-4" /> إضافة
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((i) => (
          <Card key={i.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-semibold">{i.title}</p>
                <p className="text-sm text-muted-foreground">{i.author ?? "بدون مؤلف"}</p>
              </div>
              <Badge variant="secondary">
                {i.available_copies}/{i.total_copies}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
