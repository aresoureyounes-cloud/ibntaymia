import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Smartphone, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { readTelegramAlert, decideTelegramAlert } from "@/lib/telegram-alerts.functions";
import { preparedSms, smsComposerLink, canPrepareSms } from "@/lib/telegram-alerts";

export const Route = createFileRoute("/dashboard/sms-alert")({
  validateSearch: z.object({ alert: z.string().uuid().optional(), action: z.enum(["ignore"]).optional() }),
  head: () => ({ meta: [
    { title: "رسالة ولي التلميذ — إداروم" },
    { name: "description", content: "مراجعة تنبيه التلميذ وتجهيز رسالة الولي بقرار الإدارة." },
    { property: "og:title", content: "رسالة ولي التلميذ — إداروم" },
    { property: "og:description", content: "مراجعة التنبيه وتجهيز SMS أو تجاهله من الإدارة المخولة." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SmsAlertPage,
});

function SmsAlertPage() {
  const { alert: id, action } = Route.useSearch();
  const read = useServerFn(readTelegramAlert);
  const decide = useServerFn(decideTelegramAlert);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ["telegram-alert", id], enabled: Boolean(id), queryFn: () => read({ data: { id: id ?? "" } }) });
  async function choose(decision: "ignored" | "composer_opened") {
    if (!id) return;
    setBusy(true);
    try {
      const result = await decide({ data: { id, decision } });
      if (result.phone) {
        const url = smsComposerLink(result.phone, result.body, /iPad|iPhone|iPod/.test(navigator.userAgent));
        setLink(url);
      } else {
        setLink(null);
      }
      await refetch();
      toast.success(decision === "ignored" ? "تم تجاهل التنبيه؛ لم تُرسل SMS" : "الرقم والنص جاهزان؛ اضغط فتح تطبيق الرسائل");
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذرت العملية"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-2xl space-y-6">
    <PageHeader title="رسالة ولي التلميذ" icon={<Smartphone className="h-8 w-8" />} />
    {isLoading && <p>جارٍ تحميل التنبيه...</p>}
    {(error || !id) && <p className="text-destructive">{error instanceof Error ? error.message : "لم يتم تحديد تنبيه صالح."}</p>}
    {data && <>
      {data.is_test && <p className="border-s-4 border-primary bg-muted p-3 font-semibold">تجربة فقط — ليس غياباً فعلياً</p>}
      <dl className="grid grid-cols-2 gap-3 border-b border-border pb-5 text-sm">
        <dt className="text-muted-foreground">الحدث</dt><dd>{data.event_type}</dd>
        <dt className="text-muted-foreground">التلميذ</dt><dd>{data.student_name}</dd>
        <dt className="text-muted-foreground">القسم</dt><dd>{data.class_name}</dd>
        <dt className="text-muted-foreground">الولي</dt><dd>{data.guardian_name || "غير محدد"}</dd>
        <dt className="text-muted-foreground">الهاتف</dt><dd dir="ltr" className="text-end">{data.guardian_phone || "غير متوفر"}</dd>
      </dl>
      <p className="whitespace-pre-wrap leading-8">{preparedSms(data)}</p>
      <p className="text-sm text-muted-foreground">الإرسال بقرارك من هاتفك وعلى حساب شريحتك؛ فتح الرسالة لا يثبت إرسالها أو وصولها.</p>
      {action === "ignore" && data.decision === "pending" && <p>هل تريد تجاهل هذا التنبيه؟</p>}
      <div className="flex flex-wrap gap-3">
        {link && canPrepareSms(data)
          ? <Button asChild disabled={busy}><a href={link} onClick={(event) => { if (busy) event.preventDefault(); }}><Smartphone className="me-2 h-4 w-4" />فتح تطبيق الرسائل</a></Button>
          : <Button disabled={busy || !canPrepareSms(data)} onClick={() => choose("composer_opened")}><Smartphone className="me-2 h-4 w-4" />{busy ? "جارٍ التجهيز..." : "تجهيز SMS"}</Button>}
        <Button variant="outline" disabled={busy || ["ignored", "cancelled"].includes(data.decision)} onClick={() => choose("ignored")}><X className="me-2 h-4 w-4" />تجاهل</Button>
        <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(preparedSms(data)); toast.success("تم نسخ الرسالة"); } catch { toast.error("تعذر النسخ"); } }}><Copy className="me-2 h-4 w-4" />نسخ</Button>
      </div>
      {data.decision === "ignored" && <p>تم تجاهل التنبيه. لم تُرسل SMS.</p>}
      {data.decision === "cancelled" && <p>ألغي التنبيه بعد تصحيح السجل؛ لا ترسل هذه الرسالة.</p>}
      {data.decision === "composer_opened" && <p>تم تجهيز SMS؛ الإرسال والوصول غير مؤكدين.</p>}
    </>}
  </div>;
}