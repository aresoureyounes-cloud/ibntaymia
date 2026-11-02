import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authorizeTelegramStaff, dispatchTelegramAlerts } from "./telegram-alerts.server";
import { canPrepareSms, normalizeGuardianPhone, preparedSms } from "./telegram-alerts";
import { requirePublishedOrigin } from "./institution";

const alertId = z.object({ id: z.string().uuid() });

export const readTelegramAlert = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => alertId.parse(input)).handler(async ({ data, context }) => {
  await authorizeTelegramStaff(context.supabase, context.userId);
  const { data: row, error } = await context.supabase.from("telegram_alerts").select("*").eq("id", data.id).single();
  if (error) throw new Error(error.message);
  return row;
});

export const decideTelegramAlert = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => alertId.extend({ decision: z.enum(["composer_opened", "ignored"]) }).parse(input)).handler(async ({ data, context }) => {
  await authorizeTelegramStaff(context.supabase, context.userId);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await db.from("telegram_alerts").select("*").eq("id", data.id).single();
  if (error) throw new Error(error.message);
  if (["ignored", "cancelled"].includes(row.decision)) throw new Error("هذا التنبيه متجاهل أو ملغى؛ لا يمكن تجهيز رسالة له.");
  if (data.decision === "composer_opened" && !canPrepareSms(row)) throw new Error("لا يوجد رقم هاتف صالح لهذا التنبيه.");
  const phone = data.decision === "composer_opened" ? normalizeGuardianPhone(row.guardian_phone ?? "") : null;
  const { error: updateError, data: updated } = await db.from("telegram_alerts").update({ decision: data.decision, decided_by: context.userId, decided_at: new Date().toISOString() }).eq("id", data.id).in("decision", ["pending", "composer_opened"]).select("id").maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("تغيرت حالة التنبيه؛ حدّث الصفحة.");
  return { phone, body: preparedSms(row), decision: data.decision };
});

export const configureTelegram = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => z.object({ chatId: z.string().regex(/^-?\d{5,20}$/), enabled: z.boolean() }).parse(input)).handler(async ({ data, context }) => {
  await authorizeTelegramStaff(context.supabase, context.userId, true);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { error } = await db.from("telegram_settings").upsert({ id: true, chat_id: data.chatId, enabled: data.enabled });
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const sendTelegramTest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => z.object({ studentName: z.string().trim().min(2).max(120), className: z.string().trim().min(1).max(120), guardianName: z.string().trim().min(2).max(120), phone: z.string().max(30) }).parse(input)).handler(async ({ data, context }) => {
  await authorizeTelegramStaff(context.supabase, context.userId, true);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await db.from("telegram_alerts").insert({ source_key: `test:${crypto.randomUUID()}`, event_type: "غياب", student_name: data.studentName, class_name: data.className, guardian_name: data.guardianName, guardian_phone: normalizeGuardianPhone(data.phone), details: `تاريخ التجربة: ${new Date().toLocaleDateString("ar-DZ", { timeZone: "Africa/Algiers" })} — لم يسجل غياب فعلي.`, is_test: true }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: row.id };
});

export const flushTelegram = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await authorizeTelegramStaff(context.supabase, context.userId);
  const gatewayKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["TELEGRAM_API_KEY"];
  if (!gatewayKey || !connectionKey) throw new Error("اتصال تيليجرام غير مضبوط.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: institution, error } = await context.supabase.from("institution_settings").select("published_origin").eq("id", true).maybeSingle();
  if (error) throw new Error("تعذر قراءة عنوان المؤسسة.");
  return dispatchTelegramAlerts(db, gatewayKey, connectionKey, requirePublishedOrigin(institution?.published_origin));
});