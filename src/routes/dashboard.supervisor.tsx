import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard, quickActionsSupervisor } from "@/components/OverviewDashboard";

export const Route = createFileRoute("/dashboard/supervisor")({
  component: () => <OverviewDashboard roleKey="supervisor" quickActions={quickActionsSupervisor} />,
});
