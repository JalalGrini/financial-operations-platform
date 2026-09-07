"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  User as UserIcon,
  Settings,
  LogOut,
  ChevronDown,
  CircleDot,
} from "lucide-react";
import {
  NAVIGATION,
  canAccessNavigationItem,
  getEffectiveRoles,
  type NavItem,
} from "@/lib/navigation";
import type { User } from "@/types/auth";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlobalControls } from "@/components/collaboration/GlobalControls";
import { ContextTagAction } from "@/components/collaboration/ContextTagAction";
import { RouteHelp } from "@/components/product/RouteHelp";
import { SourceText } from "@/components/i18n/SourceText";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ROLE_LABELS: Record<string, string> = {
  Administrator: "Administrateur",
  Assistant: "Assistant",
  Director: "Directeur",
};

const ROLE_TONE: Record<string, string> = {
  Administrator: "bg-primary/10 text-primary border-primary/15",
  Assistant: "bg-brand-blue-500/10 text-brand-blue-600 border-brand-blue-500/15",
  Director: "bg-amber-500/10 text-amber-700 border-amber-500/15 dark:text-amber-400",
};

interface SidebarProps {
  navigation?: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onToggle?: () => void;
  user?: User;
  uiReleaseId?: string;
  apiReleaseId?: string | null;
  onLogout?: () => void;
  userMenuOpen?: boolean;
  setUserMenuOpen?: (open: boolean) => void;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({
  navigation: nav = NAVIGATION,
  pathname,
  collapsed = false,
  onToggle,
  user,
  uiReleaseId,
  apiReleaseId,
  onLogout,
  userMenuOpen,
  setUserMenuOpen,
  mobile = false,
  onNavigate,
}: SidebarProps) {
  const filteredNav = nav.filter((item) => canAccessNavigationItem(user, item));
  const effectiveRoles = getEffectiveRoles(user);
  const sections = Array.from(new Set(filteredNav.map((item) => item.section)));
  const versionMismatch =
    apiReleaseId && uiReleaseId && apiReleaseId !== uiReleaseId;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 start-0 z-50 flex flex-col",
        "border-e border-border/60 bg-[hsl(var(--sidebar)/0.97)] backdrop-blur-xl",
        "shadow-[4px_0_32px_rgba(15,23,42,0.06)]",
        "transition-[width,transform] duration-[280ms] ease-out will-change-[width]",
        mobile ? "w-72 flex shadow-2xl" : "hidden lg:flex",
        !mobile && (collapsed ? "lg:w-[4.25rem]" : "lg:w-[15.5rem]"),
      )}
      aria-label={sourceText("Sidebar navigation")}
    >
      {/* ─── Brand / Logo ─── */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border/50 px-3",
          collapsed && !mobile ? "justify-center" : "justify-between",
        )}
      >
        <Link
          href="/dashboard"
          className="group flex min-w-0 items-center gap-2.5"
          aria-label="Groupe 3RB"
        >
          <Logo size={32} showText={!collapsed || mobile} />
        </Link>

        {mobile && (
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => onToggle?.()}
            aria-label={sourceText("Close sidebar")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ─── Navigation ─── */}
      <nav
        className="flex-1 overflow-hidden py-3"
        aria-label={sourceText("Main navigation")}
      >
        <ScrollArea className="h-full px-2">
          {sections.map((section) => (
            <div key={section} className="mb-4">
              {(!collapsed || mobile) && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {sourceText(section)}
                </p>
              )}
              <div className="space-y-0.5">
                {filteredNav
                  .filter((item) => item.section === section)
                  .map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        pathname.startsWith(item.href + "/"));
                    return (
                      <NavLink
                        key={item.name}
                        item={item}
                        isActive={isActive}
                        collapsed={collapsed && !mobile}
                        onNavigate={onNavigate}
                      />
                    );
                  })}
              </div>
            </div>
          ))}
        </ScrollArea>
      </nav>

      {/* ─── Collapse toggle (desktop) ─── */}
      {!mobile && (
        <div className="border-t border-border/50 p-2">
          <button
            onClick={onToggle}
            className={cn(
              "flex w-full items-center rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              collapsed ? "justify-center" : "gap-2",
            )}
            aria-label={collapsed ? sourceText("Expand sidebar") : sourceText("Collapse sidebar")}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>{sourceText("Collapse")}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ─── Release badge ─── */}
      <div
        className={cn(
          "border-t border-border/50 px-3 py-1.5 font-mono text-[0.6rem] text-muted-foreground/60",
          versionMismatch && "bg-destructive/8 text-destructive",
        )}
        title={`UI ${uiReleaseId ?? "unknown"} / API ${apiReleaseId ?? "checking"}`}
      >
        {collapsed && !mobile
          ? null
          : `UI ${uiReleaseId ?? "…"} / API ${apiReleaseId ?? "…"}`}
      </div>

      {/* ─── User footer ─── */}
      <div className="gradient-card rounded-xl p-3">
        <UserMenu
          user={user}
          collapsed={collapsed && !mobile}
          onLogout={onLogout}
          isOpen={userMenuOpen}
          onClose={setUserMenuOpen}
        />
        {(!collapsed || mobile) && effectiveRoles.length === 0 && (
          <p className="mt-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-[0.68rem] text-destructive">
            <SourceText source="No recognized role assigned." leading trailing />
          </p>
        )}
      </div>
    </aside>
  );
}

