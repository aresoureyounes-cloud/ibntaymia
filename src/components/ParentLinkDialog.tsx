import { useState } from "react";
import { friendlyError } from "@/lib/friendly-error";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Link2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { findUserIdByEmail } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const emailSchema = z.string().trim().email().max(255);

export function ParentLinkDialog({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const resolveEmail = useServerFn(findUserIdByEmail);

  type LinkRow = {
    id: string;
    parent_user_id: string;
    profiles: { full_name: string | null } | null;
  };
  const { data: links, refetch } = useQuery({
    queryKey: ["parent-links", studentId],
    enabled: open,
    queryFn: async (): Promise<LinkRow[]> => {
      const { data } = await supabase
        .from("parent_student")
        .select("id, parent_user_id, profiles:parent_user_id(full_name)")
        .eq("student_id", studentId);
      return (data as unknown as LinkRow[]) ?? [];
    },
  });

  const handleLink = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(t("students_link.invalid_input"));
      return;
    }
    const trimmed = parsed.data;
    let parentId: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
      parentId = trimmed;
    } else {
      try {
        const res = await resolveEmail({ data: { email: trimmed } });
        parentId = res?.userId ?? null;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "error");
        return;
      }
      if (!parentId) {
        toast.error(t("students_link.not_found"));
        return;
      }
    }

    const { error } = await supabase
      .from("parent_student")
      .insert({ parent_user_id: parentId, student_id: studentId });
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(t("students_link.linked"));
    setEmail("");
    refetch();
    qc.invalidateQueries({ queryKey: ["parent-children"] });
  };

  const handleUnlink = async (id: string) => {
    const { error } = await supabase.from("parent_student").delete().eq("id", id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(t("students_link.unlinked"));
    refetch();
    qc.invalidateQueries({ queryKey: ["parent-children"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Link2 className="me-1 h-3.5 w-3.5" />
          {t("students_link.link")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("students_link.title")} — {studentName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("students_link.search_parent")}</p>
          <div className="flex gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com  أو  UUID"
              className="ltr"
            />
            <Button onClick={handleLink}>{t("students_link.link")}</Button>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("students_link.current")}</p>
          {(links ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          {(links ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  parent
                </Badge>
                <span>{l.profiles?.full_name ?? l.parent_user_id}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUnlink(l.id)}
                className="h-7 text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
