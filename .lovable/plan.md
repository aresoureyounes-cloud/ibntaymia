# خطة العمل: المرحلة 2 ثم المرحلة 3

## المرحلة 2 — تعميم الستايل اليدوي على كامل الموقع

الهدف: جعل كل صفحات الموقع (وليس الواجهة الرئيسية فقط) تتبع نفس الطابع المرسوم يدوياً، الترابي، الدافئ.

### 2.1 توحيد المكونات الأساسية (shadcn)

تطبيق نوع الخط على اللغة العربية ايضا

- `Button`: حواف غير منتظمة + variant جديد `sketch` بحدود مرسومة يدوياً (SVG border-image)
- `Card`: ظل ناعم + خلفية ورقية (paper grain) + زوايا غير مثالية
- `Input`, `Textarea`, `Select`: حدود يدوية الطابع، تركيز بلون terracotta ناعم
- `Dialog`, `Sheet`, `Popover`: زوايا منحنية يدوية + grain خفيف
- `Table`: صفوف بفواصل مرسومة كأنها بقلم رصاص
- `Badge`, `Tabs`: نفس الطابع
- `Skeleton`: بنبضة دافئة (beige → cream)

### 2.2 الصفحات المستهدفة (تطبيق الـ design tokens فقط — لا تغيير منطق)

- `dashboard.index.tsx` + `OverviewDashboard.tsx`
- `dashboard.students.tsx`, `dashboard.attendance.tsx`, `dashboard.behavior.tsx`
- `dashboard.exams.tsx`, `dashboard.cards.tsx`, `dashboard.notifications.tsx`
- `dashboard.parent.tsx`, `dashboard.student.tsx`, `dashboard.teacher.tsx`
- `dashboard.gate.tsx`, `dashboard.gate-log.tsx`, `dashboard.trips.tsx`
- `dashboard.library.tsx`, `dashboard.decisions.tsx`, `dashboard.guidance.tsx`
- `dashboard.admin.tsx`, `dashboard.director.tsx`, `dashboard.supervisor.tsx`
- `login.tsx`, `about.tsx`, `index.tsx`
- `AppSidebar.tsx`: حواف مرسومة + أيقونة نجمة يدوية للشعار

### 2.3 لمسات بصرية مشتركة

- شعار/أيقونة نجمة متعددة الرؤوس مرسومة يدوياً (SVG inline) تُستخدم في:
  - الـ Sidebar header
  - شاشات الترحيب
  - Empty states
- Empty states موحدة بـ component `<HandDrawnEmpty />` (أيقونة + نص بخط handwritten)
- Loading skeletons بنفس النمط الدافئ
- Page headers: عنوان بخط `Caveat`/handwritten + شرطة مرسومة يدوياً تحته

### تفاصيل تقنية للمرحلة 2

- إضافة `variant="sketch"` في `buttonVariants` بـ `cva`
- إنشاء `src/components/ui/sketch-border.tsx` (SVG wrapper) لإعادة الاستخدام
- إنشاء `src/components/HandDrawnEmpty.tsx` و `src/components/PageHeader.tsx`
- توسيع `src/styles.css` بـ:
  - `@utility paper-grain` (موجود)
  - `@utility sketch-border` (جديد — border-image مع SVG dataURI)
  - `@utility handwritten` (font-family Caveat للعناوين)
- تحميل خط `Caveat` من Google Fonts عبر `<link>` في `__root.tsx`

---

## المرحلة 3 — الميزات الناقصة

### 3.1 استعادة كلمة المرور

- زر "نسيت كلمة المرور؟" في `login.tsx`
- صفحة `/forgot-password` — نموذج إدخال بريد + استدعاء `supabase.auth.resetPasswordForEmail` مع `redirectTo: /reset-password`
- صفحة `/reset-password` (عامة) — تكشف `type=recovery` وتستدعي `updateUser({ password })`
- إعداد قوالب البريد عبر `email_domain--scaffold_auth_email_templates`

### 3.2 تحرير الملف الشخصي

- صفحة `/dashboard/profile` — تعديل `full_name` + `preferred_language` + `avatar_url`
- إنشاء storage bucket `avatars` (public read, RLS write لصاحبه)
- رفع الصورة عبر `supabase.storage.from('avatars').upload(...)`
- زر دخول من قائمة المستخدم في الـ Sidebar

### 3.3 تصدير البيانات (Excel + PDF)

- زر "تصدير" في:
  - `dashboard.attendance.tsx` (سجلات الحضور)
  - `dashboard.exams.tsx` (العلامات)
  - `dashboard.students.tsx` (قائمة الطلاب)
  - `dashboard.gate-log.tsx` (سجل البوابة)
- Excel: `xlsx` library (بحجم خفيف عبر lazy import)
- PDF: استخدام `jspdf` + `jspdf-autotable` (lazy import) مع دعم RTL للعربية

### 3.4 طباعة بطاقات RFID

- في `dashboard.cards.tsx`: زر "طباعة" بجانب كل بطاقة + زر "طباعة الكل"
- تصميم بطاقة بحجم CR80 (85.6mm × 54mm) — Component `<PrintableCard />`
- يحتوي: شعار المدرسة، اسم الطالب، صورته، الصف، QR code (للـ RFID UID)، نجمة يدوية
- استخدام `@media print` + CSS page size + `window.print()`
- صفحة A4 تحتوي 8 بطاقات (للطباعة الجماعية)

### تفاصيل تقنية للمرحلة 3

- مكتبات جديدة (lazy-loaded):
  - `xlsx` للـ Excel
  - `jspdf` + `jspdf-autotable` للـ PDF
  - `qrcode.react` (موجودة) للـ QR على البطاقة
- Migration واحد:
  - storage bucket `avatars` + policies
- Server functions جديدة:
  - `src/lib/profile.functions.ts` — `updateProfile`, `uploadAvatar` (يستخدم `requireSupabaseAuth`)
- لا حاجة لتعديل أي RLS موجود

---

## ترتيب التنفيذ

1. تعميم tokens + utilities في `styles.css` + تحميل خط Caveat
2. إنشاء variants و components مشتركة (`sketch-border`, `PageHeader`, `HandDrawnEmpty`)
3. تطبيق على Sidebar + Login + Index + About
4. تطبيق على صفحات Dashboard (دفعتين متوازيتين)
5. استعادة كلمة المرور (+ قوالب البريد)
6. الملف الشخصي + bucket
7. التصدير (Excel + PDF) — كل صفحة على حدة
8. طباعة بطاقات RFID

## ما هو خارج النطاق (لمراحل لاحقة)

- الأداء (code splitting, PWA)
- الرسوم البيانية الحقيقية
- SEO و sitemap
- الاختبارات
- صفحات قانونية (خصوصية، شروط)

هل أبدأ التنفيذ بهذا الترتيب؟