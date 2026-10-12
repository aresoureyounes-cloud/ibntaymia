import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/friendly-error";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bus, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/dashboard/trips")({ component: TripsPage });

const db = supabase;
type Trip = {
  id: string;
  title: string;
  destination: string | null;
  trip_date: string | null;
  status: string;
};

function TripsPage() {
  useRealtimeTable("school_trips", ["school_trips"]);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const { data } = useQuery({
    queryKey: ["school_trips"],
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await db
        .from("school_trips")
        .select("id, title, destination, trip_date, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const add = async () => {
    if (!title.trim()) return toast.error("اكتب عنوان الخرجة");
    const { error } = await db
      .from("school_trips")
      .insert({ title: title.trim(), destination: destination.trim() || null });
    if (error) return toast.error(friendlyError(error));
    setTitle("");
    setDestination("");
    qc.invalidateQueries({ queryKey: ["school_trips"] });
    toast.success("تمت إضافة الخرجة");
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="الخرجات والنوادي"
        description="تنظيم الخرجات والتصاريح والحضور."
        icon={<Bus className="h-8 w-8" />}
      />
      <Card className="cinema-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bus className="h-5 w-5" /> خرجة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Input placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            placeholder="الوجهة"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <Button onClick={add}>
            <Plus className="me-2 h-4 w-4" /> إضافة
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((t) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-semibold">{t.title}</p>
                <p className="text-sm text-muted-foreground">{t.destination ?? "—"}</p>
              </div>
              <Badge variant="secondary">{t.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
