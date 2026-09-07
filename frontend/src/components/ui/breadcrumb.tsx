import * as React from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Breadcrumb -- accessible breadcrumb navigation
// Inspired by shadcnblocks.com breadcrumb + 21st.dev trail patterns
// ---------------------------------------------------------------------------

export const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & {
    separator?: React.ReactNode;
  }
>(({ ...props }, ref) => <nav ref={ref} aria-label="breadcrumb" {...props} />);
Breadcrumb.displayName = "Breadcrumb";

export const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<"ol">
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground",
      className,
    )}
    {...props}
  />
));
BreadcrumbList.displayName = "BreadcrumbList";

export const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    className={cn("inline-flex items-center gap-1.5", className)}
    {...props}
  />
));
BreadcrumbItem.displayName = "BreadcrumbItem";

export const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a"> & {
    asChild?: boolean;
    href?: string;
  }
>(({ asChild, className, href, children, ...props }, ref) => {
  if (href) {
    return (
      <Link
        href={href}
        ref={ref as any}
        className={cn(
          "font-medium transition-colors hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </Link>
    );
  }
  return (
    <span
      ref={ref as any}
      className={cn(
        "font-medium transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

export const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn("font-semibold text-foreground", className)}
    {...props}
  />
));
BreadcrumbPage.displayName = "BreadcrumbPage";

export const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn("text-muted-foreground/50", className)}
    {...props}
  >
    {children ?? <ChevronRight className="size-3.5" />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

export const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn("flex size-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="size-4" />
    <span className="sr-only">{sourceText("More")}</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbElipsis";

// ---------------------------------------------------------------------------
// EfopBreadcrumb -- convenience wrapper that builds the trail from an array
//
// Usage:
//   <EfopBreadcrumb
//     items={[
//       { label: "Personnel", href: "/personnel/personnel" },
//       { label: "John Doe" },
//     ]}
//   />
// ---------------------------------------------------------------------------

export interface BreadcrumbItemDef {
  label: string;
  href?: string;
}

export function EfopBreadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItemDef[];
  className?: string;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList className={className}>
        {items.map((item, i) => (
          <React.Fragment key={i}>
            <BreadcrumbItem>
              {i < items.length - 1 ? (
                <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {i < items.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
