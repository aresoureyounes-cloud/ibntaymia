import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { PublicHeader } from "@/components/PublicHeader";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: i18n.t("legal.privacy.meta_title") },
      { name: "description", content: i18n.t("legal.privacy.meta_description") },
      { property: "og:title", content: i18n.t("legal.privacy.meta_title") },
      { property: "og:description", content: i18n.t("legal.privacy.og_description") },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  const sections = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: t(`legal.privacy.s${n}_title`),
    body: t(`legal.privacy.s${n}_body`),
  }));

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="container mx-auto max-w-4xl px-4 py-16">
        <div className="mb-10 flex items-start gap-3">
          <span className="mt-1 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-4xl">{t("legal.privacy.title")}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t("legal.privacy.intro")}</p>
          </div>
        </div>

        <div className="space-y-5">
          {sections.map((s) => (
            <section key={s.title} className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-2 font-display text-xl">{s.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 text-xs text-muted-foreground">{t("legal.updated")}: 2026/07/06</p>
      </main>
    </div>
  );
}
