export type TelegramAlert = {
  id: string;
  event_type: string;
  student_name: string;
  class_name: string;
  guardian_name: string;
  guardian_phone: string | null;
  details: string;
  event_at: string;
  is_test: boolean;
  decision: string;
  telegram_status: string;
};

export function normalizeGuardianPhone(phone: string): string {
  const clean = phone.replace(/[\s()-]/g, "");
  if (/^0[567]\d{8}$/.test(clean)) return `+213${clean.slice(1)}`;
  if (/^(?:\+213|00213)[567]\d{8}$/.test(clean)) return clean.replace(/^00213/, "+213");
  throw new Error("رقم هاتف الولي غير صالح؛ استخدم رقماً جزائرياً صحيحاً.");
}

export function preparedSms(alert: TelegramAlert): string {
  return `${alert.is_test ? "[تجربة فقط — ليس غياباً فعلياً]\n" : ""}إداروم — ${alert.event_type}\nالسيد/السيدة ${alert.guardian_name || "ولي التلميذ"}، نعلمكم بحدث ${alert.event_type} للتلميذ ${alert.student_name}، القسم ${alert.class_name || "غير محدد"}.\n${alert.details}\nيرجى التواصل مع إدارة الثانوية للاستفسار.`;
}

export function smsComposerLink(phone: string, body: string, apple: boolean): string {
  return `sms:${normalizeGuardianPhone(phone)}${apple ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

export function canPrepareSms(alert: TelegramAlert): boolean {
  return Boolean(alert.guardian_phone) && !["ignored", "cancelled"].includes(alert.decision);
}