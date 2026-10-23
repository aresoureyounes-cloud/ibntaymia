import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { configureTelegram, sendTelegramTest, flushTelegram } from "@/lib/telegram-alerts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function TelegramAlertsPanel() {
  const { hasRole } = useAuth();
  const allowed = ["admin", "director", "supervisor", "developer"].some(role => hasRole(role as "admin"));
  const configure = useServerFn(configureTelegram), test = useServerFn(sendTelegramTest), flush = useServerFn(flushTelegram);
  const qc = useQueryClient();
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [className, setClassName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [phone, setPhone] = useState("");
  const canConfigure = hasRole("admin") || hasRole("director") || hasRole("developer");
  const { data: settings } = useQuery({ queryKey: ["telegram-settings"], enabled: allowed, queryFn: async () => { const { data, error } = await supabase.from("telegram_settings").select("*").maybeSingle(); if (error) throw error; return data; } });
  const { data: alerts, error } = useQuery({ queryKey: ["telegram-alerts"], enabled: allowed, refetchInterval: 15000, queryFn: async () => { const { data, error } = await supabase.from("telegram_alerts").select("*").order("created_at", { ascending: false }).limit(30); if (error) throw error; return data; } });
  useEffect(() => { if (settings) { setChatId(settings.chat_id); setEnabled(settings.enabled); } }, [settings]);
  async function run(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); await qc.invalidateQueries({ queryKey: ["telegram-alerts"] }); } catch (err) { toast.error(err instanceof Error ? err.message : "تعذرت العملية"); } finally { setBusy(false); } }
  if (!allowed) return null;
  return <section className="space-y-4 border-b border-border pb-6">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Send className="h-5 w-5" />تنبيهات تيليجرام ورسائل الأولياء</h2>
    {canConfigure && <>
      <div className="flex flex-wrap items-center gap-3"><Input aria-label="معرّف محادثة تيليجرام" placeholder="معرّف محادثة تيليجرام" value={chatId} onChange={e => setChatId(e.target.value)} className="max-w-xs" dir="ltr" /><Switch id="telegram-enabled" checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor="telegram-enabled">تفعيل</Label><Button disabled={busy} onClick={() => run(async () => { await configure({ data: { chatId, enabled } }); await qc.invalidateQueries({ queryKey: ["telegram-settings"] }); toast.success("حُفظ إعداد تيليجرام"); })}>حفظ الإعداد</Button></div>
      <h3 className="font-semibold">رسالة تجربة — دون تسجيل غياب</h3>
      <div className="grid gap-3 sm:grid-cols-2"><Input aria-label="اسم التلميذ للتجربة" placeholder="التلميذ" value={studentName} onChange={e => setStudentName(e.target.value)} /><Input aria-label="القسم للتجربة" placeholder="القسم" value={className} onChange={e => setClassName(e.target.value)} /><Input aria-label="اسم الولي للتجربة" placeholder="الولي" value={guardianName} onChange={e => setGuardianName(e.target.value)} /><Input aria-label="هاتف الولي للتجربة" placeholder="هاتف الولي" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} /></div>
      <Button disabled={busy || !settings?.enabled} onClick={() => run(async () => { await test({ data: { studentName, className, guardianName, phone } }); const result = await flush(); if (result.failed) throw new Error("تعذر إرسال بعض التنبيهات؛ راجع سجل تيليجرام."); toast.success("قبل تيليجرام رسالة التجربة؛ لم تُرسل SMS"); })}><Send className="me-2 h-4 w-4" />إرسال تجربة إلى تيليجرام</Button>
    </>}
    <Button variant="outline" disabled={busy} onClick={() => run(async () => { const result = await flush(); toast.info(`قبل تيليجرام ${result.accepted} تنبيهاً؛ فشل ${result.failed}`); })}><RefreshCw className="me-2 h-4 w-4" />إرسال التنبيهات المعلقة</Button>
    {error && <p className="text-destructive">تعذر تحميل تنبيهات تيليجرام.</p>}
    {(alerts ?? []).map(alert => <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div><p className="font-semibold">{alert.is_test ? "تجربة — " : ""}{alert.event_type} · {alert.student_name}</p><p className="text-sm text-muted-foreground">{alert.class_name} · {alert.telegram_status === "accepted" ? "قبله تيليجرام" : alert.telegram_status === "failed" ? "فشل تيليجرام" : "بانتظار تيليجرام"} · {alert.decision === "ignored" ? "متجاهل" : alert.decision === "cancelled" ? "ملغى" : alert.decision === "composer_opened" ? "جُهزت SMS — الإرسال غير مؤكد" : "بانتظار قرار الإدارة"}</p></div><Button asChild variant="outline"><Link to="/dashboard/sms-alert" search={{ alert: alert.id }}>مراجعة</Link></Button></div>)}
  </section>;
}