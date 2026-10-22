import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard, quickActionsDirector } from "@/components/OverviewDashboard";

export const Route = createFileRoute("/dashboard/director")({
  head: () => ({
    meta: [
      { title: "لوحة المدير — إداروم" },
      { name: "description", content: "إداروم: لوحة المدير في الثانوية الجزائرية." },
      { property: "og:title", content: "لوحة المدير — إداروم" },
      { property: "og:description", content: "إداروم: لوحة المدير في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OverviewDashboard roleKey="director" quickActions={quickActionsDirector} />,
});
