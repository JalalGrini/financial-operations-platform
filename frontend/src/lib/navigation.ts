import {
  ArrowLeftRight,
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  FileText,
  BarChart3,
  Settings,
  Landmark,
  Handshake,
  Contact,
  Receipt,
  SlidersHorizontal,
  BadgeDollarSign,
  Library,
  LayoutTemplate,
  Package,
  ScrollText,
  Bell,
  AtSign,
  UserCog,
  CalendarDays,
  LifeBuoy,
  Inbox,
  ShieldCheck,
  Calculator,
  BookOpen,
  Tag,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RoleName, User } from "@/types/auth";

export type NavSection =
  | "Overview"
  | "Organization"
  | "People"
  | "Partners"
  | "Finance"
  | "Administration"
  | "Personnel";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: RoleName[];
  section: NavSection;
}

export function getEffectiveRoles(user: User | null | undefined): RoleName[] {
  if (!user) return [];
  const recognized = (user.roles ?? []).filter((role): role is RoleName =>
    ["Administrator", "Assistant", "Director"].includes(role),
  );
  if (user.is_superuser && !recognized.includes("Administrator")) {
    return ["Administrator", ...recognized];
  }
  return recognized;
}

export function canAccessNavigationItem(
  user: User | null | undefined,
  item: NavItem,
): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  const roles = getEffectiveRoles(user);
  return roles.some((role) => item.roles.includes(role));
}

/**
 * Modules retired from the product surface.
 *
 * The definitions below are kept intact on purpose: retiring a module is a
 * product decision, and keeping the entry means restoring it is a one-line
 * change rather than an archaeology exercise. Nothing is deleted.
 *
 * Hiding the sidebar entry does NOT make a route unreachable - the pages still
 * answer on a direct URL, and the API endpoints behind them are untouched.
 */
/*
 * v17.21 supersedes the v17.18 retirement. Treasury and Personnel Reports are
 * no longer hidden from everyone; they are Administrator-only modules, gated on
 * the API (apps/treasury/permissions.py, apps/personnel/permissions.py) and
 * shown in the sidebar only to Administrator via their `roles` arrays below.
 *
 * The list stays - empty - because it is the supported way to retire a module
 * and it is exercised by lib/navigation.test.ts. Adding an href here removes
 * the entry for every role, superusers included.
 */
export const RETIRED_ROUTES: readonly string[] = [];

/** Every module ever defined, including retired ones. */
export const ALL_NAV_ITEMS: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Overview",
  },
  {
    name: "Trésorerie",
    href: "/tresorerie",
    icon: Wallet,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Overview",
  },
  {
    name: "Companies",
    href: "/companies",
    icon: Building2,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Organization",
  },
  {
    name: "Personnel",
    href: "/personnel/personnel",
    icon: Users,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Personnel",
  },
  {
    name: "Employments",
    href: "/personnel/employments",
    icon: Briefcase,
    roles: ["Administrator", "Assistant"],
    section: "Personnel",
  },
  {
    name: "Salary History",
    href: "/personnel/salaries",
    icon: BadgeDollarSign,
    roles: ["Administrator", "Assistant"],
    section: "Personnel",
  },
  {
    name: "Payroll",
    href: "/personnel/payroll",
    icon: Calculator,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Personnel",
  },
  {
    name: "CNSS",
    href: "/personnel/cnss",
    icon: ShieldCheck,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Personnel",
  },
  {
    name: "Leaves",
    href: "/leaves",
    icon: CalendarDays,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Personnel",
  },
  {
    name: "Parties",
    href: "/parties",
    icon: Handshake,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Partners",
  },
  {
    name: "Clients",
    href: "/clients",
    icon: Contact,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Partners",
  },
  {
    name: "Financial Records",
    href: "/financial-records",
    icon: Receipt,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Finance",
  },
  {
    name: "Treasury",
    href: "/treasury",
    icon: Landmark,
    // Administrator-only by owner decision (v17.21). The API agrees: see
    // apps/treasury/permissions.py. Widening this array alone would only
    // produce 403s.
    roles: ["Administrator"],
    section: "Finance",
  },
  {
    name: "Transfers",
    href: "/transfers",
    icon: ArrowLeftRight,
    // Every recognised role can open Transfers. Write access is a separate
    // question, decided per control on the page - see CanManageTransfers.
    roles: ["Administrator", "Director", "Assistant"],
    section: "Finance",
  },
  {
    name: "Inventory",
    href: "/inventory",
    icon: Package,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Finance",
  },
  {
    name: "Reports Registry",
    href: "/reports",
    icon: Library,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Finance",
  },
  {
    name: "Personnel Reports",
    href: "/personnel/reports",
    icon: BarChart3,
    // Administrator-only by owner decision (v17.21). The API agrees: see
    // CanGenerateReports in apps/personnel/permissions.py.
    roles: ["Administrator"],
    section: "Finance",
  },
  {
    name: "Configuration",
    href: "/configuration",
    icon: SlidersHorizontal,
    roles: ["Administrator"],
    section: "Administration",
  },
  {
    name: "Document Templates",
    href: "/configuration/templates",
    icon: LayoutTemplate,
    roles: ["Administrator"],
    section: "Administration",
  },
  {
    name: "Deadlines",
    href: "/deadlines",
    icon: CalendarDays,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Overview",
  },
  {
    name: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Overview",
  },
  {
    name: "Tagged for me",
    href: "/tagged",
    icon: AtSign,
    roles: ["Administrator", "Assistant", "Director"],
    section: "Overview",
  },
  {
    name: "Audit Log",
    href: "/audit-log",
    icon: ScrollText,
    roles: ["Administrator"],
    section: "Administration",
  },
  {
    name: "Users & Roles",
    href: "/users",
    icon: UserCog,
    roles: ["Administrator"],
    section: "Administration",
  },
  {
    name: "Settings",
    href: "/personnel/settings",
    icon: Settings,
    roles: ["Administrator"],
    section: "Administration",
  },
  {
    name: "Help Tickets",
    href: "/admin/tickets",
    icon: LifeBuoy,
    roles: ["Administrator"],
    section: "Administration",
  },
  {
    name: "Clients tickets",
    href: "/admin/client-tickets",
    icon: Inbox,
    roles: ["Administrator", "Assistant"],
    section: "Administration",
  },
];

/** What the sidebar renders: everything except the retired modules. */
export const NAVIGATION: NavItem[] = ALL_NAV_ITEMS.filter(
  (item) => !RETIRED_ROUTES.includes(item.href),
);
