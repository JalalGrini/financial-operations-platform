import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "shrink-0 bg-border",
          orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
          className,
        )}
        role={decorative ? "none" : "separator"}
        aria-orientation={decorative ? undefined : orientation}
        {...props}
      />
    );
  },
);
Separator.displayName = "Separator";
