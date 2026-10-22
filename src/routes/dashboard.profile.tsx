import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Save, KeyRound, ShieldAlert, History, X } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { resolveAvatarUrl } from "@/lib/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { HandDrawnStar } from "@/components/HandDrawnStar";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "الملف الشخصي — إداروم" },
      { name: "description", content: "إداروم: الملف الشخصي في الثانوية الجزائرية." },
      { property: "og:title", content: "الملف الشخصي — إداروم" },
      { property: "og:description", content: "إداروم: الملف الشخصي في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const schema = z.object({
  full_name: z.string().trim().min(2, "الاسم قصير جداً").max(120),
  preferred_language: z.enum(["ar", "fr", "en"]),
});

const passwordSchema = z
  .object({
    current: z.string().min(1, "أدخل كلمة المرور الحالية"),
    password: z
      .string()
      .min(8, "كلمة المرور 8 أحرف على الأقل")
      .max(72)
      .regex(/[A-Za-z]/, "يجب أن تحتوي على حرف")
      .regex(/[0-9]/, "يجب أن تحتوي على رقم"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirm"],
  })
  .refine((v) => v.current !== v.password, {
    message: "كلمة المرور الجديدة يجب أن تختلف عن الحالية",
    path: ["password"],
  });

async function logAudit(userId: string, action: string, details: Record<string, unknown> = {}) {
  try {
    await supabase.from("profile_audit_log").insert({
      user_id: userId,
      action,
      details: details as never,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch {
    /* audit failure must never block the user */
  }
}

function ProfilePage() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin") || roles.includes("developer");

  // Hard client-side guard — server RLS still governs data access.
  useEffect(() => {
    if (!loading && user && !isAdmin) {
      toast.error("هذه الصفحة مخصصة للمسؤول فقط");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, user, isAdmin, navigate]);

  const [fullName, setFullName] = useState("");
  const [lang, setLang] = useState<"ar" | "fr" | "en">("ar");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, preferred_language, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: auditLog } = useQuery({
    queryKey: ["profile-audit", user?.id],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_audit_log")
        .select("id, action, details, created_at, user_agent")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setLang((profile.preferred_language as "ar" | "fr" | "en") ?? "ar");
    setAvatarPath(profile.avatar_url ?? null);
    let cancelled = false;
    resolveAvatarUrl(profile.avatar_url).then((url) => {
      if (!cancelled) setAvatarPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  const handleFilePick = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError(
        `نوع الملف غير مدعوم (${file.type || "غير معروف"}). المسموح: JPG, PNG, WEBP, GIF.`,
      );
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(2);
      setFileError(`الحجم ${mb}MB يتجاوز الحد الأقصى 2MB.`);
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const cancelPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setFileError(null);
  };

  const confirmUpload = async () => {
    if (!user || !pendingFile) return;
    setUploading(true);
    try {
      const ext = (pendingFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
      if (upErr) throw upErr;
      const prev = avatarPath;
      setAvatarPath(path);
      const signed = await resolveAvatarUrl(path);
      setAvatarPreview(signed);
      cancelPending();
      await logAudit(user.id, "avatar_uploaded", {
        path,
        size: pendingFile.size,
        type: pendingFile.type,
        previous: prev,
      });
      qc.invalidateQueries({ queryKey: ["profile-audit"] });
      toast.success("تم رفع الصورة، لا تنسَ الحفظ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ full_name: fullName, preferred_language: lang });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "خطأ");
      return;
    }
    setSaving(true);
    try {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (profile?.full_name !== parsed.data.full_name) {
        changes.full_name = { from: profile?.full_name, to: parsed.data.full_name };
      }
      if (profile?.preferred_language !== parsed.data.preferred_language) {
        changes.preferred_language = {
          from: profile?.preferred_language,
          to: parsed.data.preferred_language,
        };
      }
      if (profile?.avatar_url !== avatarPath) {
        changes.avatar_url = { from: profile?.avatar_url, to: avatarPath };
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.data.full_name,
          preferred_language: parsed.data.preferred_language,
          avatar_url: avatarPath,
        })
        .eq("id", user.id);
      if (error) throw error;
      if (Object.keys(changes).length) {
        await logAudit(user.id, "profile_updated", { changes });
      }
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["sidebar-avatar"] });
      qc.invalidateQueries({ queryKey: ["profile-audit"] });
      toast.success("تم حفظ التغييرات");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (!user?.email) return;
    const parsed = passwordSchema.safeParse({ current, password: pwd, confirm: pwd2 });
    if (!parsed.success) {
      setPwdError(parsed.error.issues[0]?.message ?? "خطأ");
      return;
    }
    setPwdSaving(true);
    try {
      // 1) Re-verify the current password before allowing the change.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: parsed.data.current,
      });
      if (reauthErr) {
        setPwdError("كلمة المرور الحالية غير صحيحة");
        await logAudit(user.id, "password_change_failed", { reason: "reauth_failed" });
        return;
      }

      // 2) Update the password.
      const { error: updErr } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updErr) throw updErr;

      await logAudit(user.id, "password_changed", {});

      // 3) Force a fresh session: sign out then sign in with the new password.
      await supabase.auth.signOut({ scope: "others" as never }).catch(() => {});
      const { error: signinErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: parsed.data.password,
      });
      if (signinErr) {
        // Fallback: full sign-out and back to login.
        await supabase.auth.signOut();
        toast.success("تم تحديث كلمة المرور، يرجى تسجيل الدخول من جديد");
        navigate({ to: "/login", replace: true });
        return;
      }

      setCurrent("");
      setPwd("");
      setPwd2("");
      qc.invalidateQueries({ queryKey: ["profile-audit"] });
      toast.success("تم تحديث كلمة المرور وتحديث الجلسة");
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : String(err));
    } finally {
      setPwdSaving(false);
    }
  };

  const actionLabel = useMemo(
    () => (a: string) =>
      ({
        avatar_uploaded: "رفع صورة جديدة",
        profile_updated: "تعديل البيانات",
        password_changed: "تغيير كلمة المرور",
        password_change_failed: "محاولة فاشلة لتغيير كلمة المرور",
      })[a] ?? a,
    [],
  );

  if (loading) return <p className="p-4 text-muted-foreground">جارٍ التحميل...</p>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            هذه الصفحة مخصصة لحساب المسؤول فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="الملف الشخصي (المسؤول)" description="عدّل بياناتك وصورتك الشخصية." />

      <Card>
        <CardHeader>
          <CardTitle className="font-display">معلوماتي</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">جارٍ التحميل...</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border-2 border-border bg-muted">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="صورة الملف الشخصي"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <HandDrawnStar size={36} className="text-muted-foreground" />
                  )}
                </div>

                {pendingPreview && (
                  <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                    <img
                      src={pendingPreview}
                      alt="معاينة"
                      className="h-16 w-16 rounded-full object-cover"
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">معاينة قبل الحفظ</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={confirmUpload}
                          disabled={uploading}
                        >
                          {uploading ? "جارٍ الرفع..." : "رفع"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={cancelPending}
                          disabled={uploading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      handleFilePick(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm">
                    <Upload className="h-4 w-4" />
                    اختيار صورة
                  </span>
                </label>
              </div>

              {fileError && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {fileError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                المسموح: JPG, PNG, WEBP, GIF — الحد الأقصى 2 ميجابايت.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="full_name">الاسم الكامل</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" value={user?.email ?? ""} disabled />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lang">اللغة المفضلة</Label>
                <Select value={lang} onValueChange={(v) => setLang(v as "ar" | "fr" | "en")}>
                  <SelectTrigger id="lang">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">تغيير كلمة المرور</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cur">كلمة المرور الحالية</Label>
              <Input
                id="cur"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd">كلمة المرور الجديدة</Label>
              <Input
                id="pwd"
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd2">تأكيد كلمة المرور</Label>
              <Input
                id="pwd2"
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {pwdError && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {pwdError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              سيتم التحقق من كلمة المرور الحالية وتحديث الجلسة تلقائياً بعد التغيير.
            </p>
            <Button type="submit" disabled={pwdSaving} className="gap-2">
              <KeyRound className="h-4 w-4" />
              {pwdSaving ? "جارٍ التحديث..." : "تحديث كلمة المرور"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <History className="h-5 w-5" />
            سجل التعديلات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!auditLog?.length ? (
            <p className="text-sm text-muted-foreground">لا توجد عمليات مسجّلة بعد.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {auditLog.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium">{actionLabel(row.action)}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
