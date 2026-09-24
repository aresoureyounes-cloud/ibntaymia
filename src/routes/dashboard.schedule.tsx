import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { CalendarDays, ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WEEKDAY_KEYS, fmtTime, toMinutes } from "@/lib/student-data";

export const Route = createFileRoute("/dashboard/schedule")({
  head: () => ({
    meta: [
      { title: "جدول التوقيت والواجبات | إداروم" },
      {
        name: "description",
        content: "إدارة جدول توقيت الأقسام ونشر الواجبات المنزلية في منصة إداروم.",
      },
      { property: "og:title", content: "جدول التوقيت والواجبات | إداروم" },
      {
        property: "og:description",
        content: "إنشاء حصص الأقسام ونشر الواجبات المنزلية وآجال التسليم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [classId, setClassId] = useState<string>("");

  const { data: classes } = useQuery({
    queryKey: ["classes-all"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: slots } = useQuery({
    queryKey: ["schedule-admin", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("schedule_slots")
        .select("id, subject, weekday, start_time, end_time, room")
        .eq("class_id", classId)
        .order("weekday")
        .order("start_time");
      return data ?? [];
    },
  });

  const { data: homework } = useQuery({
    queryKey: ["homework-admin", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("homework")
        .select("id, subject, title, description, due_date")
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  // slot form
  const [subject, setSubject] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [room, setRoom] = useState("");

  const addSlot = async () => {
    if (!classId || !subject.trim()) return;
    if (toMinutes(end) <= toMinutes(start)) return toast.error(t("sched.bad_time"));
    const { error } = await supabase.from("schedule_slots").insert({
      class_id: classId,
      teacher_id: user?.id ?? null,
      subject: subject.trim(),
      weekday: Number(weekday),
      start_time: start,
      end_time: end,
      room: room.trim() || null,
    });
    if (error) return toast.error(error.message);
    setSubject("");
    setRoom("");
    toast.success(t("sched.slot_added"));
    qc.invalidateQueries({ queryKey: ["schedule-admin", classId] });
  };

  const removeSlot = async (id: string) => {
    const { error } = await supabase.from("schedule_slots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["schedule-admin", classId] });
  };

  // homework form
  const [hwSubject, setHwSubject] = useState("");
  const [hwTitle, setHwTitle] = useState("");
  const [hwDesc, setHwDesc] = useState("");
  const [hwDue, setHwDue] = useState("");

  const addHomework = async () => {
    if (!classId || !hwTitle.trim() || !hwSubject.trim()) return;
    const { error } = await supabase.from("homework").insert({
      class_id: classId,
      teacher_id: user?.id ?? null,
      subject: hwSubject.trim(),
      title: hwTitle.trim(),
      description: hwDesc.trim() || null,
      due_date: hwDue || null,
    });
    if (error) return toast.error(error.message);
    setHwTitle("");
    setHwDesc("");
    setHwDue("");
    toast.success(t("sched.homework_added"));
    qc.invalidateQueries({ queryKey: ["homework-admin", classId] });
  };

  const removeHomework = async (id: string) => {
    const { error } = await supabase.from("homework").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["homework-admin", classId] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.schedule")}
        description={t("sched.description")}
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("sched.pick_class")} />
            </SelectTrigger>
            <SelectContent>
              {(classes ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {!classId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("sched.pick_class")}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="slots">
          <TabsList>
            <TabsTrigger value="slots">{t("sched.slots")}</TabsTrigger>
            <TabsTrigger value="homework">{t("st.tab_homework")}</TabsTrigger>
          </TabsList>

          <TabsContent value="slots" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("sched.add_slot")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <Input
                  placeholder={t("sched.subject")}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <Select value={weekday} onValueChange={setWeekday}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_KEYS.map((k, i) => (
                      <SelectItem key={k} value={String(i)}>
                        {t(`st.day_${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                <Input
                  placeholder={t("sched.room")}
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
                <Button onClick={addSlot} disabled={!subject.trim()}>
                  <Plus className="h-4 w-4" /> {t("common.add")}
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {WEEKDAY_KEYS.map((key, wd) => {
                const day = (slots ?? []).filter((s) => s.weekday === wd);
                if (day.length === 0) return null;
                return (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle className="text-sm">{t(`st.day_${key}`)}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {day.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{s.subject}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                              {s.room ? ` · ${s.room}` : ""}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={t("common.delete")}
                            onClick={() => removeSlot(s.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="homework" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">{t("sched.add_homework")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    placeholder={t("sched.subject")}
                    value={hwSubject}
                    onChange={(e) => setHwSubject(e.target.value)}
                  />
                  <Input
                    placeholder={t("sched.title")}
                    value={hwTitle}
                    onChange={(e) => setHwTitle(e.target.value)}
                  />
                  <Input type="date" value={hwDue} onChange={(e) => setHwDue(e.target.value)} />
                </div>
                <Textarea
                  placeholder={t("sched.details")}
                  value={hwDesc}
                  onChange={(e) => setHwDesc(e.target.value)}
                />
                <Button onClick={addHomework} disabled={!hwTitle.trim() || !hwSubject.trim()}>
                  <Plus className="h-4 w-4" /> {t("common.add")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 pt-6">
                {(homework ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("common.no_data")}</p>
                )}
                {(homework ?? []).map((h) => (
                  <div
                    key={h.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {h.title}
                        <span className="ms-2 text-xs text-muted-foreground">{h.subject}</span>
                      </p>
                      {h.description && (
                        <p className="text-sm text-muted-foreground">{h.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{h.due_date ?? "—"}</Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t("common.delete")}
                        onClick={() => removeHomework(h.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
