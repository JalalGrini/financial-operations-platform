"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

import { sourceText } from "@/lib/i18n/source-catalog";
// ---------------------------------------------------------------------------
// Steps / StepIndicator -- multi-step form/wizard progress indicator
// Inspired by shadcnblocks.com + 21st.dev stepper patterns
//
// Usage:
//   <Steps currentStep={2} steps={["Details","Documents","Review","Submit"]} />
// ---------------------------------------------------------------------------

export interface StepsProps {
  steps: Array<string | { label: string; description?: string }>;
  currentStep: number;  // 1-based
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Steps({
  steps,
  currentStep,
  orientation = "horizontal",
  className,
}: StepsProps) {
  const isVertical = orientation === "vertical";

  return (
    <nav
      aria-label={sourceText("Progress")}
      className={cn(
        isVertical ? "flex flex-col gap-0" : "flex items-center gap-0 overflow-x-auto",
        className,
      )}
    >
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const label = typeof step === "string" ? step : step.label;
        const description = typeof step === "string" ? undefined : step.description;
        const status =
          stepNum < currentStep
            ? "complete"
            : stepNum === currentStep
              ? "current"
              : "upcoming";

        const isLast = idx === steps.length - 1;

        return (
          <React.Fragment key={idx}>
            <div
              className={cn(
                "flex shrink-0 items-center gap-3",
                isVertical ? "flex-row" : "flex-col items-center",
              )}
              aria-current={status === "current" ? "step" : undefined}
            >
              {/* Bullet */}
              <span
                className={cn(
                  "relative grid size-9 place-items-center rounded-full border-2 text-sm font-bold transition-all duration-200",
                  status === "complete" &&
                    "border-primary bg-primary text-primary-foreground",
                  status === "current" &&
                    "border-primary bg-primary/10 text-primary ring-4 ring-primary/20",
                  status === "upcoming" &&
                    "border-border bg-background text-muted-foreground",
                )}
              >
                {status === "complete" ? (
                  <Check className="size-4" />
                ) : (
                  stepNum
                )}
              </span>

              {/* Label */}
              <div className={cn(isVertical ? "" : "text-center")}>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    status === "complete" && "text-muted-foreground",
                    status === "current" && "text-foreground",
                    status === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {label}
                </p>
                {description && (
                  <p className="text-xs text-muted-foreground">{description}</p>
                )}
              </div>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                aria-hidden="true"
                className={cn(
                  "flex-1 transition-colors duration-200",
                  isVertical
                    ? "ms-4 my-1 h-6 w-px border-s-2"
                    : "mx-2 mt-[-18px] h-px min-w-[2rem] border-t-2",
                  stepNum < currentStep
                    ? "border-primary"
                    : "border-border",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
