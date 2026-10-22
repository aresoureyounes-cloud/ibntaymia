import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard, quickActionsAdmin } from "@/components/OverviewDashboard";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({
    meta: [
      { title: "إدارة الحسابات — إداروم" },
      { name: "description", content: "إداروم: إدارة الحسابات في الثانوية الجزائرية." },
      { property: "og:title", content: "إدارة الحسابات — إداروم" },
      { property: "og:description", content: "إداروم: إدارة الحسابات في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OverviewDashboard roleKey="admin" quickActions={quickActionsAdmin} />,
});
