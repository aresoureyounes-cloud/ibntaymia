import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/use-auth";
import { canAccess, defaultLandingFor } from "@/lib/nav-config";
import { WelcomeTour, useWelcomeTour } from "@/components/WelcomeTour";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, loading, roles } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tour = useWelcomeTour();
  const { t } = useTranslation();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate]);

  // Role-based route guard: if a user lands on a page they can't access,
  // bounce them to their default landing page for their primary role.
  useEffect(() => {
    if (loading || !user) return;
    if (!canAccess(path, roles)) {
      navigate({ to: defaultLandingFor(roles), replace: true });
    }
  }, [path, roles, loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen w-full">
        <div className="hidden w-64 border-l border-border bg-sidebar p-4 md:block">
          <div className="mb-6 h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="h-14 border-b border-border bg-background" />
          <div className="space-y-4 p-6">
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md">
            <SidebarTrigger />
            <div className="flex items-center gap-1" data-tour="header-tools">
              <Button
                variant="ghost"
                size="icon"
                data-tour="tour-help"
                aria-label={t("tour.restart")}
                title={t("tour.restart")}
                onClick={tour.start}
                className="rounded-full"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden p-4 sm:p-5 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <WelcomeTour open={tour.open} onClose={tour.close} />
    </SidebarProvider>
  );
}
