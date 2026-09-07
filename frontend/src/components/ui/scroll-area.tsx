"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("relative overflow-auto", className)}
        {...props}
      />
    );
  },
);
ScrollArea.displayName = "ScrollArea";
