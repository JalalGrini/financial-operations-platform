"use client";
import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { NAVIGATION, ALL_NAV_ITEMS, canAccessNavigationItem } from "@/lib/navigation";
import { Sidebar, TopBar, MobileMenuButton } from "@/components/ui/navigation";
import { useReleaseIdentity } from "@/hooks/useReleaseIdentity";
import { MobileBottomNav } from "@/components/product/MobileBottomNav";
import { TaggedWidget } from "@/components/ui/tagged-widget";
import { NavProgress } from "@/components/ui/nav-progress";
export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const release = useReleaseIdentity();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    } else if (
      !isLoading &&
      user?.must_change_password &&
      pathname !== "/profile"
    ) {
      router.push("/profile?passwordChangeRequired=1");
    }
  }, [user, isLoading, router, pathname]);
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) {
    return null;
  }

  // --- Global route permission guard ---
  // Find a nav item whose href is a prefix of the current pathname.
  // If found and the user lacks the required role, show a 403 screen.
  const matchedItem = ALL_NAV_ITEMS.find((item) =>
    pathname === item.href || pathname.startsWith(item.href + "/")
  );
  const routeForbidden =
    matchedItem !== undefined && !canAccessNavigationItem(user, matchedItem);
  if (routeForbidden) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center">
            <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              {/* Alien behind forcefield */}
              <circle cx="100" cy="140" r="50" fill="hsl(var(--muted))" />
              <ellipse cx="100" cy="115" rx="32" ry="38" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
              <circle cx="88" cy="110" r="7" fill="hsl(var(--foreground))" />
              <circle cx="112" cy="110" r="7" fill="hsl(var(--foreground))" />
              <circle cx="90" cy="108" r="2.5" fill="hsl(var(--background))" />
              <circle cx="114" cy="108" r="2.5" fill="hsl(var(--background))" />
              <path d="M88 125 Q100 133 112 125" stroke="hsl(var(--muted-foreground))" strokeWidth="2" fill="none" strokeLinecap="round" />
              <ellipse cx="100" cy="148" rx="28" ry="12" fill="hsl(var(--primary))" opacity="0.15" />
              <ellipse cx="100" cy="148" rx="20" ry="8" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.4" />
              <rect x="30" y="75" width="140" height="100" rx="12" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.25" strokeDasharray="6 3" />
              <path d="M30 75 L170 75 L170 175 L30 175 Z" fill="hsl(var(--primary))" opacity="0.04" />
              <rect x="82" y="60" width="36" height="20" rx="4" fill="hsl(var(--destructive))" opacity="0.9" />
              <text x="100" y="74" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">403</text>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don&apos;t have permission to access this section.
            If you think this is a mistake, contact your administrator.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }
  // --- End route guard ---

  return (
    <div className="min-h-screen bg-[hsl(var(--app-canvas))] app-gradient-bg flex">
      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <Sidebar
            navigation={NAVIGATION}
            pathname={pathname}
            collapsed={false}
            onToggle={() => setMobileMenuOpen(false)}
            user={user}
            uiReleaseId={release.uiReleaseId}
            apiReleaseId={release.backend?.release_id}
            onLogout={logout}
            mobile
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </>
      )}

      {/* Sidebar */}
      <Sidebar
        navigation={NAVIGATION}
        pathname={pathname}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        user={user}
        uiReleaseId={release.uiReleaseId}
        apiReleaseId={release.backend?.release_id}
        onLogout={logout}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
      />

      {/* Main content */}
      <main
        className={cn(
          "min-w-0 flex-1 pb-20 transition-[margin,padding] duration-[280ms] ease-out lg:pb-0",
          sidebarOpen ? "lg:ms-[15.5rem]" : "lg:ms-[4.25rem]",
        )}
      >
        {release.isMismatch && (
          <div
            role="alert"
            className="bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground"
          >
            <SourceText source="Frontend" leading trailing />
            {release.uiReleaseId}
            <SourceText source="and backend" leading />{" "}
            {release.backend?.release_id}
            <SourceText
              source="do not match. Stop both servers and run the fresh-start script from this release folder."
              leading
              trailing
            />
          </div>
        )}
        {release.error && (
          <div
            role="alert"
            className="bg-amber-100 px-4 py-2 text-sm text-amber-900"
          >
            <SourceText
              source="API release identity could not be verified:"
              leading
              trailing
            />
            {release.error}
          </div>
        )}

        {/* Top bar */}
        <TopBar
          onMenuClick={() => setMobileMenuOpen(true)}
          title={
            NAVIGATION.find(
              (item) =>
                pathname === item.href || pathname.startsWith(item.href + "/"),
            )?.name
          }
          pathname={pathname}
          user={user}
        />

        {/* Page content — AnimatePresence enables route transitions */}
        <div className="px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="efop-workspace"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <MobileBottomNav onMore={() => setMobileMenuOpen(true)} />
      <NavProgress />
      <TaggedWidget />
    </div>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
