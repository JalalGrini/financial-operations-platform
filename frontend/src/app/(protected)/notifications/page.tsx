"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Clock3, Inbox } from "lucide-react";
import { collaborationApi, Notification } from "@/features/collaboration/api";
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
import { WriteOnly } from "@/components/auth/WriteOnly";
import { BlurFade } from "@/components/ui/blur-fade";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { Stagger, FadeIn } from "@/components/ui/stagger";
import { AnimatedCard } from "@/components/ui/animated-card";
import { PulseIndicator } from "@/components/ui/pulse-indicator";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";


export default function NotificationsPage() {
  const { t, locale } = useExperience();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => collaborationApi.notifications(false),
  });
  const markAll = useMutation({
    mutationFn: collaborationApi.readAll,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markRead = useMutation({
    mutationFn: collaborationApi.read,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const rows: Notification[] = query.data?.results ?? [];
  const unreadCount = rows.filter((row) => !row.read_at).length;

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <BlurFade>
      <PageHero
        icon={Bell}
        eyebrow="Activity centre"
        title={sourceText("Notifications")}
        description={sourceText("Persistent, permission-aware activity — unread alerts and tagged workflow updates stored across every session.")}
        action={<WriteOnly>
          <Button
            variant="onHero"
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="me-2 h-4 w-4" />
            {t("markAll")}
          </Button>
        </WriteOnly>}
      />
      </BlurFade>

      {/* ── Stat strip ── */}
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Bell}
          label={sourceText("Unread")}
          value={unreadCount}
          tone="rose"
        />
        <StatCard
          icon={Inbox}
          label={sourceText("Total notifications")}
          value={rows.length}
          tone="primary"
        />
        <StatCard
          icon={Clock3}
          label={sourceText("Recent activity")}
          value={rows.slice(0, 5).length}
          tone="amber"
        />
      </section>

      {/* ── Inbox ── */}
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>
            <SourceText source="Inbox" />
          </CardTitle>
          <CardDescription>
            <SourceText source="Each notification links directly to the relevant EFOP record or workflow destination." />
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive">
              <SourceText source="Failed to load notifications. Please refresh and try again." />
            </div>
          ) : query.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-muted animate-pulse" />
                    <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                    <div className="ms-auto h-3 w-16 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">
              {t("emptyNotifications")}
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.destination || "#"}
                  onClick={() =>
                    !notification.read_at && markRead.mutate(notification.id)
                  }
                  className={`block rounded-2xl border px-4 py-4 transition-all duration-150 hover:border-primary/25 hover:bg-accent/30 hover:shadow-sm ${
                    notification.read_at
                      ? "border-border/70 bg-background/70"
                      : "border-primary/25 bg-primary/5 shadow-sm"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-foreground">
                          {notification.title || sourceText("Notification")}
                        </p>
                        {!notification.read_at && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            <SourceText source="Unread" />
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {notification.message ||
                          sourceText("Open the linked record for details.")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(notification.created_at, locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
