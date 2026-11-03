import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Save, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/use-auth";
import { useInstitution } from "@/lib/use-institution";
import { canManageInstitution, emptyInstitution, institutionSchema, type InstitutionInput } from "@/lib/institution";
import { saveInstitution } from "@/lib/institution.functions";

export function InstitutionSettings() {
  const { roles } = useAuth();
  const canEdit = canManageInstitution(roles);
  const { data, isPending, error, refetch } = useInstitution();
  const [draft, setDraft] = useState<InstitutionInput>(emptyInstitution);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const save = useServerFn(saveInstitution);

  useEffect(() => {
    if (data && !dirty) {
      setDraft({ name: data.name, address: data.address, phone: data.phone, email: data.email,
        academic_year: data.academic_year, logo_data_url: data.logo_data_url, published_origin: data.published_origin });
    }
  }, [data, dirty]);

  const change = (key: keyof InstitutionInput, value: string) => {
    setDirty(true);
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 200000) {
      toast.error("اختر صورة PNG أو JPEG أو WebP بحجم لا يتجاوز 200 كيلوبايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") change("logo_data_url", reader.result);
    };
    reader.onerror = () => toast.error("تعذر قراءة الصورة");
    reader.readAsDataURL(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = institutionSchema.safeParse(draft);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "راجع البيانات");
    setSaving(true);
    try {
      const saved = await save({ data: parsed.data });
      qc.setQueriesData({ queryKey: ["institution-settings"] }, saved);
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["institution-settings"] });
      toast.success("حُفظت بيانات المؤسسة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally { setSaving(false); }
  }

  return (
    <section className="space-y-5 border-b border-border pb-7" aria-labelledby="institution-heading">
      <div className="flex flex-wrap items-center gap-3">
        <Building2 className="h-5 w-5 text-primary" />
        <h2 id="institution-heading" className="text-lg font-semibold">بيانات المؤسسة</h2>
        <Badge variant={data?.name ? "secondary" : "outline"}>{data?.name ? "مضبوطة" : "غير مكتملة"}</Badge>
      </div>
      {isPending ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : error ? (
        <div className="flex items-center gap-3"><p className="text-sm text-destructive">تعذر قراءة بيانات المؤسسة</p><Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button></div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={!canEdit || saving} className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                {draft.logo_data_url ? <img src={draft.logo_data_url} alt="شعار المؤسسة" className="h-16 w-16 object-contain" /> : <Building2 className="h-7 w-7 text-muted-foreground" />}
              </div>
              {canEdit && <div className="flex flex-wrap gap-2">
                <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="صورة شعار المؤسسة" onChange={event => { void pickLogo(event.target.files?.[0]); event.target.value = ""; }} />
                <Button type="button" variant="outline" onClick={() => upload.current?.click()}><ImagePlus className="h-4 w-4" />اختيار الشعار</Button>
                {draft.logo_data_url && <Button type="button" variant="ghost" size="icon" aria-label="إزالة الشعار" title="إزالة الشعار" onClick={() => change("logo_data_url", "")}><X className="h-4 w-4" /></Button>}
              </div>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2"><span>اسم المؤسسة</span><Input required maxLength={160} value={draft.name} onChange={event => change("name", event.target.value)} /></label>
              <label className="space-y-1 text-sm sm:col-span-2"><span>العنوان</span><Input maxLength={300} value={draft.address} onChange={event => change("address", event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span>رقم الهاتف</span><Input dir="ltr" type="tel" maxLength={40} value={draft.phone} onChange={event => change("phone", event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span>البريد الإلكتروني</span><Input dir="ltr" type="email" maxLength={160} value={draft.email} onChange={event => change("email", event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span>السنة الدراسية</span><Input maxLength={40} value={draft.academic_year} onChange={event => change("academic_year", event.target.value)} /></label>
              <label className="space-y-1 text-sm"><span>عنوان الموقع المنشور</span><Input dir="ltr" type="url" maxLength={250} value={draft.published_origin} onChange={event => change("published_origin", event.target.value.replace(/\/$/, ""))} /></label>
            </div>
          </fieldset>
          {canEdit && <Button type="submit" disabled={saving || !dirty}><Save className="h-4 w-4" />{saving ? "جارٍ الحفظ…" : "حفظ بيانات المؤسسة"}</Button>}
        </form>
      )}
    </section>
  );
}