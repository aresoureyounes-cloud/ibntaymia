import { createFileRoute } from "@tanstack/react-router";
import { OverviewDashboard, quickActionsDirector } from "@/components/OverviewDashboard";

export const Route = createFileRoute("/dashboard/director")({
  component: () => <OverviewDashboard roleKey="director" quickActions={quickActionsDirector} />,
});
