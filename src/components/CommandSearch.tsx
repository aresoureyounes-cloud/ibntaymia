import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { NAV_ITEMS } from "@/lib/nav-config";
import { SIMPLE_MODE_PAGES, useSimpleMode } from "@/lib/simple-mode";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Ctrl+K / ⌘K palette: pages the user may open, plus students and classes (staff only). */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { roles, hasRole } = useAuth();
  const isStaff = ["admin", "director", "supervisor", "teacher"].some((r) => hasRole(r as never));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();
  const { data: students = [] } = useQuery({
    queryKey: ["cmd-students", term],
    enabled: open && isStaff && term.length >= 2,
    queryFn: async () =>
      (await supabase.from("students").select("id, full_name, classes(name)").ilike("full_name", `%${term}%`).limit(8)).data ?? [],
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["cmd-classes", term],
    enabled: open && isStaff && term.length >= 1,
    queryFn: async () => (await supabase.from("classes").select("id, name").ilike("name", `%${term}%`).limit(6)).data ?? [],
  });

  const simple = useSimpleMode();
  const pages = NAV_ITEMS.filter(
    (it) => !it.roles || roles.includes("developer") || it.roles.some((r) => roles.includes(r)),
  ).filter((it) => !simple || SIMPLE_MODE_PAGES.has(it.url));

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate({ to });
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-2 rounded-full text-muted-foreground" aria-label="بحث">
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">بحث</span>
        <kbd className="hidden rounded border px-1 text-[10px] md:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="ابحث عن صفحة أو تلميذ أو قسم..." value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>لا نتائج.</CommandEmpty>
          {students.length > 0 && (
            <CommandGroup heading="التلاميذ">
              {students.map((s) => (
                <CommandItem key={s.id} value={`student ${s.full_name} ${s.id}`} onSelect={() => go("/dashboard/students")}>
                  {s.full_name} <span className="ms-2 text-xs text-muted-foreground">{s.classes?.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {classes.length > 0 && (
            <CommandGroup heading="الأقسام">
              {classes.map((c) => (
                <CommandItem key={c.id} value={`class ${c.name} ${c.id}`} onSelect={() => go("/dashboard/schedule")}>
                  {c.name} <span className="ms-2 text-xs text-muted-foreground">جدول التوقيت</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="الصفحات">
            {pages.map((p) => (
              <CommandItem key={p.url} value={`${t(p.labelKey)} ${p.url}`} onSelect={() => go(p.url)}>
                {t(p.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
