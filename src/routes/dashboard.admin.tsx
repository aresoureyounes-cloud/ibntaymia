import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard, quickActionsAdmin } from "@/components/OverviewDashboard";

export const Route = createFileRoute("/dashboard/admin")({
  component: () => <OverviewDashboard roleKey="admin" quickActions={quickActionsAdmin} />,
});
