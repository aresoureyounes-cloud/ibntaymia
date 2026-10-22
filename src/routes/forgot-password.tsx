import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HandDrawnStar } from "@/components/HandDrawnStar";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "استعادة كلمة المرور — إداروم" },
      {
        name: "description",
        content:
          "أعد تعيين كلمة المرور لحسابك في منصة إداروم بأمان عبر رابط استعادة يُرسل إلى بريدك الإلكتروني المسجّل.",
      },
      { property: "og:title", content: "استعادة كلمة المرور — إداروم" },
      {
        property: "og:description",
        content: "صفحة استعادة كلمة المرور لمنصة إداروم — رابط آمن يُرسل عبر البريد الإلكتروني.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

const emailSchema = z
  .string()
  .min(1, "يرجى إدخال البريد الإلكتروني")
  .email("البريد الإلكتروني غير صالح، تأكد من كتابته بشكل صحيح")
  .max(255, "البريد الإلكتروني طويل جداً");

function validateEmail(value: string): string | null {
  const result = emailSchema.safeParse(value.trim());
  return result.success ? null : result.error.issues[0].message;
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleBlur = () => {
    setTouched(true);
    setEmailError(validateEmail(email));
  };

  const handleChange = (value: string) => {
    setEmail(value);
    if (touched) {
      setEmailError(validateEmail(value));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const error = validateEmail(email);
    setEmailError(error);
    if (error) {
      toast.error(error, { description: "صحّح البريد الإلكتروني وأعد المحاولة." });
      return;
    }

    setSubmitting(true);
    try {
      const { error: supaError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (supaError) throw supaError;
      setSent(true);
      toast.success("تم إرسال رابط الاستعادة", {
        description: `تحقق من صندوق الوارد والرسائل المزعجة (Spam) لدى ${email.trim()}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rate limit")) {
        toast.error("طلبات كثيرة جداً", {
          description: "يرجى الانتظار قليلاً قبل إعادة المحاولة.",
        });
      } else {
        toast.error("حدث خطأ أثناء الإرسال", {
          description:
            "تأكد من صحة البريد الإلكتروني وحاول مرة أخرى. إذا استمرّ المشكل، تواصل مع الدعم.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <HandDrawnStar size={32} />
          <span className="text-xl font-display">إداروم</span>
        </div>
        <Card>
          <CardHeader>
            <h1 className="sr-only">استعادة كلمة المرور لحساب إداروم</h1>
            <CardTitle className="font-display text-2xl">نسيت كلمة المرور؟</CardTitle>
            <p className="text-sm text-muted-foreground">
              أدخل بريدك الإلكتروني وسنرسل لك رابطاً آمناً لإعادة التعيين.
            </p>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                  <p className="font-medium">تم إرسال الرابط بنجاح!</p>
                  <p className="mt-1 text-sm">
                    تحقق من بريدك <strong dir="ltr">{email}</strong>. إن لم تجد الرسالة، راجع صندوق
                    الرسائل المزعجة (Spam).
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">العودة لتسجيل الدخول</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={handleBlur}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "email-error" : "email-help"}
                    className={
                      emailError ? "border-destructive focus-visible:ring-destructive" : ""
                    }
                  />
                  {emailError ? (
                    <p id="email-error" className="text-[0.8rem] font-medium text-destructive">
                      {emailError}
                    </p>
                  ) : (
                    <p id="email-help" className="text-[0.8rem] text-muted-foreground">
                      أدخل نفس البريد المسجّل لدى المؤسسة.
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
                </Button>
                <p className="text-center text-xs">
                  <Link to="/login" className="text-primary hover:underline">
                    العودة لتسجيل الدخول
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
