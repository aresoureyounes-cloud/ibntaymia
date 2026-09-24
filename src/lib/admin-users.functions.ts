import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({ email: z.string().trim().email().max(255) });

export const findUserIdByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    // Authorize: only admin/director/supervisor may resolve emails to user ids.
    const allowed = await Promise.all(
      (["admin", "director", "supervisor"] as const).map(async (r) => {
        const { data: ok } = await context.supabase.rpc("has_role", {
          _user_id: context.userId,
          _role: r,
        });
        return ok === true;
      }),
    );
    if (!allowed.some(Boolean)) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Paginate auth.users to find the email (admin API has no filter param).
    let page = 1;
    const needle = data.email.toLowerCase();
    while (page <= 25) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === needle);
      if (hit) return { userId: hit.id };
      if (list.users.length < 200) break;
      page++;
    }
    return { userId: null };
  });
