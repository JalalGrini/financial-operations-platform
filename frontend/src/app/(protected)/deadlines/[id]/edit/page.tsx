"use client";

import { useParams } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Breadcrumb } from "@/components/ui/page-components";
import { DeadlineEditLoader } from "@/features/deadlines/DeadlineForm";

import { sourceText } from "@/lib/i18n/source-catalog";
export default function EditDeadlinePage() {
  const params = useParams();
  const deadlineId = params.id as string;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: sourceText("Deadlines"), href: "/deadlines" },
          { label: sourceText("Edit deadline"), isCurrent: true },
        ]}
      />
      <PageHero
        icon={CalendarClock}
        eyebrow="Persistent operations planner"
        title={sourceText("Edit deadline")}
        description={sourceText("Update the title, due date, priority, assignee or recurrence. Changes persist through the Django API.")}
      />
      <DeadlineEditLoader deadlineId={deadlineId} />
    </div>
  );
}
