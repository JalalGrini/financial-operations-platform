"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  CheckCheck,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { collaborationApi, Mention } from "@/features/collaboration/api";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { formatDate, useExperience } from "@/lib/experience";

export default function TaggedPage() {
  const { t, locale } = useExperience();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["mentions", "mine"],
    queryFn: collaborationApi.mentions,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["mentions"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const resolve = useMutation({
    mutationFn: collaborationApi.resolve,
    onSuccess: refresh,
  });
  const untag = useMutation({
    mutationFn: collaborationApi.untag,
    onSuccess: refresh,
  });
  const rows: Mention[] = query.data?.results ?? query.data ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        icon={AtSign}
        eyebrow="Collaboration queue"
        title={sourceText("Tagged for me")}
        description={sourceText("Records explicitly routed to you for review, follow-up and cross-team coordination.")}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={AtSign} label={sourceText("Active tags")} value={rows.length} tone="primary" />
        <StatCard icon={Link2} label={sourceText("Open records")} value={rows.filter((row) => !row.resolved_at).length} tone="amber" />
        <StatCard icon={CheckCheck} label={sourceText("Resolved")} value={rows.filter((row) => !!row.resolved_at).length} tone="emerald" />
      </section>

      <Card className="border-border/80">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>
                <SourceText source="Assigned records" />
              </CardTitle>
              <CardDescription>{t("taggedDescription")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={refresh}
              title={sourceText("Refresh")}
            >
              {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive">
              <SourceText source="Failed to load mentions. Please refresh and try again." />
            </div>
          ) : query.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="rounded-2xl border border-border/60 bg-card p-4"
                />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">
              {t("emptyTagged")}
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <Card
                  key={row.id}
                  className="border-border/70 bg-background/70 shadow-none"
                >
                  <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <Link
                        href={row.destination}
                        className="font-semibold text-primary hover:underline"
                      >
                        {row.target_label}
                      </Link>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {row.tagged_by_name}
                        {row.message ? ` — ${row.message}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(row.created_at, locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => resolve.mutate(row.id)}
                      >
                        {t("resolve")}
                      </Button>
                      {row.can_untag && (
                        <Button
                          variant="ghost"
                          onClick={() => untag.mutate(row.id)}
                        >
                          {t("removeTag")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
