"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, X } from "lucide-react";
import { NAVIGATION, canAccessNavigationItem } from "@/lib/navigation";
import type { User } from "@/types/auth";
export function CommandPalette({ user }: { user: User }) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const rows = useMemo(
    () =>
      NAVIGATION.filter((item) => canAccessNavigationItem(user, item)).filter(
        (item) =>
          `${sourceText(item.name)} ${sourceText(item.section)}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [user, query],
  );
  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="efop-hover-lift efop-hover-sheen hidden min-h-9 w-56 items-center gap-2 rounded-lg border bg-muted/35 px-3 text-sm text-muted-foreground transition-[border-color,background-color,box-shadow,transform,color] duration-200 hover:border-primary/25 hover:bg-muted hover:text-foreground hover:shadow-[0_14px_28px_hsl(var(--foreground)/0.07)] md:flex"
      >
        <Search className="h-4 w-4" />
        <span>
          <SourceText source="Find a workspace…" />
        </span>
        <kbd className="ms-auto rounded border bg-background px-1.5 py-0.5 text-xs">
          <SourceText source="⌘K" leading trailing />
        </kbd>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={sourceText("Workspace search")}
            className="efop-pop w-full max-w-xl overflow-hidden rounded-[1.35rem] border border-border/80 bg-popover/98 shadow-[0_28px_64px_hsl(var(--foreground)/0.18)] backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && rows[0]) go(rows[0].href);
                }}
                placeholder={sourceText("Search pages and workspaces")}
                className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
              />
              <button
                aria-label={sourceText("Close")}
                onClick={() => setOpen(false)}
                className="efop-hover-lift rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  <SourceText
                    source="No authorized workspace matches your search."
                    leading
                    trailing
                  />
                </p>
              ) : (
                rows.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => go(item.href)}
                    className="group efop-hover-lift efop-hover-sheen flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm transition-[background-color,color,box-shadow,transform,border-color] duration-200 hover:bg-accent hover:shadow-[0_14px_28px_hsl(var(--foreground)/0.07)]"
                  >
                    <span className="rounded-lg bg-muted p-2 transition-colors duration-200 group-hover:bg-primary/12 group-hover:text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block font-medium">
                        {sourceText(item.name)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sourceText(item.section)}
                      </span>
                    </span>
                    <CornerDownLeft className="ms-auto h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                  </button>
                ))
              )}
            </div>
            <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              <SourceText
                source="Navigation is filtered to your assigned role."
                leading
                trailing
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
