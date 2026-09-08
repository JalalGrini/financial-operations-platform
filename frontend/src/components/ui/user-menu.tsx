"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogOut, User, Settings, ChevronDown, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import type { User as AuthUser } from "@/types/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
interface UserMenuProps {
  user?: AuthUser;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: (open: boolean) => void;
}
export function UserMenu({ user, onLogout, isOpen, onClose }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const { user: authUser, logout: authLogout } = useAuth();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentUser = user || authUser;
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const handleLogout = async () => {
    try {
      if (onLogout) {
        await onLogout();
      } else {
        await authLogout();
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      router.push("/login");
      router.refresh();
      setOpen(false);
    }
  };
  if (!currentUser) return null;
  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        className="efop-hover-lift relative h-9 w-9 rounded-full"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Avatar className="h-9 w-9">
          {currentUser?.avatar_url && (
            <AvatarImage
              key={currentUser.avatar_url}
              src={currentUser.avatar_url}
              alt={currentUser?.full_name || currentUser?.email || "User"}
            />
          )}
          <AvatarFallback>
            {currentUser?.full_name?.charAt(0).toUpperCase() ||
              currentUser?.email?.charAt(0).toUpperCase() ||
              "U"}
          </AvatarFallback>
        </Avatar>
        <ChevronDown
          className={cn(
            "absolute end-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground transition-transform duration-300",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </Button>

      {open && (
        <div className="efop-pop absolute end-0 z-50 mt-2 w-56 origin-top-right rounded-xl border border-border/80 bg-popover/98 py-1 shadow-[0_20px_52px_hsl(var(--foreground)/0.16)] ring-1 ring-border/70 ring-offset-background backdrop-blur-xl focus:outline-none animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-medium truncate">
              {currentUser?.full_name || currentUser?.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {currentUser?.email}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {getEffectiveRoles(currentUser)[0] || "User"}
            </p>
          </div>
          <Separator />
          <Link
            href="/profile"
            className="efop-hover-lift flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-foreground transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent hover:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)]"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" />
            <SourceText source="Profile" leading trailing />
          </Link>
          <Link
            href="/settings"
            className="efop-hover-lift flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-foreground transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent hover:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)]"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-4 w-4" />
            <SourceText source="Settings" leading trailing />
          </Link>
          <Separator />
          <Button
            variant="ghost"
            className="efop-hover-lift flex w-full items-center justify-start gap-2 rounded-lg px-4 py-2 text-sm text-destructive transition-[background-color,color,box-shadow,transform] duration-200 hover:bg-accent hover:text-destructive hover:shadow-[0_10px_24px_hsl(var(--foreground)/0.08)]"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <SourceText source="Log out" leading trailing />
          </Button>
        </div>
      )}
    </div>
  );
}
interface MobileMenuButtonProps {
  onClick: () => void;
}
export function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
  return (
    <button
      className="lg:hidden fixed top-4 start-4 z-50 p-2 rounded-lg bg-background border border-border shadow-md"
      onClick={onClick}
      aria-label={sourceText("Open menu")}
    >
      <Menu className="h-6 w-6" />
    </button>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
