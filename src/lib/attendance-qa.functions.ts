import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  question: z.string().trim().min(2).max(500),
  studentName: z.string().trim().min(1).max(200),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z
    .array(
      z.object({
        date: z.string().max(20),
        period: z.string().max(50).nullable(),
        subject: z.string().max(200).nullable(),
        status: z.string().max(20),
        note: z.string().max(500).nullable(),
      }),
    )
    .max(400),
});

export const askAttendanceQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "خدمة الذكاء الاصطناعي غير مهيأة." };
    const { answerAttendanceQuestion } = await import("./ai/attendance-qa.server");
    try {
      const answer = await answerAttendanceQuestion(
        apiKey,
        data.question,
        data.studentName,
        { from: data.from, to: data.to },
        data.rows,
      );
      return { ok: true as const, answer };
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("attendance QA failed", status, e);
      const error =
        status === 429
          ? "عدد الطلبات كبير حالياً، حاول بعد قليل."
          : status === 402
            ? "نفد رصيد الذكاء الاصطناعي لمساحة العمل."
            : status === 403
              ? "تم رفض الطلب من خدمة الذكاء الاصطناعي."
              : "تعذر الإجابة الآن، حاول مرة أخرى.";
      return { ok: false as const, error };
    }
  });
