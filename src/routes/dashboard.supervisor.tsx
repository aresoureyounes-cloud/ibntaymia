import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard, quickActionsSupervisor } from "@/components/OverviewDashboard";

export const Route = createFileRoute("/dashboard/supervisor")({
  head: () => ({
    meta: [
      { title: "لوحة الناظر — إداروم" },
      { name: "description", content: "إداروم: لوحة الناظر في الثانوية الجزائرية." },
      { property: "og:title", content: "لوحة الناظر — إداروم" },
      { property: "og:description", content: "إداروم: لوحة الناظر في الثانوية الجزائرية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <OverviewDashboard roleKey="supervisor" quickActions={quickActionsSupervisor} />,
});
