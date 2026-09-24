import { createFileRoute } from "@tanstack/react-router";
import { PublicHeader } from "@/components/PublicHeader";
import { Shield, Lock, Database, UserCheck, Eye, Mail } from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "الثقة والأمان — IDAROOM" },
      {
        name: "description",
        content:
          "كيف تحمي منصة إداروم بيانات الطلاب والأولياء والطاقم: التحكم بالوصول، التشفير، النسخ الاحتياطي، وسياسات الخصوصية.",
      },
      { property: "og:title", content: "الثقة والأمان — IDAROOM" },
      {
        property: "og:description",
        content: "نظرة شاملة على ممارسات الأمن والخصوصية في منصة إداروم المدرسية.",
      },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  const sections = [
    {
      icon: UserCheck,
      title: "التحكم في الوصول",
      body: "نعتمد على نظام أدوار صارم (مدير، مدير مدرسة، مشرف، أستاذ، حارس، وَلِيّ، طالب). كل صف من البيانات محمي بسياسات RLS على مستوى قاعدة البيانات: الأستاذ لا يرى إلا طلاب الأقسام المُسندة إليه، والوَلِيّ لا يرى إلا أبناءه، والطالب لا يرى إلا بياناته الخاصة.",
    },
    {
      icon: Lock,
      title: "التشفير وحماية الجلسات",
      body: "جميع الاتصالات بين متصفّحك والمنصة مشفّرة عبر HTTPS/TLS. كلمات المرور تُخزَّن مُجزَّأة (hashed) بواسطة مزود المصادقة، ولا يطّلع عليها أحد، ولا حتى مديرو النظام. الجلسات قصيرة العمر وتتجدد تلقائيًا.",
    },
    {
      icon: Database,
      title: "تخزين البيانات",
      body: "تُخزَّن البيانات في قاعدة بيانات Postgres مُدارة، مع نسخ احتياطي يومي. ملفات الصور (الصور الرمزية) تُحفظ في حاويات تخزين خاصة (Private buckets) لا يقرؤها إلا مالك الملف أو طاقم الإدارة المُخوَّل.",
    },
    {
      icon: Eye,
      title: "الحدّ الأدنى من البيانات",
      body: "لا نطلب من المستخدم سوى ما يلزم لتشغيل المدرسة: الاسم، رقم القسم، بيانات الحضور والملاحظات السلوكية الضرورية. لا نبيع البيانات لأي طرف ثالث ولا نستعملها لأغراض إعلانية.",
    },
    {
      icon: Shield,
      title: "السلامة والمراجعة",
      body: "نُجري مراجعة دورية لسياسات RLS والصلاحيات بواسطة فاحص أمني آلي. كل عملية مسح بطاقة، تعديل حضور، أو قرار إداري قابل للتتبع عبر سجلّات مع طوابع زمنية ومُعرّف المستخدم.",
    },
    {
      icon: Mail,
      title: "الإبلاغ عن ثغرة",
      body: "إن اكتشفت ثغرة أمنية أو سلوكًا مشبوهًا، تواصل مع إدارة المؤسسة المُشغّلة للحساب، أو أبلغ مالك المنصة مباشرة. نلتزم بمراجعة كل بلاغ خلال 72 ساعة.",
    },
  ];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PublicHeader />
      <main>
        <article className="container mx-auto max-w-4xl px-4 py-16">
          <div className="mb-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-accent/10 px-3 py-1 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              صفحة قابلة للتعديل من قِبل المؤسسة المُشغِّلة
            </div>
            <h1 className="text-4xl font-bold md:text-5xl">الثقة والأمان</h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              هذه الصفحة تشرح كيف تحمي منصة إداروم بيانات الطلاب والأولياء والطاقم. القرارات
              والممارسات المُوصوفة هنا تخصّ المؤسسة المُشغّلة للحساب، وتعتمد على قدرات منصّة Lovable
              Cloud الأساسية. ليست هذه الصفحة شهادة اعتماد رسمية، بل بيان شفافية.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent/20 text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mb-2 text-lg font-semibold">{title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>

          <section className="mt-12 rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold">المسؤوليات المشتركة</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                • <strong className="text-foreground">منصة إداروم / Lovable Cloud:</strong> توفير
                التشفير، النسخ الاحتياطي، عزل المستأجرين، وسياسات RLS الافتراضية.
              </li>
              <li>
                • <strong className="text-foreground">المؤسسة المُشغّلة:</strong> منح الأدوار
                المناسبة، مراجعة قوائم الطاقم، حذف الحسابات غير النشطة.
              </li>
              <li>
                • <strong className="text-foreground">المستخدم النهائي:</strong> الحفاظ على سرية
                كلمة المرور، تسجيل الخروج عند مغادرة الجهاز المُشترك.
              </li>
            </ul>
          </section>

          <p className="mt-8 text-xs text-muted-foreground">آخر تحديث: 2026/06/22</p>
        </article>
      </main>
    </div>
  );
}