function NavLink({
  item,
  isActive,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex min-h-[2.375rem] items-center gap-2.5 rounded-xl px-3 py-2",
        "text-[0.8125rem] font-medium transition-all duration-150",
        collapsed && "justify-center px-2",
        isActive
          ? [
              "bg-primary/10 text-primary",
              "before:absolute before:start-0 before:top-1/2 before:-translate-y-1/2",
              "before:h-5 before:w-[3px] before:rounded-e-full before:bg-[linear-gradient(135deg,hsl(224,71%,36%)_0%,hsl(240,60%,45%)_100%)]",
              "rtl:before:start-auto rtl:before:end-0 rtl:before:rounded-s-full rtl:before:rounded-e-none",
            ]
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <item.icon
        className={cn(
          "h-[18px] w-[18px] flex-shrink-0 transition-colors duration-150",
          isActive
            ? "text-primary scale-110"
            : "text-muted-foreground group-hover:text-[hsl(var(--hover-accent))]",
        )}
        aria-hidden="true"
        strokeWidth={1.5}
      />
      {!collapsed && (
        <span className="truncate leading-none">{sourceText(item.name)}</span>
      )}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {sourceText(item.name)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface TopBarProps {
  onMenuClick: () => void;
  title?: string;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
    isCurrent?: boolean;
  }>;
  pathname?: string;
  user?: User;
}

export function TopBar({
  onMenuClick,
  title,
  breadcrumbs,
  pathname = "",
}: TopBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center justify-between",
        "border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl",
        "shadow-[0_1px_12px_rgba(15,23,42,0.04)] lg:px-6",
      )}
    >
      <div className="flex items-center gap-3">
        <MobileMenuButton onClick={onMenuClick} />
        <div>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <Breadcrumb items={breadcrumbs} className="text-sm" />
          ) : title ? (
            <h1 className="truncate max-w-[160px] sm:max-w-none text-sm font-semibold text-foreground">
              {sourceText(title)}
            </h1>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <RouteHelp pathname={pathname} />
        <ContextTagAction />
        <GlobalControls />
      </div>
    </header>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
      onClick={onClick}
      aria-label={sourceText("Open menu")}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}
interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  separator?: React.ReactNode;
}

const Breadcrumb = ({
  items,
  className,
  separator = <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />,
}: BreadcrumbProps) => (
  <nav
    className={cn("flex items-center gap-1.5 text-sm", className)}
    aria-label={sourceText("Breadcrumb")}
  >
    <ol className="flex items-center gap-1.5">
      {items.map((item, index) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden="true">{separator}</span>
          )}
          {item.href && !item.isCurrent ? (
            <Link
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className={cn(
                "font-medium text-foreground",
                item.isCurrent && "font-semibold",
              )}
              aria-current={item.isCurrent ? "page" : undefined}
            >
              {item.label}
            </span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

interface UserMenuProps {
  user?: User;
  collapsed?: boolean;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: (open: boolean) => void;
}

function UserMenu({ user, collapsed = false, onLogout, isOpen, onClose }: UserMenuProps) {
  const effectiveRoles = getEffectiveRoles(user);
  const primaryRole = effectiveRoles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl p-2",
            "border border-transparent text-sm transition-all duration-150",
            "hover:border-border/60 hover:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            collapsed && "justify-center",
          )}
          aria-label={sourceText("User menu")}
          aria-expanded={isOpen}
        >
          <Avatar className="h-7 w-7 shrink-0 ring-2 ring-background">
            {user?.avatar_url && (
              <AvatarImage
                src={user.avatar_url}
                alt={user?.full_name ?? sourceText("User")}
              />
            )}
            <AvatarFallback className="bg-primary text-[0.65rem] font-bold text-primary-foreground">
              {user?.full_name?.charAt(0).toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-start">
                <span className="block truncate text-[0.8125rem] font-semibold leading-none text-foreground">
                  {user?.full_name ?? sourceText("User")}
                </span>
                {primaryRole && (
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center rounded-sm px-1.5 py-0.5",
                      "text-[0.6rem] font-bold uppercase tracking-[0.1em]",
                      "border",
                      ROLE_TONE[primaryRole] ?? "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {sourceText(ROLE_LABELS[primaryRole] ?? primaryRole)}
                  </span>
                )}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-60"
      >
        <div className="px-3 py-2">
          <p className="text-sm font-semibold text-foreground">
            {user?.full_name ?? sourceText("User")}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {user?.email}
          </p>
          {effectiveRoles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {effectiveRoles.map((role) => (
                <span
                  key={role}
                  className={cn(
                    "inline-flex items-center rounded-sm px-1.5 py-0.5",
                    "text-[0.6rem] font-bold uppercase tracking-[0.1em] border",
                    ROLE_TONE[role] ?? "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {sourceText(ROLE_LABELS[role] ?? role)}
                </span>
              ))}
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" onClick={() => onClose?.(false)}>
            <UserIcon className="me-2.5 h-4 w-4" />
            <SourceText source="Profile" leading trailing />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={() => onClose?.(false)}>
            <Settings className="me-2.5 h-4 w-4" />
            <SourceText source="Settings" leading trailing />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => { onLogout?.(); onClose?.(false); }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="me-2.5 h-4 w-4" />
          <SourceText source="Log out" leading trailing />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu, Breadcrumb };
