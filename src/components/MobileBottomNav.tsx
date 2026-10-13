import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Inbox, CalendarDays, Home, Users, BarChart3, CalendarRange, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { defaultLandingFor } from "@/lib/nav-config";

type Item = { to: string; label: string; icon: LucideIcon };

/** Fixed bottom bar on phones with the 4 most used pages for the user's role. */
export function MobileBottomNav() {
  const { roles, hasRole, user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const home = defaultLandingFor(roles);
  const isMgmt = hasRole("admin") || hasRole("director") || hasRole("supervisor");

  const { data: unread = 0 } = useQuery({
    queryKey: ["sidebar-unread", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .eq("recipient_id", user!.id);
      return count ?? 0;
    },
  });

  let items: Item[];
  if (isMgmt)
    items = [
      { to: home, label: "الرئيسية", icon: Home },
      { to: "/dashboard/absence-report", label: "الغياب", icon: BarChart3 },
      { to: "/dashboard/weekly", label: "الأسبوع", icon: CalendarRange },
      { to: "/dashboard/inbox", label: "رسائلي", icon: Inbox },
    ];
  else if (hasRole("teacher"))
    items = [
      { to: "/dashboard/today", label: "اليوم", icon: CalendarCheck },
      { to: "/dashboard/attendance", label: "الحضور", icon: Users },
      { to: "/dashboard/calendar", label: "التقويم", icon: CalendarDays },
      { to: "/dashboard/inbox", label: "رسائلي", icon: Inbox },
    ];
  else
    items = [
      { to: home, label: "الرئيسية", icon: Home },
      { to: "/dashboard/my-attendance", label: "الحضور", icon: Users },
      { to: "/dashboard/calendar", label: "التقويم", icon: CalendarDays },
      { to: "/dashboard/inbox", label: "رسائلي", icon: Inbox },
    ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="flex">
        {items.map(({ to, label, icon: Icon }) => {
          const active = path === to;
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" />
                {label}
                {to === "/dashboard/inbox" && unread > 0 && (
                  <span className="absolute top-1.5 ms-6 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
