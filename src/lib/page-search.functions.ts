import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  query: z.string().trim().min(2).max(500),
  pages: z
    .array(
      z.object({
        url: z.string().max(2000),
        path: z.string().max(500),
        title: z.string().max(300),
        excerpt: z.string().max(1500),
      }),
    )
    .min(1)
    .max(80),
});

export const searchSavedPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "خدمة الذكاء الاصطناعي غير مهيأة." };
    const { rankSavedPages } = await import("./ai/page-search.server");
    try {
      const matches = await rankSavedPages(apiKey, data.query, data.pages);
      return { ok: true as const, matches };
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("page search failed", status, e);
      const error =
        status === 429
          ? "عدد الطلبات كبير حالياً، حاول بعد قليل."
          : status === 402
            ? "نفد رصيد الذكاء الاصطناعي لمساحة العمل."
            : status === 403
              ? "تم رفض الطلب من خدمة الذكاء الاصطناعي."
              : "تعذر البحث الآن، حاول مرة أخرى.";
      return { ok: false as const, error };
    }
  });
