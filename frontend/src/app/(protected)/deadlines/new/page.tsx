"use client";

import { CalendarClock } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { DeadlineCreateForm } from "@/features/deadlines/DeadlineForm";

import { sourceText } from "@/lib/i18n/source-catalog";
export default function NewDeadlinePage() {
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Deadlines", href: "/deadlines" },
          { label: "New deadline", isCurrent: true },
        ]}
      />
      <PageHero
        icon={CalendarClock}
        eyebrow="Persistent operations planner"
        title={sourceText("Create deadline")}
        description={sourceText("Add a checkpoint stored through the real Django API. One-time or recurring - monthly, quarterly, yearly or a custom period.")}
      />
      <DeadlineCreateForm />
    </div>
  );
}
