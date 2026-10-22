import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HandDrawnStar } from "@/components/HandDrawnStar";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "تعيين كلمة مرور جديدة — إداروم: صفحة في منصة إداروم للثانوية الجزائرية.",
      },
      { property: "og:title", content: "تعيين كلمة مرور جديدة — إداروم" },
      {
        property: "og:description",
        content: "تعيين كلمة مرور جديدة — إداروم: صفحة في منصة إداروم للثانوية الجزائرية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "تعيين كلمة مرور جديدة — إداروم" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(72, "كلمة المرور طويلة جداً");

function getPasswordError(value: string): string | null {
  const result = passwordSchema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

function getConfirmError(password: string, confirm: string): string | null {
  if (!confirm) return null;
  if (password !== confirm) return "كلمتا المرور غير متطابقتين";
  return null;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const handlePasswordBlur = () => {
    setTouched((t) => ({ ...t, password: true }));
    setPasswordError(getPasswordError(password));
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (touched.password) setPasswordError(getPasswordError(value));
    if (touched.confirm) setConfirmError(getConfirmError(value, confirm));
  };

  const handleConfirmBlur = () => {
    setTouched((t) => ({ ...t, confirm: true }));
    setConfirmError(getConfirmError(password, confirm));
  };

  const handleConfirmChange = (value: string) => {
    setConfirm(value);
    if (touched.confirm) setConfirmError(getConfirmError(password, value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    const pErr = getPasswordError(password);
    const cErr = getConfirmError(password, confirm);
    setPasswordError(pErr);
    setConfirmError(cErr);

    if (pErr || cErr) {
      toast.error(pErr ?? cErr ?? "يرجى تصحيح الأخطاء أعلاه");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("تم تغيير كلمة المرور بنجاح!", {
        description: "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.",
      });
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("same password")) {
        toast.error("كلمة المرور الجديدة مطابقة للقديمة", {
          description: "اختر كلمة مرور مختلفة عن السابقة.",
        });
      } else if (msg.toLowerCase().includes("weak")) {
        toast.error("كلمة المرور ضعيفة", {
          description: "استخدم مزيجاً من الأحرف والأرقام والرموز.",
        });
      } else {
        toast.error("تعذّر تحديث كلمة المرور", {
          description: "قد يكون الرابط منتهياً. طلب رابط جديد من صفحة نسيت كلمة المرور.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <HandDrawnStar size={32} />
          <span className="text-xl font-display">إداروم</span>
        </div>
        <Card>
          <CardHeader>
            <h1 className="sr-only">تعيين كلمة مرور جديدة لحساب إداروم</h1>
            <CardTitle className="font-display text-2xl">كلمة مرور جديدة</CardTitle>
            <p className="text-sm text-muted-foreground">
              اختر كلمة مرور قوية وآمنة (8 أحرف على الأقل).
            </p>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  الرابط غير صالح أو انتهت مدّته. اطلب رابطاً جديداً.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/forgot-password">طلب رابط جديد</Link>
                </Button>
              </div>
            ) : done ? (
              <div className="space-y-4 text-center">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                  <p className="font-medium">تم تغيير كلمة المرور بنجاح!</p>
                  <p className="mt-1 text-sm">سيتم توجيهك الآن إلى صفحة تسجيل الدخول...</p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">تسجيل الدخول الآن</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="password">كلمة المرور الجديدة</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    onBlur={handlePasswordBlur}
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? "password-error" : "password-help"}
                    className={
                      passwordError ? "border-destructive focus-visible:ring-destructive" : ""
                    }
                  />
                  {passwordError ? (
                    <p id="password-error" className="text-[0.8rem] font-medium text-destructive">
                      {passwordError}
                    </p>
                  ) : (
                    <p id="password-help" className="text-[0.8rem] text-muted-foreground">
                      استخدم 8 أحرف على الأقل (أحرف، أرقام، رموز).
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => handleConfirmChange(e.target.value)}
                    onBlur={handleConfirmBlur}
                    aria-invalid={!!confirmError}
                    aria-describedby={confirmError ? "confirm-error" : undefined}
                    className={
                      confirmError ? "border-destructive focus-visible:ring-destructive" : ""
                    }
                  />
                  {confirmError && (
                    <p id="confirm-error" className="text-[0.8rem] font-medium text-destructive">
                      {confirmError}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
