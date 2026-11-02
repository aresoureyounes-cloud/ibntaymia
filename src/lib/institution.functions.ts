import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { institutionSchema, canManageInstitution } from "./institution";

export const saveInstitution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => institutionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles")
      .select("role").eq("user_id", context.userId);
    if (roleError || !canManageInstitution((roles ?? []).map(row => row.role))) {
      throw new Error("حفظ بيانات المؤسسة متاح للإدارة المخولة فقط.");
    }
    const { data: row, error } = await context.supabase.from("institution_settings")
      .upsert({ id: true, ...data, updated_by: context.userId, updated_at: new Date().toISOString() })
      .select("*").single();
    if (error) throw new Error("تعذر حفظ بيانات المؤسسة؛ أعد المحاولة.");
    return row;
  });