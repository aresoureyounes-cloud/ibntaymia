import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PermissionDef = { key: string; label: string; hint?: string; enforced?: boolean };
export type PermissionGroup = { title: string; items: PermissionDef[] };

/** enforced = blocked by the database itself, not only hidden in the interface. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "الحضور والغياب",
    items: [
      { key: "attendance.take", label: "تسجيل الحضور (فتح جلسة)", enforced: true },
      { key: "attendance.replacement", label: "تسجيل حضور قسم أستاذ غائب (استخلاف)", enforced: true },
      { key: "attendance.extra", label: "تسجيل حصة إضافية خارج الجدول", enforced: true },
      { key: "attendance.edit_after_save", label: "تعديل الحضور مرة ثانية بعد الحفظ", hint: "تخضع للمدة المحددة في الحدود", enforced: true },
      { key: "attendance.override_late", label: "تغيير حالة «متأخر» دون تبرير", enforced: true },
      { key: "attendance.delete_session", label: "حذف جلسة حضور كاملة", enforced: true },
      { key: "attendance.view_all_classes", label: "رؤية حضور جميع الأقسام" },
      { key: "attendance.justify", label: "قبول أو رفض تبرير الغياب" },
    ],
  },
  {
    title: "التلاميذ والأقسام",
    items: [
      { key: "students.manage", label: "إضافة وتعديل وحذف التلاميذ" },
      { key: "classes.manage", label: "إنشاء وتعديل الأقسام" },
      { key: "behavior.manage", label: "تسجيل ملاحظات السلوك" },
    ],
  },
  {
    title: "جدول التوقيت والواجبات",
    items: [
      { key: "schedule.manage", label: "تعديل جدول التوقيت" },
      { key: "schedule.view_all", label: "رؤية جداول جميع الأقسام والأساتذة" },
      { key: "homework.manage", label: "إضافة وتعديل الواجبات" },
    ],
  },
  {
    title: "التواصل والتقارير",
    items: [
      { key: "notifications.send", label: "إرسال إشعارات" },
      { key: "reports.export", label: "تصدير وطباعة التقارير" },
      { key: "meetings.review", label: "الرد على طلبات مواعيد الأولياء" },
      { key: "meetings.request", label: "طلب موعد مع الإدارة" },
      { key: "justification.submit", label: "تقديم تبرير غياب" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const LIMIT_SETTINGS = [
  { key: "attendance_edit_window_hours", label: "مدة تعديل الحضور بعد فتح الجلسة (بالساعات)", hint: "0 = بدون حد زمني" },
  { key: "attendance_backdate_days", label: "أقصى عدد أيام للتسجيل بتاريخ سابق", hint: "0 = اليوم فقط" },
];

/** Asks the database whether the signed-in user holds a permission. */
export function usePermission(perm: string, userId: string | undefined) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase
      .rpc("has_permission" as never, { _user_id: userId, _perm: perm } as never)
      .then(({ data }) => setAllowed(data === true));
  }, [perm, userId]);
  return allowed;
}
