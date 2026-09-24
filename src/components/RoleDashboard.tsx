import { useTranslation } from "react-i18next";
import { ComingSoonCard } from "@/components/ComingSoonCard";
import type { LucideIcon } from "lucide-react";

export function RoleDashboard({
  roleKey,
  features,
}: {
  roleKey: string;
  features: { icon: LucideIcon; titleKey: string; descKey: string; phase: number }[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{t("dashboard.your_role")}</p>
        <h1 className="text-2xl font-bold md:text-3xl">{t(`roles.${roleKey}`)}</h1>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <ComingSoonCard
            key={i}
            icon={f.icon}
            title={t(f.titleKey)}
            description={t(f.descKey)}
            phase={f.phase}
          />
        ))}
      </div>
    </div>
  );
}
