import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Gavel, MessageSquare, Printer, Settings2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { friendlyError } from "@/lib/friendly-error";
import { smsComposerLink } from "@/lib/telegram-alerts";
import { NOTICE_LABEL, nextNoticeDue, strikeOffSuggested, type LegalSettings } from "@/lib/legal-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InstitutionLetterhead } from "@/components/InstitutionLetterhead";
import { useInstitution } from "@/lib/use-institution";

export const Route = createFileRoute("/dashboard/legal-notices")({
  component: LegalNoticesPage,
  head: () => ({
    meta: [
      { title: "المسار القانوني للغياب — إداروم" },
      { name: "description", content: "متابعة الغياب غير المبرر، تحرير الإشعارات الرسمية للأولياء، واقتراح الشطب بقرار المدير." },
      { property: "og:title", content: "المسار القانوني للغياب — إداروم" },
      { property: "og:description", content: "إشعارات الغياب الرسمية وقرارات الشطب الموثقة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Standing = {
  student_id: string; full_name: string; class_name: string | null; guardian_name: string | null;
  guardian_phone: string | null; enrollment_status: string; unjustified_days: number;
  absence_dates: string[]; last_notice_level: number | null;
};
type Notice = {
  id: string; serial: number; student_id: string; level: number; unjustified_days: number;
  absence_dates: string[]; delivery_method: string; issued_at: string; guardian_response_on: string | null;
};

const DELIVERY: Record<string, string> = { hand: "تسليم باليد", mail: "بريد", sms: "رسالة SMS" };
const isIos = () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

function noticeText(st: Standing, level: number) {
  return `السيد/السيدة ${st.guardian_name || "ولي التلميذ"}، نعلمكم أن ابنكم/ابنتكم ${st.full_name}، القسم ${st.class_name ?? ""}، تغيب(ت) ${st.unjustified_days} يوماً دون مبرر. هذا ${NOTICE_LABEL[level]}. يرجى الحضور إلى الثانوية لتبرير الغياب.`;
}

function LegalNoticesPage() {
  const { hasRole } = useAuth();
  const canDecide = hasRole("director") || hasRole("admin");
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [printing, setPrinting] = useState<{ st: Standing; n: Notice } | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["legal-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("legal_notice_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: standing = [] } = useQuery({
    queryKey: ["legal-standing"],
    queryFn: async (): Promise<Standing[]> => {
      const { data, error } = await supabase.rpc("student_absence_standing");
      if (error) throw error;
      return (data ?? []) as Standing[];
    },
  });
  const { data: notices = [] } = useQuery({
    queryKey: ["legal-notices"],
    queryFn: async (): Promise<Notice[]> => {
      const { data, error } = await supabase.from("legal_notices").select("*").order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Notice[];
    },
  });

  const s: (LegalSettings & { confirmed: boolean }) | null = settings ?? null;
  const rows = useMemo(() => {
    if (!s) return [];
    return standing
      .filter((r) => r.unjustified_days >= s.notice1_days || r.enrollment_status === "struck_off")
      .filter((r) => !filter || r.full_name.includes(filter) || (r.class_name ?? "").includes(filter))
      .sort((a, b) => b.unjustified_days - a.unjustified_days);
  }, [standing, s, filter]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["legal-standing"] });
    qc.invalidateQueries({ queryKey: ["legal-notices"] });
  };

  const issue = async (st: Standing, level: number, method: string) => {
    const { data, error } = await supabase
      .from("legal_notices")
      .insert({ student_id: st.student_id, level, unjustified_days: st.unjustified_days, absence_dates: st.absence_dates, delivery_method: method })
      .select("*")
      .single();
    if (error) return toast.error(friendlyError(error));
    toast.success(`حُرر ${NOTICE_LABEL[level]} رقم ${data.serial}`);
    refresh();
    if (method === "hand" || method === "mail") setPrinting({ st, n: data as Notice });
  };

  const markResponse = async (n: Notice) => {
    const { error } = await supabase.from("legal_notices").update({ guardian_response_on: new Date().toISOString().slice(0, 10) }).eq("id", n.id);
    if (error) return toast.error(friendlyError(error));
    toast.success("سُجل حضور/رد الولي");
    refresh();
  };

  const decide = async (st: Standing, status: "struck_off" | "active") => {
    const reason = window.prompt(status === "struck_off" ? "سبب قرار الشطب (إلزامي):" : "سبب الإرجاع (اختياري):") ?? null;
    if (reason === null) return;
    const { error } = await supabase.rpc("set_student_enrollment", { _student: st.student_id, _status: status, _reason: reason });
    if (error) return toast.error(friendlyError(error));
    toast.success(status === "struck_off" ? "سُجل قرار الشطب" : "أُرجع التلميذ إلى القوائم");
    refresh();
  };

  const saveSettings = async (form: HTMLFormElement) => {
    const f = new FormData(form);
    const v = (k: string) => Number(f.get(k));
    const { error } = await supabase.from("legal_notice_settings").update({
      notice1_days: v("n1"), notice2_days: v("n2"), notice3_days: v("n3"), strike_off_days: v("so"), confirmed: true, updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) return toast.error("القيم يجب أن تكون تصاعدية: الأول < الثاني < الإعذار ≤ الشطب");
    toast.success("حُفظت العتبات");
    qc.invalidateQueries({ queryKey: ["legal-settings"] });
    refresh();
  };

  if (printing) return <NoticePrint st={printing.st} n={printing.n} onClose={() => setPrinting(null)} />;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Gavel className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">المسار القانوني للغياب</h1>
          <p className="text-sm text-muted-foreground">يُحسب الغياب غير المبرر بالأيام. الغياب المبرر لا يُحسب. الشطب قرار المدير وحده.</p>
        </div>
      </div>

      {s && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" /> العتبات (بالأيام)
            {!s.confirmed && <Badge variant="destructive">قيم افتراضية — يرجى تأكيدها</Badge>}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid grid-cols-2 gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); saveSettings(e.currentTarget); }}>
              <label className="text-sm">الإشعار الأول<Input name="n1" type="number" min={1} defaultValue={s.notice1_days} disabled={!canDecide} /></label>
              <label className="text-sm">الإشعار الثاني<Input name="n2" type="number" min={1} defaultValue={s.notice2_days} disabled={!canDecide} /></label>
              <label className="text-sm">الإعذار<Input name="n3" type="number" min={1} defaultValue={s.notice3_days} disabled={!canDecide} /></label>
              <label className="text-sm">اقتراح الشطب<Input name="so" type="number" min={1} defaultValue={s.strike_off_days} disabled={!canDecide} /></label>
              {canDecide && <Button type="submit" className="self-end">حفظ</Button>}
            </form>
          </CardContent>
        </Card>
      )}

      <Input placeholder="بحث بالاسم أو القسم" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />

      {rows.length === 0 && <p className="text-muted-foreground">لا يوجد تلميذ بلغ عتبة الإشعار الأول.</p>}

      <div className="grid gap-3">
        {s && rows.map((st) => {
          const due = nextNoticeDue(st.unjustified_days, st.last_notice_level, s);
          const suggest = strikeOffSuggested(st.unjustified_days, st.last_notice_level, s);
          const mine = notices.filter((n) => n.student_id === st.student_id);
          const phone = st.guardian_phone;
          const sms = phone && due ? (() => { try { return smsComposerLink(phone, noticeText(st, due), isIos()); } catch { return null; } })() : null;
          return (
            <Card key={st.student_id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{st.full_name}</span>
                  <Badge variant="outline">{st.class_name ?? "—"}</Badge>
                  <Badge>{st.unjustified_days} يوم غير مبرر</Badge>
                  {st.enrollment_status === "struck_off" && <Badge variant="destructive">مشطوب</Badge>}
                  {suggest && st.enrollment_status !== "struck_off" && <Badge variant="destructive">مقترح للشطب</Badge>}
                </div>
                {mine.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {mine.map((n) => (
                      <li key={n.id} className="flex flex-wrap items-center gap-2">
                        <span>{NOTICE_LABEL[n.level]} رقم {n.serial} — {new Date(n.issued_at).toLocaleDateString("ar-DZ")} — {DELIVERY[n.delivery_method]}</span>
                        {n.guardian_response_on ? <Badge variant="secondary">حضر الولي {n.guardian_response_on}</Badge>
                          : <Button size="sm" variant="ghost" onClick={() => markResponse(n)}>تسجيل حضور الولي</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setPrinting({ st, n })}><Printer className="h-4 w-4" /></Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  {due > 0 && st.enrollment_status !== "struck_off" && (
                    <>
                      <Button size="sm" onClick={() => issue(st, due, "hand")}>تحرير {NOTICE_LABEL[due]} (طباعة)</Button>
                      <Button size="sm" variant="outline" onClick={() => issue(st, due, "mail")}>بالبريد</Button>
                      {sms ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={sms} onClick={() => issue(st, due, "sms")}><MessageSquare className="h-4 w-4" /> SMS للولي</a>
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">لا يوجد رقم ولي</span>}
                    </>
                  )}
                  {canDecide && suggest && st.enrollment_status !== "struck_off" && (
                    <Button size="sm" variant="destructive" onClick={() => decide(st, "struck_off")}>قرار الشطب</Button>
                  )}
                  {canDecide && st.enrollment_status === "struck_off" && (
                    <Button size="sm" variant="outline" onClick={() => decide(st, "active")}>إرجاع التلميذ</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function NoticePrint({ st, n, onClose }: { st: Standing; n: Notice; onClose: () => void }) {
  const { data: institution } = useInstitution();
  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-6 bg-background p-8 text-foreground">
      <div className="flex gap-2 print:hidden">
        <Button disabled={!institution?.name} onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</Button>
        <Button variant="outline" onClick={onClose}>رجوع</Button>
      </div>
      <InstitutionLetterhead />
      <div className="flex justify-between text-sm"><span>الرقم: {n.serial}</span><span>التاريخ: {new Date(n.issued_at).toLocaleDateString("ar-DZ")}</span></div>
      <h2 className="text-center text-xl font-bold">{NOTICE_LABEL[n.level]} بالغياب</h2>
      <div className="space-y-3 leading-8">
        <p>إلى السيد/السيدة: <b>{st.guardian_name || "ولي التلميذ"}</b></p>
        <p>نعلمكم أن ابنكم/ابنتكم <b>{st.full_name}</b> المسجل(ة) بالقسم <b>{st.class_name}</b> تغيب(ت) دون مبرر لمدة <b>{n.unjustified_days}</b> يوماً، في التواريخ التالية:</p>
        <p className="text-sm">{n.absence_dates.join(" ، ")}</p>
        <p>لذا نطلب منكم الحضور إلى الثانوية في أقرب الآجال لتبرير هذا الغياب.{n.level === 3 && " وفي حال عدم الاستجابة، يُعرض ملف التلميذ لإجراء الشطب وفق التنظيم المعمول به."}</p>
      </div>
      <div className="flex justify-between pt-12 text-sm"><span>إمضاء الولي</span><span>المدير</span></div>
    </div>
  );
}
