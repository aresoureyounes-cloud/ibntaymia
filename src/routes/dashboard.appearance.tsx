import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Globe2, Plus, RotateCcw, Save, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ARABIC_FONTS,
  COLOR_PRESETS,
  ICON_REGISTRY,
  LATIN_FONTS,
  TEMPLATES,
  applyTemplate,
  iconFor,
  newTaskbar,
  useAppearance,
  type ButtonStyle,
  type IconStyle,
  type MotionStyle,
  type SurfaceStyle,
  type TaskbarPosition,
  type TaskbarShape,
  type TaskbarStyle,
  type ThemeTemplate,
} from "@/lib/cosma-appearance";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/dashboard/appearance")({
  head: () => ({
    meta: [
      { title: "تخصيص المظهر — إداروم" },
      { name: "description", content: "تخصيص ألوان الموقع والخطوط وأشرطة المهام والأيقونات والأزرار في إداروم." },
      { property: "og:title", content: "تخصيص المظهر — إداروم" },
      { property: "og:description", content: "تخصيص ألوان الموقع والخطوط وأشرطة المهام والأيقونات والأزرار في إداروم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppearancePage,
});

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 flex-1" />
      </div>
    </div>
  );
}

/** Miniature, live rendering of a template: background, card material, buttons. */
function TemplatePreview({ tpl }: { tpl: ThemeTemplate }) {
  const c = tpl.patch.colors;
  const glass = tpl.patch.surface === "glass";
  const flat = tpl.patch.surface === "flat";
  const d = tpl.patch.depth / 100;
  return (
    <div
      aria-hidden="true"
      className="relative h-32 overflow-hidden"
      style={{ background: c.background }}
    >
      <div
        className="absolute -top-6 -start-6 h-24 w-24 rounded-full blur-2xl"
        style={{ background: c.primary, opacity: 0.35 }}
      />
      <div
        className="absolute -bottom-8 end-2 h-20 w-20 rounded-full blur-2xl"
        style={{ background: c.accent, opacity: 0.3 }}
      />
      <div
        className="absolute inset-4 flex flex-col justify-between p-3"
        style={{
          background: glass ? `color-mix(in oklab, ${c.card} 72%, transparent)` : c.card,
          backdropFilter: glass ? "blur(10px) saturate(180%)" : undefined,
          borderRadius: tpl.patch.radius,
          border: flat ? `1px solid color-mix(in oklab, ${c.foreground} 14%, transparent)` : "none",
          boxShadow: flat
            ? "none"
            : `0 ${Math.round(6 + 14 * d)}px ${Math.round(14 + 26 * d)}px -${Math.round(6 + 8 * d)}px color-mix(in oklab, ${c.foreground} ${Math.round(18 + 22 * d)}%, transparent)`,
        }}
      >
        <div className="space-y-1.5">
          <div className="h-2 w-20 rounded-full" style={{ background: c.foreground, opacity: 0.85 }} />
          <div className="h-1.5 w-28 rounded-full" style={{ background: c.foreground, opacity: 0.35 }} />
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-5 w-14"
            style={{
              background: tpl.patch.buttons.style === "solid" ? c.primary : "transparent",
              border: tpl.patch.buttons.style === "solid" ? "none" : `1.5px solid ${c.primary}`,
              borderRadius: Math.min(tpl.patch.buttons.radius, 999),
            }}
          />
          <span
            className="h-5 w-8"
            style={{
              background: `color-mix(in oklab, ${c.accent} 22%, transparent)`,
              borderRadius: Math.min(tpl.patch.buttons.radius, 999),
            }}
          />
        </div>
      </div>
    </div>
  );
}


