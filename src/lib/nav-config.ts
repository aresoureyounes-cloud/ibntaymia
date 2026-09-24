import type { AppRole } from "@/lib/use-auth";

export type NavItem = {
  url: string;
  labelKey: string;
  roles?: AppRole[]; // undefined = visible to anyone authenticated
};

export const NAV_ITEMS: NavItem[] = [
  { url: "/dashboard", labelKey: "nav.dashboard" },
  {
    url: "/dashboard/students",
    labelKey: "nav.students",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  {
    url: "/dashboard/attendance",
    labelKey: "nav.attendance",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  {
    url: "/dashboard/absence-report",
    labelKey: "nav.absence_report",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  {
    url: "/dashboard/cards",
    labelKey: "nav.cards",
    roles: ["admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/notifications",
    labelKey: "nav.notifications",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  {
    url: "/dashboard/decisions",
    labelKey: "nav.decisions",
    roles: ["admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/behavior",
    labelKey: "nav.behavior",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  {
    url: "/dashboard/library",
    labelKey: "nav.library",
    roles: ["admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/trips",
    labelKey: "nav.trips",
    roles: ["admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/exams",
    labelKey: "nav.exams",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  {
    url: "/dashboard/guidance",
    labelKey: "nav.guidance",
    roles: ["admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/reports",
    labelKey: "nav.reports",
    roles: ["admin", "director", "supervisor", "teacher"],
  },
  { url: "/dashboard/import", labelKey: "nav.import", roles: ["admin"] },
  { url: "/dashboard/users", labelKey: "nav.users", roles: ["admin", "developer"] },
  {
    url: "/dashboard/schedule",
    labelKey: "nav.schedule",
    roles: ["admin", "director", "supervisor", "teacher"],
  },

  { url: "/dashboard/admin", labelKey: "roles.admin", roles: ["admin"] },
  {
    url: "/dashboard/director",
    labelKey: "roles.director",
    roles: ["director", "admin"],
  },
  {
    url: "/dashboard/supervisor",
    labelKey: "roles.supervisor",
    roles: ["supervisor", "admin"],
  },
  {
    url: "/dashboard/teacher",
    labelKey: "roles.teacher",
    roles: ["teacher", "admin"],
  },
  {
    url: "/dashboard/parent",
    labelKey: "roles.parent",
    roles: ["parent", "admin"],
  },
  {
    url: "/dashboard/student",
    labelKey: "roles.student",
    roles: ["student", "admin"],
  },
  {
    url: "/dashboard/gate",
    labelKey: "roles.gate_monitor",
    roles: ["gate_monitor", "admin"],
  },
  {
    url: "/dashboard/gate-log",
    labelKey: "nav.gate_log",
    roles: ["gate_monitor", "admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/me",
    labelKey: "nav.my_profile",
  },
  {
    url: "/dashboard/appearance",
    labelKey: "nav.appearance",
  },


  {
    url: "/dashboard/profile",
    labelKey: "nav.profile",
    roles: ["admin"],
  },
  {
    url: "/dashboard/cards/print",
    labelKey: "nav.print_cards",
    roles: ["admin", "director", "supervisor"],
  },
  {
    url: "/dashboard/console",
    labelKey: "nav.console",
    roles: ["developer"],
  },
  {
    url: "/dashboard/diagnostics",
    labelKey: "nav.diagnostics",
    roles: ["developer"],
  },
  {
    url: "/dashboard/settings",
    labelKey: "nav.settings",
  },
];

/** Returns true if the user can access the given path based on their roles. */
export function canAccess(path: string, userRoles: AppRole[]): boolean {
  // Developer (technical maintainer) has unrestricted access to every page.
  if (userRoles.includes("developer")) return true;
  // Always allow dashboard root
  if (path === "/dashboard" || path === "/dashboard/") return true;
  const item = NAV_ITEMS.find((i) => i.url === path);
  // Default-deny: unknown sub-pages require an explicit entry in NAV_ITEMS.
  if (!item) return false;
  if (!item.roles) return true;
  return item.roles.some((r) => userRoles.includes(r));
}

/** Default landing page for a user given their roles. */
export function defaultLandingFor(userRoles: AppRole[]): string {
  const order: AppRole[] = [
    "developer",
    "admin",
    "director",
    "supervisor",
    "teacher",
    "gate_monitor",
    "parent",
    "student",
  ];
  const primary = order.find((r) => userRoles.includes(r));
  switch (primary) {
    case "developer":
      return "/dashboard/diagnostics";
    case "admin":
      return "/dashboard/admin";
    case "director":
      return "/dashboard/director";
    case "supervisor":
      return "/dashboard/supervisor";
    case "teacher":
      return "/dashboard/teacher";
    case "gate_monitor":
      return "/dashboard/gate";
    case "parent":
      return "/dashboard/parent";
    case "student":
      return "/dashboard/student";
    default:
      return "/dashboard";
  }
}
