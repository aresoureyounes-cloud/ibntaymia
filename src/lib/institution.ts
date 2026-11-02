import { z } from "zod";

export const institutionSchema = z.object({
  name: z.string().trim().min(2, "أدخل اسم المؤسسة").max(160),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.string().trim().email("البريد غير صالح").max(160)]),
  academic_year: z.string().trim().max(40),
  logo_data_url: z.string().max(300000).refine(value => value === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), "اختر صورة PNG أو JPEG أو WebP صغيرة"),
  published_origin: z.string().trim().max(250).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
    } catch { return false; }
  }, "أدخل عنوان الموقع المنشور فقط، دون مسار، ويبدأ بـ https://"),
});

export type InstitutionInput = z.infer<typeof institutionSchema>;
export const emptyInstitution: InstitutionInput = {
  name: "", address: "", phone: "", email: "", academic_year: "", logo_data_url: "", published_origin: "",
};

export function canManageInstitution(roles: readonly string[]) {
  return roles.some(role => ["admin", "director", "developer"].includes(role));
}

export function requirePublishedOrigin(value: string | null | undefined) {
  const parsed = institutionSchema.shape.published_origin.safeParse(value ?? "");
  if (!parsed.success || !parsed.data) throw new Error("اضبط عنوان الموقع المنشور في بيانات المؤسسة أولاً.");
  return parsed.data;
}