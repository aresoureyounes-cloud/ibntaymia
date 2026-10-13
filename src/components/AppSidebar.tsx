import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  ClipboardList,
  Bell,
  Library,
  Award,
  GraduationCap,
  ScanLine,
  CreditCard,
  CalendarCheck,
  LogOut,
  Megaphone,
  BookOpen,
  Bus,
  FilePenLine,
  BarChart3,
  UserCog,
  GraduationCap as BrandIcon,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/use-auth";
import { NAV_ITEMS } from "@/lib/nav-config";
import { Button } from "./ui/button";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { Badge } from "./ui/badge";

const ICONS: Record<string, typeof LayoutDashboard> = {
  "/dashboard/offline": WifiOff,
  "/dashboard/inbox": Bell,
  "/dashboard/my-attendance": CalendarCheck,
  "/dashboard/today": CalendarCheck,
  "/dashboard/weekly": BarChart3,
  "/dashboard": LayoutDashboard,
  "/dashboard/students": Users,
  "/dashboard/attendance": CalendarCheck,
  "/dashboard/cards": CreditCard,
  "/dashboard/notifications": Bell,
  "/dashboard/decisions": Megaphone,
  "/dashboard/behavior": Award,
  "/dashboard/library": BookOpen,
  "/dashboard/trips": Bus,
  "/dashboard/exams": FilePenLine,
  "/dashboard/guidance": BarChart3,
  "/dashboard/admin": ShieldCheck,
  "/dashboard/director": GraduationCap,
  "/dashboard/supervisor": ClipboardList,
  "/dashboard/teacher": Users,
  "/dashboard/parent": Bell,
  "/dashboard/student": Library,
  "/dashboard/gate": ScanLine,
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t, i18n } = useTranslation();
  const { roles, signOut, user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const visibleItems = NAV_ITEMS.filter(
    (it) => !it.roles || roles.includes("developer") || it.roles.some((r) => roles.includes(r)),
  );

  useRealtimeTable("notifications", ["sidebar-unread", user?.id]);
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

  return (
    <Sidebar side={i18n.dir() === "rtl" ? "right" : "left"} collapsible="icon" className="border-border bg-sidebar/80 backdrop-blur-md">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <Link to="/" className="flex items-center gap-2 text-sidebar-primary">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BrandIcon className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="font-display text-lg font-bold tracking-tight">
              {t("brand.name")}
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.dashboard")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu data-tour="sidebar">
              {visibleItems.map((item) => {
                const active = path === item.url;
                const Icon = ICONS[item.url] ?? LayoutDashboard;
                const showBadge =
                  item.url === "/dashboard/inbox" && unread > 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link
                        to={item.url}
                        data-tour={`nav-${item.url}`}
                        className="flex items-center gap-2 rounded-xl"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{t(item.labelKey)}</span>}
                        {showBadge && (
                          <Badge
                            variant="destructive"
                            className="ms-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]"
                          >
                            {unread > 99 ? "99+" : unread}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={path === "/dashboard/profile"}>
                  <Link to="/dashboard/profile" className="flex items-center gap-2 rounded-xl">
                    <UserCog className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>الملف الشخصي</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <Link
            to="/dashboard/profile"
            className="mb-2 flex items-center gap-2 truncate text-xs text-muted-foreground hover:text-foreground"
          >
            <ProfileAvatar />
            <span className="truncate">{user.email}</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 rounded-xl"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

function ProfileAvatar() {
  const { user } = useAuth();
  const { data: url } = useQuery({
    queryKey: ["sidebar-avatar", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      const { resolveAvatarUrl } = await import("@/lib/avatar");
      return resolveAvatarUrl(data?.avatar_url ?? null);
    },
  });
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs text-muted-foreground">{user?.email?.[0]?.toUpperCase() ?? "?"}</span>
      )}
    </span>
  );
}
