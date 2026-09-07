"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { LeaveForm } from "@/features/leaves/LeaveForm";
import { leavesApi } from "@/features/leaves/api";

export default function LeaveEditPage() {
  const { id } = useParams<{ id: string }>();
  const { data: leave, isLoading, error } = useQuery({
    queryKey: ["leave", id],
    queryFn: () => leavesApi.get(Number(id)),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !leave) {
    return (
      <div className="p-6 text-center text-destructive">
        <SourceText source="Leave record not found." />
      </div>
    );
  }

  return <LeaveForm leave={leave} />;
}
