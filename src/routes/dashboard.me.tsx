import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserRound, Upload, Save, Palette, Languages, Sun, Moon, X, Type, Lock } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { resolveAvatarUrl } from "@/lib/avatar";
import { useTheme } from "@/lib/theme";
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  applyAppearance,
  loadAppearance,
  saveAppearance,
  type AccentId,
  type Appearance,
  type DensityId,
} from "@/lib/appearance";
import {
  LANGUAGE_DIR,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  applyLanguageToDocument,
  type SupportedLanguage,
} from "@/i18n/config";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/dashboard/me")({
  head: () => ({
    meta: [
      { title: "ملفي الشخصي — إداروم" },
      {
        name: "description",
        content: "حدّث اسمك وصورتك ولغتك المفضّلة، وخصّص مظهر إداروم كما يناسبك.",
      },
      { property: "og:title", content: "ملفي الشخصي — إداروم" },
      {
        property: "og:description",
        content: "حدّث اسمك وصورتك ولغتك المفضّلة، وخصّص مظهر إداروم كما يناسبك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyProfilePage,
});

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  preferred_language: z.enum(["ar", "fr", "en"]),
});

const DENSITIES: DensityId[] = ["compact", "cozy", "roomy"];

function MyProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [fullName, setFullName] = useState("");
  const [lang, setLang] = useState<SupportedLanguage>("ar");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    setAppearance(loadAppearance());
  }, []);

  const updateAppearance = (patch: Partial<Appearance>) => {
    setAppearance((prev) => {
      const next = { ...prev, ...patch };
      saveAppearance(next);
      applyAppearance(next);
      return next;
    });
  };

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
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

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    const pl = (profile.preferred_language as SupportedLanguage) ?? "ar";
    setLang((SUPPORTED_LANGUAGES as readonly string[]).includes(pl) ? pl : "ar");
    setAvatarPath(profile.avatar_url ?? null);
    let cancelled = false;
    void resolveAvatarUrl(profile.avatar_url).then((url) => {
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

  const pickLanguage = (lng: SupportedLanguage) => {
    setLang(lng);
    void i18n.changeLanguage(lng);
    applyLanguageToDocument(lng);
  };

  const handleFilePick = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError(t("myprofile.bad_type"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setFileError(t("myprofile.too_big"));
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
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
      if (error) throw error;
      setAvatarPath(path);
      setAvatarPreview(await resolveAvatarUrl(path));
      cancelPending();
      toast.success(t("myprofile.uploaded"));
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
      toast.error(t("myprofile.name_short"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.data.full_name,
          preferred_language: parsed.data.preferred_language,
          avatar_url: avatarPath,
        })
        .eq("id", user.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["sidebar-avatar"] });
      toast.success(t("myprofile.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const shownAvatar = pendingPreview ?? avatarPreview;
  const initials = (fullName || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("myprofile.title")}
        description={t("myprofile.subtitle")}
        icon={<UserRound className="h-5 w-5" />}
      />

      {/* Read-only account information — available to every role */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </span>
          <CardTitle>{t("myprofile.account")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-muted-foreground">{t("myprofile.email")}</Label>
              <p className="mt-1 break-all text-sm font-medium">{user?.email ?? "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">{t("myprofile.my_roles")}</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {roles.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {t(`roles.${r}`)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">{t("myprofile.user_id")}</Label>
              <p dir="ltr" className="mt-1 break-all font-mono text-xs">
                {user?.id ?? "—"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("myprofile.account_hint")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identity */}
        <Card className="glass lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="h-4 w-4" />
            </span>
            <CardTitle>{t("myprofile.identity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex flex-wrap items-center gap-5">
                <div className="squircle grid h-24 w-24 shrink-0 place-items-center overflow-hidden border border-border bg-muted text-2xl font-semibold text-muted-foreground">
                  {shownAvatar ? (
                    <img
                      src={shownAvatar}
                      alt={fullName || t("myprofile.photo")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar" className="text-sm font-medium">
                    {t("myprofile.photo")}
                  </Label>
                  <Input
                    id="avatar"
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    onChange={(e) => handleFilePick(e.target.files?.[0])}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">{t("myprofile.photo_hint")}</p>
                  {fileError ? <p className="text-xs text-destructive">{fileError}</p> : null}
                  {pendingFile ? (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={confirmUpload} disabled={uploading}>
                        <Upload className="me-2 h-4 w-4" />
                        {uploading ? t("common.loading") : t("myprofile.upload")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={cancelPending}>
                        <X className="me-2 h-4 w-4" />
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="full_name">{t("myprofile.full_name")}</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={120}
                  className="max-w-md"
                />
              </div>

              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  {t("myprofile.language")}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGES.map((lng) => (
                    <button
                      key={lng}
                      type="button"
                      onClick={() => pickLanguage(lng)}
                      aria-pressed={lang === lng}
                      className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                        lang === lng
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {LANGUAGE_NAMES[lng]}
                      <span className="ms-2 text-[11px] uppercase text-muted-foreground">
                        {LANGUAGE_DIR[lng]}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("myprofile.language_hint")}</p>
              </div>

              <Button type="submit" disabled={saving}>
                <Save className="me-2 h-4 w-4" />
                {saving ? t("common.loading") : t("common.save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="glass">
          <CardHeader className="flex flex-row items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
              <Palette className="h-4 w-4" />
            </span>
            <CardTitle>{t("myprofile.appearance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t("myprofile.mode")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="me-2 h-4 w-4" />
                  {t("myprofile.light")}
                </Button>
                <Button
                  type="button"
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="me-2 h-4 w-4" />
                  {t("myprofile.dark")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("myprofile.accent")}</Label>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={id}
                    aria-pressed={appearance.accent === id}
                    onClick={() => updateAppearance({ accent: id })}
                    className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
                      appearance.accent === id ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ background: ACCENTS[id].swatch }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                {t("myprofile.text_size")}
                <Badge variant="secondary">{Math.round(appearance.fontScale * 100)}%</Badge>
              </Label>
              <Slider
                min={90}
                max={120}
                step={5}
                value={[Math.round(appearance.fontScale * 100)]}
                onValueChange={([v]) => updateAppearance({ fontScale: (v ?? 100) / 100 })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("myprofile.density")}</Label>
              <div className="flex flex-wrap gap-2">
                {DENSITIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={appearance.density === d}
                    onClick={() => updateAppearance({ density: d })}
                    className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                      appearance.density === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {t(`myprofile.density_${d}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="reduced-motion">{t("myprofile.reduced_motion")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("myprofile.reduced_motion_hint")}
                </p>
              </div>
              <Switch
                id="reduced-motion"
                checked={appearance.reducedMotion}
                onCheckedChange={(v) => updateAppearance({ reducedMotion: v })}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                saveAppearance(DEFAULT_APPEARANCE);
                applyAppearance(DEFAULT_APPEARANCE);
                setAppearance(DEFAULT_APPEARANCE);
              }}
            >
              {t("myprofile.reset")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
