import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PublicHeader } from "@/components/PublicHeader";
import { Cloud, HandMetal, Fingerprint, Send, Lock } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { property: "og:title", content: "حول منصة إداروم — IDAROOM" },
      {
        property: "og:description",
        content: "حول منصة إداروم — IDAROOM: صفحة في منصة إداروم للثانوية الجزائرية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "حول منصة إداروم — IDAROOM" },
      {
        name: "description",
        content:
          "المبادئ التصميمية لمنصة إداروم: هجينة Online/Offline، تحكم يدوي مطلق، هوية رقمية موحدة، وإشعارات متعددة القنوات.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useTranslation();
  const principles = [
    { icon: Cloud, k: "p1" },
    { icon: HandMetal, k: "p2" },
    { icon: Fingerprint, k: "p3" },
    { icon: Send, k: "p4" },
    { icon: Lock, k: "p5" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main>
        <article className="container mx-auto max-w-4xl px-4 py-16">
          <h1 className="text-4xl font-bold md:text-5xl">{t("about.title")}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t("about.intro")}</p>

          <h2 className="mt-12 text-2xl font-bold">{t("about.principles_title")}</h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {principles.map(({ icon: Icon, k }) => (
              <div key={k} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent/20 text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1 font-semibold">{t(`about.${k}_title`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`about.${k}_desc`)}</p>
              </div>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}
