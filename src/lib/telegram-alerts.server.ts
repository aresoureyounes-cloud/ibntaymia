import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { TelegramAlert } from "./telegram-alerts";

export async function authorizeTelegramStaff(db: SupabaseClient<Database>, userId: string, configure = false) {
  const roles = configure ? ["admin", "director", "developer"] as const : ["admin", "director", "supervisor", "developer"] as const;
  const checks = await Promise.all(roles.map(role => db.rpc("has_role", { _user_id: userId, _role: role })));
  for (const check of checks) if (check.error) throw new Error(check.error.message);
  if (!checks.some(check => check.data === true)) throw new Error("هذه العملية مخصصة للإدارة المخولة فقط.");
}

export async function dispatchTelegramAlerts(db: SupabaseClient<Database>, gatewayKey: string, connectionKey: string, origin: string) {
  const { data: settings, error: settingsError } = await db.from("telegram_settings").select("*").eq("id", true).maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  if (!settings?.enabled) return { accepted: 0, failed: 0 };
  const { data: alerts, error } = await db.from("telegram_alerts").select("*").eq("telegram_status", "pending").eq("decision", "pending").order("created_at").limit(20);
  if (error) throw new Error(error.message);
  let accepted = 0, failed = 0;
  for (const row of alerts ?? []) {
    const { data: claimed, error: claimError } = await db.from("telegram_alerts").update({ telegram_status: "sending" }).eq("id", row.id).eq("telegram_status", "pending").select("id").maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;
    const alert = row as TelegramAlert;
    const link = `${origin}/dashboard/sms-alert?alert=${encodeURIComponent(row.id)}`;
    try {
      const response = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: settings.chat_id, text: `${row.is_test ? "تجربة فقط — " : ""}إداروم: ${row.event_type}\nالتلميذ: ${row.student_name}\nالقسم: ${row.class_name}\nالولي: ${row.guardian_name || "غير محدد"}\nالهاتف: ${row.guardian_phone || "غير متوفر"}\n${row.details}\n\nفتح SMS لا يثبت الإرسال أو الوصول.`, reply_markup: { inline_keyboard: [[{ text: "ابعث SMS", url: link }, { text: "تجاهل", url: `${link}&action=ignore` }]] } }),
      });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`Telegram [${response.status}]: ${responseBody}`);
      const result = JSON.parse(responseBody) as { ok: boolean; result?: { message_id: number }; description?: string };
      if (!result.ok || !result.result) throw new Error(`Telegram [${response.status}]: ${responseBody}`);
      const { error: writeError } = await db.from("telegram_alerts").update({ telegram_status: "accepted", telegram_message_id: result.result.message_id, telegram_error: null }).eq("id", row.id);
      if (writeError) throw new Error(writeError.message);
      accepted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر إرسال تنبيه تيليجرام";
      console.error(message);
      const { error: writeError } = await db.from("telegram_alerts").update({ telegram_status: "failed", telegram_error: message }).eq("id", row.id);
      if (writeError) throw new Error(writeError.message);
      failed++;
    }
  }
  return { accepted, failed };
}