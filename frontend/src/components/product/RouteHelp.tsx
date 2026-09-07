"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
const guidance: Array<[RegExp, string, string[]]> = [
  [
    /^\/dashboard/,
    "Dashboard",
    [
      "Use the period selector to change the reporting window.",
      "Open a metric to inspect the records behind it.",
      "Only verified data is shown; a dash means data is unavailable, not zero.",
    ],
  ],
  [
    /financial-records/,
    "Financial documents",
    [
      "Choose a company and document type before entering details.",
      "Drafts remain editable; posted or paid records may be lifecycle-locked.",
      "Attachments are private and access-controlled.",
    ],
  ],
  [
    /payroll/,
    "Payroll",
    [
      "Confirm employment and effective salary before calculation.",
      "Review supplements, deductions and totals before approval.",
      "Approved payroll is historical evidence; exceptional reopening is Administrator-controlled.",
    ],
  ],
  [
    /cnss/,
    "CNSS",
    [
      "Choose the relevant company and period.",
      "Missing information and a confirmed zero are different states.",
      "Lifecycle corrections remain in audit history.",
    ],
  ],

  [
    /reports/,
    "Reports",
    [
      "Set company and period before generation.",
      "Inspect missing-source warnings before relying on totals.",
      "Use source drill-down to verify where values came from.",
    ],
  ],
  [
    /configuration/,
    "Configuration",
    [
      "Changes affect operational forms and future records.",
      "Preview and validate templates before publishing.",
      "Published versions should be superseded, not overwritten.",
    ],
  ],
  [
    /users/,
    "Users & roles",
    [
      "Create Assistant or Director accounts with a temporary password.",
      "New users must change that password before ordinary work.",
      "Roles and account state are audited.",
    ],
  ],
  [
    /audit-log/,
    "Audit log",
    [
      "Use filters to narrow the append-only history.",
      "Open an event for technical details and field changes.",
      "Audit entries are evidence and cannot be edited here.",
    ],
  ],
  [
    /inventory/,
    "Inventory",
    [
      "Every stock change needs a reason.",
      "Use movements instead of directly changing quantity.",
      "Archived items remain historical and cannot receive new movements.",
    ],
  ],
];
export function RouteHelp({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const item = guidance.find(([pattern]) => pattern.test(pathname));
  if (!item) return null;
  const [, title, bullets] = item;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={sourceText("Open contextual help")}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="h-4 w-4" />
        <span className="hidden xl:inline">
          <SourceText source="Help" />
        </span>
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/35 p-4 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-help-title"
            className="efop-pop ms-auto mt-16 w-full max-w-sm rounded-xl border bg-popover p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="efop-kicker">
                  <SourceText source="Workspace guide" />
                </p>
                <h2
                  id="route-help-title"
                  className="mt-1 text-lg font-semibold"
                >
                  {sourceText(title)}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={sourceText("Close help")}
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ul className="mt-4 space-y-3">
              {bullets.map((text, index) => (
                <li
                  key={text}
                  className="flex gap-3 text-sm leading-6 text-muted-foreground"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {index + 1}
                  </span>
                  <span>{sourceText(text)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              <SourceText
                source="Your role controls which actions are available. Hidden actions are intentionally unavailable, not missing."
                leading
                trailing
              />
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
import { SourceText } from "@/components/i18n/SourceText";
