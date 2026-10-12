/**
 * Turns database / network errors into short Arabic sentences for users.
 * Messages raised by our own triggers ("CODE: نص عربي") keep their Arabic text.
 */
export function friendlyError(err: unknown): string {
  const e = (err ?? {}) as { message?: string; code?: string; details?: string };
  const msg = e.message ?? String(err ?? "");
  const code = e.code ?? "";

  // Our triggers: "PERM_DENIED: ...", "SCHED_TEACHER_CONFLICT: ..."
  const own = msg.match(/^[A-Z_]+:\s*(.+)$/s);
  if (own && /[\u0600-\u06FF]/.test(own[1])) return own[1].trim();

  const known: Record<string, string> = {
    PERM_DENIED: "ليست لديك صلاحية للقيام بهذه العملية.",
    TITLE_REQUIRED: "العنوان مطلوب.",
    CLASS_REQUIRED: "اختر القسم.",
    BAD_TARGET: "فئة المستلمين غير صحيحة.",
    UNAUTHENTICATED: "انتهت الجلسة، سجّل الدخول من جديد.",
    FORBIDDEN: "ليست لديك صلاحية لرؤية هذه البيانات.",
  };
  for (const k of Object.keys(known)) if (msg.startsWith(k)) return known[k];

  if (code === "23505" || /duplicate key/i.test(msg)) return "هذا السجل موجود مسبقاً.";
  if (code === "23503" || /foreign key/i.test(msg)) return "لا يمكن إتمام العملية لأن هذا العنصر مرتبط ببيانات أخرى.";
  if (code === "23502" || /null value/i.test(msg)) return "هناك حقل مطلوب فارغ.";
  if (code === "23514" || /check constraint/i.test(msg)) return "إحدى القيم المدخلة غير مقبولة.";
  if (code === "22P02" || /invalid input syntax/i.test(msg)) return "صيغة إحدى القيم غير صحيحة.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg))
    return "ليست لديك صلاحية للقيام بهذه العملية.";
  if (code === "PGRST116") return "العنصر غير موجود أو تم حذفه.";
  if (/JWT|token|not authenticated|Unauthorized/i.test(msg)) return "انتهت الجلسة، سجّل الدخول من جديد.";
  if (/Failed to fetch|NetworkError|network|offline/i.test(msg))
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.";
  if (/Invalid login credentials/i.test(msg)) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (/Email not confirmed/i.test(msg)) return "لم يتم تأكيد البريد الإلكتروني بعد.";
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  return "حدث خطأ غير متوقع. أعد المحاولة، وإن تكرر أبلغ الإدارة.";
}