function AppearancePage() {
  const { appearance: a, update, reset, saving, saveForMe, saveForEveryone, useGlobal } =
    useAppearance();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("developer");
  const [newItem, setNewItem] = useState<Record<string, { label: string; url: string; icon: string }>>({});

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="تخصيص المظهر"
        description="غيّر الألوان والخطوط وأشرطة المهام والأيقونات والأزرار. التغييرات تُطبَّق فوراً."
      />

      {/* Save bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <Button
            onClick={async () => {
              await saveForMe();
              toast.success("تم حفظ المظهر لحسابك");
            }}
            disabled={saving}
          >
            <User className="ml-2 h-4 w-4" />
            حفظ لحسابي فقط
          </Button>
          {isAdmin && (
            <Button
              variant="secondary"
              onClick={async () => {
                await saveForEveryone();
                toast.success("تم تطبيق المظهر على جميع المستخدمين");
              }}
              disabled={saving}
            >
              <Globe2 className="ml-2 h-4 w-4" />
              تطبيق على الجميع
            </Button>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              await useGlobal();
              toast.success("تمت العودة إلى مظهر المؤسسة");
            }}
          >
            <Check className="ml-2 h-4 w-4" />
            استخدام مظهر المؤسسة
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="ml-2 h-4 w-4" />
            استعادة الافتراضي
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إداروم Light</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl space-y-1">
            <Label className="text-sm">النسخة الخفيفة</Label>
            <p className="text-xs text-muted-foreground">
              وضع خفيف جدًا وسريع: بدون مجسّم ثلاثي الأبعاد، وبدون تمويه أو ظلال أو
              حركات، وبخطوط النظام بدل تحميل الخطوط من الإنترنت. يقلّل استهلاك الذاكرة
              والبيانات ويناسب الأجهزة الضعيفة والاتصال البطيء.
            </p>
          </div>
          <Switch
            checked={a.lite}
            onCheckedChange={(v) => update((d) => { d.lite = v; })}
          />
        </CardContent>
      </Card>


      <Tabs defaultValue="templates" dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="templates">القوالب</TabsTrigger>
          <TabsTrigger value="colors">الألوان</TabsTrigger>
          <TabsTrigger value="fonts">الخطوط</TabsTrigger>
          <TabsTrigger value="taskbars">أشرطة المهام</TabsTrigger>
          <TabsTrigger value="ui">الأيقونات والأزرار</TabsTrigger>
        </TabsList>

        {/* -------------------- TEMPLATES -------------------- */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">قوالب تصميم جاهزة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.map((tpl) => {
                const active = a.template === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      update((d) => applyTemplate(d, tpl));
                      toast.success(`تم تطبيق قالب: ${tpl.name}`);
                    }}
                    aria-pressed={active}
                    className={`group overflow-hidden rounded-3xl border p-0 text-start transition-transform duration-300 ease-out active:scale-[0.98] ${
                      active
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-border hover:-translate-y-0.5"
                    }`}
                  >
                    <TemplatePreview tpl={tpl} />
                    <div className="space-y-1 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{tpl.name}</span>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{tpl.tagline}</p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">المواد والحركة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">مادة الأسطح</Label>
                <Select
                  value={a.surface}
                  onValueChange={(v) => update((d) => { d.surface = v as SurfaceStyle; d.template = ""; })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glass">زجاجي شبه شفاف</SelectItem>
                    <SelectItem value="solid">صلب مرفوع</SelectItem>
                    <SelectItem value="flat">مسطّح بحدود رقيقة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">شخصية الحركة</Label>
                <Select
                  value={a.motion}
                  onValueChange={(v) => update((d) => { d.motion = v as MotionStyle; d.template = ""; })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fluid">سلسة زنبركية (نمط آبل)</SelectItem>
                    <SelectItem value="crisp">سريعة وحاسمة</SelectItem>
                    <SelectItem value="none">بدون حركة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs">شدّة العمق والظلال ({a.depth}%)</Label>
                <Slider
                  value={[a.depth]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => update((d) => { d.depth = v ?? 55; })}
                />
                <p className="text-xs text-muted-foreground">
                  ردّ الفعل يظهر لحظة الضغط، والحركة قابلة للمقاطعة في أي لحظة، وتُلغى تلقائيًا
                  لمن يفضّل تقليل الحركة في نظامه.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- COLORS -------------------- */}
        <TabsContent value="colors" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">قوالب جاهزة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    update((d) => {
                      d.colors = { ...p.colors };
                      d.useCustomColors = true;
                    })
                  }
                  className="flex items-center gap-3 rounded-2xl border border-border p-3 text-start transition hover:border-primary"
                >
                  <div className="flex gap-1">
                    {[p.colors.primary, p.colors.accent, p.colors.background].map((c) => (
                      <span
                        key={c}
                        className="h-6 w-6 rounded-full border border-border"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <span className="text-sm">{p.name}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">ألوان مخصّصة</CardTitle>
              <Switch
                checked={a.useCustomColors}
                onCheckedChange={(v) => update((d) => { d.useCustomColors = v; })}
                aria-label="تفعيل الألوان المخصّصة"
              />
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ColorField
                label="اللون الأساسي"
                value={a.colors.primary}
                onChange={(v) => update((d) => { d.colors.primary = v; d.useCustomColors = true; })}
              />
              <ColorField
                label="اللون المميّز"
                value={a.colors.accent}
                onChange={(v) => update((d) => { d.colors.accent = v; d.useCustomColors = true; })}
              />
              <ColorField
                label="الخلفية"
                value={a.colors.background}
                onChange={(v) => update((d) => { d.colors.background = v; d.useCustomColors = true; })}
              />
              <ColorField
                label="البطاقات"
                value={a.colors.card}
                onChange={(v) => update((d) => { d.colors.card = v; d.useCustomColors = true; })}
              />
              <ColorField
                label="القائمة الجانبية"
                value={a.colors.sidebar}
                onChange={(v) => update((d) => { d.colors.sidebar = v; d.useCustomColors = true; })}
              />
              <ColorField
                label="لون النص"
                value={a.colors.foreground}
                onChange={(v) => update((d) => { d.colors.foreground = v; d.useCustomColors = true; })}
              />
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label className="text-xs">استدارة العناصر ({a.radius}px)</Label>
                <Slider
                  value={[a.radius]}
                  min={0}
                  max={40}
                  step={1}
                  onValueChange={([v]) => update((d) => { d.radius = v ?? 24; })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- FONTS -------------------- */}
        <TabsContent value="fonts" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">حجم الخط</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-xs">تكبير الخط في كامل الموقع ({a.font.scale}%)</Label>
              <Slider
                value={[a.font.scale]}
                min={80}
                max={160}
                step={5}
                onValueChange={([v]) => update((d) => { d.font.scale = v ?? 100; })}
              />
              <div className="flex flex-wrap gap-2">
                {[90, 100, 115, 130, 150].map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => update((d) => { d.font.scale = s; })}>
                    {s}%
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                يُطبَّق تلقائيًا على كل صفحات الموقع وكل العناصر.
              </p>

              <div className="grid gap-4 pt-2 sm:grid-cols-3">
                {([
                  ["scaleAr", "العربية"],
                  ["scaleFr", "الفرنسية"],
                  ["scaleEn", "الإنجليزية"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">
                      {label} ({a.font[key] ?? 100}%)
                    </Label>
                    <Slider
                      value={[a.font[key] ?? 100]}
                      min={80}
                      max={140}
                      step={5}
                      onValueChange={([v]) => update((d) => { d.font[key] = v ?? 100; })}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle className="text-base">نوع الخط لكل لغة</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FontSelect
                label="العربية (النصوص)"
                fonts={ARABIC_FONTS}
                value={a.font.ar}
                onChange={(v) => update((d) => { d.font.ar = v; })}
              />
              <FontSelect
                label="العربية (العناوين)"
                fonts={ARABIC_FONTS}
                value={a.font.headingAr}
                onChange={(v) => update((d) => { d.font.headingAr = v; })}
              />
              <FontSelect
                label="الفرنسية"
                fonts={LATIN_FONTS}
                value={a.font.fr}
                onChange={(v) => update((d) => { d.font.fr = v; })}
              />
              <FontSelect
                label="الإنجليزية"
                fonts={LATIN_FONTS}
                value={a.font.en}
                onChange={(v) => update((d) => { d.font.en = v; })}
              />
              <FontSelect
                label="العناوين اللاتينية"
                fonts={LATIN_FONTS}
                value={a.font.headingLatin}
                onChange={(v) => update((d) => { d.font.headingLatin = v; })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------- TASKBARS -------------------- */}
        <TabsContent value="taskbars" className="mt-4 space-y-4">
          <Button
            onClick={() => update((d) => { d.taskbars.push(newTaskbar(d.taskbars.length)); })}
          >
            <Plus className="ml-2 h-4 w-4" />
            إضافة شريط مهام
          </Button>

          {a.taskbars.length === 0 && (
            <p className="text-sm text-muted-foreground">
              لا يوجد شريط مهام بعد. أضف واحداً لتخصيص مكانه وشكله وأيقوناته.
            </p>
          )}

          {a.taskbars.map((bar, i) => (
            <Card key={bar.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <Input
                  value={bar.name}
                  onChange={(e) => update((d) => { d.taskbars[i]!.name = e.target.value; })}
                  className="h-9 max-w-48"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={bar.enabled}
                    onCheckedChange={(v) => update((d) => { d.taskbars[i]!.enabled = v; })}
                    aria-label="تفعيل الشريط"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف الشريط"
                    onClick={() => update((d) => { d.taskbars.splice(i, 1); })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <PickField
                    label="المكان"
                    value={bar.position}
                    options={[
                      ["bottom", "أسفل"],
                      ["top", "أعلى"],
                      ["left", "يسار"],
                      ["right", "يمين"],
                    ]}
                    onChange={(v) => update((d) => { d.taskbars[i]!.position = v as TaskbarPosition; })}
                  />
                  <PickField
                    label="النوع"
                    value={bar.style}
                    options={[
                      ["glass", "زجاجي"],
                      ["solid", "صلب"],
                      ["floating", "عائم"],
                      ["minimal", "بسيط"],
                    ]}
                    onChange={(v) => update((d) => { d.taskbars[i]!.style = v as TaskbarStyle; })}
                  />
                  <PickField
                    label="الشكل"
                    value={bar.shape}
                    options={[
                      ["pill", "دائري"],
                      ["rounded", "مستدير"],
                      ["square", "مربّع"],
                    ]}
                    onChange={(v) => update((d) => { d.taskbars[i]!.shape = v as TaskbarShape; })}
                  />
                  <PickField
                    label="شكل الأيقونات"
                    value={bar.iconStyle}
                    options={[
                      ["plain", "عادي"],
                      ["boxed", "مربّع"],
                      ["circle", "دائري"],
                    ]}
                    onChange={(v) => update((d) => { d.taskbars[i]!.iconStyle = v as IconStyle; })}
                  />
                  <ColorField
                    label="لون الشريط"
                    value={bar.color || "#ffffff"}
                    onChange={(v) => update((d) => { d.taskbars[i]!.color = v; })}
                  />
                  <ColorField
                    label="لون الأيقونات"
                    value={bar.iconColor || "#000000"}
                    onChange={(v) => update((d) => { d.taskbars[i]!.iconColor = v; })}
                  />
                  <div className="space-y-2">
                    <Label className="text-xs">الحجم ({bar.size}px)</Label>
                    <Slider
                      value={[bar.size]}
                      min={32}
                      max={80}
                      step={2}
                      onValueChange={([v]) => update((d) => { d.taskbars[i]!.size = v ?? 48; })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch
                      checked={bar.showLabels}
                      onCheckedChange={(v) => update((d) => { d.taskbars[i]!.showLabels = v; })}
                      aria-label="إظهار التسميات"
                    />
                    <Label className="text-xs">إظهار التسميات</Label>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <Label className="text-xs">العناصر</Label>
                  {bar.items.map((item, j) => {
                    const Icon = iconFor(item.icon);
                    return (
                      <div key={item.id} className="flex flex-wrap items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        <Input
                          value={item.label}
                          onChange={(e) => update((d) => { d.taskbars[i]!.items[j]!.label = e.target.value; })}
                          className="h-9 w-32"
                          placeholder="التسمية"
                        />
                        <Input
                          value={item.url}
                          onChange={(e) => update((d) => { d.taskbars[i]!.items[j]!.url = e.target.value; })}
                          className="h-9 w-56"
                          placeholder="/dashboard/..."
                        />
                        <Select
                          value={item.icon}
                          onValueChange={(v) => update((d) => { d.taskbars[i]!.items[j]!.icon = v; })}
                        >
                          <SelectTrigger className="h-9 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(ICON_REGISTRY).map((k) => (
                              <SelectItem key={k} value={k}>
                                {k}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف العنصر"
                          onClick={() => update((d) => { d.taskbars[i]!.items.splice(j, 1); })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <Input
                      value={newItem[bar.id]?.label ?? ""}
                      onChange={(e) =>
                        setNewItem((s) => ({
                          ...s,
                          [bar.id]: { icon: s[bar.id]?.icon ?? "star", url: s[bar.id]?.url ?? "", label: e.target.value },
                        }))
                      }
                      className="h-9 w-32"
                      placeholder="تسمية جديدة"
                    />
                    <Input
                      value={newItem[bar.id]?.url ?? ""}
                      onChange={(e) =>
                        setNewItem((s) => ({
                          ...s,
                          [bar.id]: { icon: s[bar.id]?.icon ?? "star", label: s[bar.id]?.label ?? "", url: e.target.value },
                        }))
                      }
                      className="h-9 w-56"
                      placeholder="/dashboard/..."
                    />
                    <Select
                      value={newItem[bar.id]?.icon ?? "star"}
                      onValueChange={(v) =>
                        setNewItem((s) => ({
                          ...s,
                          [bar.id]: { label: s[bar.id]?.label ?? "", url: s[bar.id]?.url ?? "", icon: v },
                        }))
                      }
                    >
                      <SelectTrigger className="h-9 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(ICON_REGISTRY).map((k) => (
                          <SelectItem key={k} value={k}>
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const draft = newItem[bar.id];
                        if (!draft?.label || !draft.url) {
                          toast.error("أدخل التسمية والرابط");
                          return;
                        }
                        update((d) => {
                          d.taskbars[i]!.items.push({
                            id: Math.random().toString(36).slice(2, 9),
                            label: draft.label,
                            url: draft.url,
                            icon: draft.icon || "star",
                          });
                        });
                        setNewItem((s) => ({ ...s, [bar.id]: { label: "", url: "", icon: "star" } }));
                      }}
                    >
                      <Plus className="ml-1 h-4 w-4" />
                      إضافة عنصر
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* -------------------- ICONS & BUTTONS -------------------- */}
        <TabsContent value="ui" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الأيقونات</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">سماكة الخط ({a.icons.strokeWidth})</Label>
                <Slider
                  value={[a.icons.strokeWidth * 10]}
                  min={5}
                  max={30}
                  step={1}
                  onValueChange={([v]) => update((d) => { d.icons.strokeWidth = (v ?? 20) / 10; })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">حجم الأيقونات ({a.icons.size}%)</Label>
                <Slider
                  value={[a.icons.size]}
                  min={70}
                  max={160}
                  step={5}
                  onValueChange={([v]) => update((d) => { d.icons.size = v ?? 100; })}
                />
              </div>
              <ColorField
                label="لون الأيقونات (اتركه فارغاً للافتراضي)"
                value={a.icons.color || "#000000"}
                onChange={(v) => update((d) => { d.icons.color = v; })}
              />
              <Button variant="outline" className="self-end" onClick={() => update((d) => { d.icons.color = ""; })}>
                إلغاء لون الأيقونات
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">الأزرار</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <PickField
                label="النمط"
                value={a.buttons.style}
                options={[
                  ["solid", "ممتلئ"],
                  ["outline", "محدّد"],
                  ["soft", "ناعم"],
                  ["ghost", "شفاف"],
                ]}
                onChange={(v) => update((d) => { d.buttons.style = v as ButtonStyle; })}
              />
              <div className="space-y-2">
                <Label className="text-xs">استدارة الأزرار ({a.buttons.radius}px)</Label>
                <Slider
                  value={[a.buttons.radius]}
                  min={0}
                  max={40}
                  step={1}
                  onValueChange={([v]) => update((d) => { d.buttons.radius = v ?? 28; })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">حجم نص الأزرار ({a.buttons.scale}%)</Label>
                <Slider
                  value={[a.buttons.scale]}
                  min={80}
                  max={140}
                  step={5}
                  onValueChange={([v]) => update((d) => { d.buttons.scale = v ?? 100; })}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={a.buttons.shadow}
                  onCheckedChange={(v) => update((d) => { d.buttons.shadow = v; })}
                  aria-label="ظل الأزرار"
                />
                <Label className="text-xs">إضافة ظل للأزرار</Label>
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button>زر تجريبي</Button>
                <Button variant="secondary">ثانوي</Button>
                <Button variant="outline">
                  <Save className="ml-2 h-4 w-4" />
                  مع أيقونة
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FontSelect({
  label,
  fonts,
  value,
  onChange,
}: {
  label: string;
  fonts: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fonts.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: `"${f}"` }}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PickField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
