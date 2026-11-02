import { useInstitution } from "@/lib/use-institution";

export function InstitutionLetterhead() {
  const { data, isPending, error } = useInstitution();
  return (
    <div className="space-y-1 text-center text-sm leading-7">
      <p>الجمهورية الجزائرية الديمقراطية الشعبية</p>
      <p>وزارة التربية الوطنية</p>
      {data?.logo_data_url && <img src={data.logo_data_url} alt="شعار المؤسسة" className="mx-auto h-16 w-16 object-contain" />}
      <p className="font-semibold">{data?.name || (isPending ? "جارٍ التحميل…" : "اسم المؤسسة غير مضبوط")}</p>
      {error && <p className="text-destructive">تعذر قراءة بيانات المؤسسة</p>}
      {data?.address && <p>{data.address}</p>}
      {(data?.phone || data?.email) && <p dir="ltr">{[data.phone, data.email].filter(Boolean).join(" · ")}</p>}
      {data?.academic_year && <p>السنة الدراسية: {data.academic_year}</p>}
    </div>
  );
}