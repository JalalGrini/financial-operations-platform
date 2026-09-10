"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, CheckCircle2, Trash2, Mail,
  LifeBuoy, Clock, AlertTriangle, Search, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminOnly } from "@/components/auth/WriteOnly";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { ViewToggle, useViewMode } from "@/components/ui/view-toggle";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { SkeletonTable } from "@/components/ui/page-skeletons";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/personnel/components/common";
import {
  ReplyChannelToggle,
  type ReplyChannel,
} from "@/components/ui/reply-channel-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HELP_SUBJECT_KEYS,
  HELP_SUBJECT_SOURCE,
} from "@/lib/ticket-mail";

interface Ticket {
  id: number;
  reason: string;
  subject_key?: string;
  name: string;
  email: string;
  message: string;
  status: "open" | "closed";
  created_at: string;
  reply_subject: string;
  reply_body: string;
  replied_at: string | null;
  reply_sent: boolean;
  replied_by_name: string | null;
  resolved_by_name: string | null;
}

const REASON_LABELS: Record<string, string> = {
  forgot_password: "Forgot password",
  cannot_sign_in: "I cannot sign in",
  login_issue: "Login problem",
  access_denied: "Access denied",
  page_not_loading: "A page does not load",
  page_blocked: "A page is blocked or access is denied",
  data_not_saving: "Data is not saving",
  display_issue: "Display or language issue",
  other_issue: "Other issue",
  other: "Other",
};

function ticketIssueLabel(ticket: Ticket) {
  if (ticket.subject_key && ticket.subject_key in HELP_SUBJECT_SOURCE) {
    return HELP_SUBJECT_SOURCE[ticket.subject_key as keyof typeof HELP_SUBJECT_SOURCE];
  }
  return REASON_LABELS[ticket.reason] ?? ticket.reason;
}

const STATUS_COLORS: Record<string, string> = {
  open:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  closed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function buildTemplate(reason: string, ticket: Ticket) {
  const base   = `Dear ${ticket.name},\n\nThank you for contacting EFOP Support.\n\n`;
  const footer = `\n\nIf you have any further questions, please do not hesitate to reach out.\n\nBest regards,\nEFOP Support Team`;
  switch (reason) {
    case "forgot_password":
      return {
        subject: sourceText("Reply to your ticket on 3.R.B Extreme"),
        body: base + sourceText("Password resets are now sent as a 6-digit code from Forgot password on the sign-in page.") + footer,
      };
    case "login_issue":
      return {
        subject: "EFOP \u2014 Your Login Issue Has Been Resolved",
        body: base + `We have investigated and resolved the login issue with your account.\n\nPlease try logging in again. If the issue persists, contact us.` + footer,
      };
    case "access_denied":
      return {
        subject: "EFOP \u2014 Your Access Request Has Been Processed",
        body: base + `We have reviewed your access request. Your permissions have been updated accordingly.\n\nPlease log in to access the requested section.` + footer,
      };
    default:
      return {
        subject: "EFOP \u2014 Re: Your Support Request",
        body: base + `We have reviewed your request.\n\n[Write your response here]` + footer,
      };
  }
}

function defaultHelpSubjectKey(ticket: Ticket): (typeof HELP_SUBJECT_KEYS)[number] {
  if (
    ticket.subject_key &&
    (HELP_SUBJECT_KEYS as readonly string[]).includes(ticket.subject_key)
  ) {
    return ticket.subject_key as (typeof HELP_SUBJECT_KEYS)[number];
  }
  if ((HELP_SUBJECT_KEYS as readonly string[]).includes(ticket.reason)) {
    return ticket.reason as (typeof HELP_SUBJECT_KEYS)[number];
  }
  return "other_issue";
}

function ReplyDialog({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const queryClient = useQueryClient();
  const tmpl0 = buildTemplate(ticket.reason, ticket);
  const [subjectKey, setSubjectKey] = useState<(typeof HELP_SUBJECT_KEYS)[number]>(
    defaultHelpSubjectKey(ticket),
  );
  const [body, setBody] = useState(tmpl0.body);
  const [channel, setChannel] = useState<ReplyChannel>("email");
  const [phone, setPhone] = useState("");

  const replyMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/help/tickets/${ticket.id}/reply/`, {
        subject_key: subjectKey,
        reply_body: body,
        channel,
        phone: phone || undefined,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["help-tickets"] }); onClose(); },
    onError: () => toast.error(sourceText("Failed to send reply.")),
  });

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <SourceText source="Reply to Ticket" /> #{ticket.id}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ReplyChannelToggle value={channel} onChange={setChannel} />
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">{ticket.name}</p>
            <p className="text-muted-foreground">{ticket.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <SourceText source="Your reply will be sent to" />: <b>{ticket.email}</b>
            </p>
          </div>
          {channel !== "email" && (
            <div className="space-y-1">
              <Label>
                <SourceText source="Phone" />
              </Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={sourceText("+212 6 XX XX XX XX")}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="help-reply-subject">
              <SourceText source="Email subject" />
            </Label>
            <Select
              value={subjectKey}
              onValueChange={(value: string) =>
                setSubjectKey(value as (typeof HELP_SUBJECT_KEYS)[number])
              }
            >
              <SelectTrigger id="help-reply-subject">
                <SelectValue placeholder={sourceText("Choose an email subject")} />
              </SelectTrigger>
              <SelectContent>
                {HELP_SUBJECT_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    <SourceText source={HELP_SUBJECT_SOURCE[key]} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label><SourceText source="Message" /></Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}><SourceText source="Cancel" /></Button>
            <Button onClick={() => replyMutation.mutate()} disabled={replyMutation.isPending}>
              {replyMutation.isPending
                ? <Loader2 className="me-2 h-4 w-4 animate-spin" />
                : <Mail className="me-2 h-4 w-4" />}
              <SourceText source="Send Reply" leading trailing />
            </Button>
          </div>
          {replyMutation.isError && (
            <p className="text-sm text-destructive"><SourceText source="Failed to send reply." /></p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_TABS = [
  { value: "open" as const,   labelKey: "Open tickets",   icon: AlertTriangle, color: "text-amber-600"   },
  { value: "" as const,       labelKey: "All Tickets",    icon: LifeBuoy,      color: "text-foreground"  },
  { value: "closed" as const, labelKey: "Closed tickets", icon: CheckCircle2,  color: "text-emerald-600" },
];

export default function AdminTicketsPage() {
  const queryClient  = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "">("");
  const [search, setSearch]             = useState("");
  const [viewMode, setViewMode] = useViewMode("tickets", "table");
  const [replyTicket, setReplyTicket]   = useState<Ticket | null>(null);
  const [ticketConfirm, setTicketConfirm] = useState<{ open: boolean; id: number | null; action: 'close' | 'delete' | null }>({ open: false, id: null, action: null });

  const { data: rawTickets = [], isLoading, refetch } = useQuery<Ticket[]>({
    queryKey: ["help-tickets", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/help/tickets/list/?status=${statusFilter}`
        : "/help/tickets/list/";
      const r = await apiClient.get<{ results?: Ticket[] } | Ticket[]>(url);
      if (Array.isArray(r)) return r;
      return r?.results ?? [];
    },
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => apiClient.patch(`/help/tickets/${id}/`, { status: "closed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["help-tickets"] }),
    onError: () => toast.error(sourceText("Failed to close ticket.")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/help/tickets/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["help-tickets"] }),
    onError: () => toast.error(sourceText("Failed to delete ticket.")),
  });

  const tickets: Ticket[] = rawTickets.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      ticketIssueLabel(t).toLowerCase().includes(q)
    );
  });

  const openCount   = rawTickets.filter((t) => t.status === "open").length;
  const closedCount = rawTickets.filter((t) => t.status === "closed").length;

  return (
    <AdminOnly>
      <div className="space-y-6">
        <PageHero
          icon={LifeBuoy}
          eyebrow="Administration"
          title={sourceText("Help Tickets")}
          description={sourceText("Support requests from users who cannot log in or need assistance.")}
        />

        {/* Stat strip */}
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={LifeBuoy}    label={sourceText("Total tickets")} value={rawTickets.length} tone="primary" />
          <StatCard icon={AlertTriangle} label={sourceText("Open tickets")} value={openCount}   tone="amber" />
          <StatCard icon={CheckCircle2} label={sourceText("Closed tickets")} value={closedCount} tone="emerald" />
        </div>

        <Card>
          {/* CardHeader: search + status tabs + refresh — customised for tickets */}
          <CardHeader className="pb-4">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={sourceText("Search by name, email or reason…")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-10"
                />
              </div>

              {/* Refresh — icon-only mini square */}
              <Button
                variant="outline" size="icon"
                className="h-10 w-10 shrink-0 rounded-lg"
                onClick={() => refetch()} disabled={isLoading}
                title={sourceText("Refresh")}
              >
                {isLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
              </Button>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </div>

            {/* Status tab strip — inside card header */}
            <div className="mt-3 flex gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
              {STATUS_TABS.map((tab) => {
                const Icon  = tab.icon;
                const count = tab.value === "open" ? openCount : tab.value === "closed" ? closedCount : rawTickets.length;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
                      statusFilter === tab.value
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-3 w-3", statusFilter === tab.value ? "" : tab.color)} />
                    <SourceText source={tab.labelKey} />
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                      statusFilter === tab.value ? "bg-primary/10 text-primary" : "bg-muted",
                    )}>{count}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <SkeletonTable rows={4} />
            ) : tickets.length === 0 ? (
              <div className="py-16 text-center">
                <LifeBuoy className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground"><SourceText source="No tickets found." /></p>
              </div>
            ) : viewMode === "card" ? (
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {tickets.map((t) => (
                  <div key={t.id} className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight text-foreground">{t.name}</p>
                      <Badge className={cn("text-xs shrink-0", STATUS_COLORS[t.status])}>
                        {t.status === "open" ? <SourceText source="Open" /> : <SourceText source="Closed" />}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{sourceText(ticketIssueLabel(t))}</p>
                    <p className="text-xs text-muted-foreground">{t.email}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-end gap-1 pt-1">
                      {t.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => setReplyTicket(t)}>
                          <Mail className="me-1.5 h-3.5 w-3.5" />
                          <SourceText source="Reply" />
                        </Button>
                      )}
                      {(t.status as string) !== 'done' && t.status !== "closed" && (
                        <Button size="sm" variant="ghost" onClick={() => setTicketConfirm({ open: true, id: t.id, action: 'close' })}>
                          <Clock className="h-3.5 w-3.5" />
                          <SourceText source="Mark as done" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setTicketConfirm({ open: true, id: t.id, action: 'delete' })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden">
                <div className="overflow-x-auto"><Table>
                  <TableHeader>
                    <TableRow className="row-hover bg-muted/30">
                      <TableHead><SourceText source="Reason" /></TableHead>
                      <TableHead><SourceText source="Name" /></TableHead>
                      <TableHead className="hidden md:table-cell"><SourceText source="Email" /></TableHead>
                      <TableHead><SourceText source="Status" /></TableHead>
                      <TableHead className="hidden lg:table-cell"><SourceText source="Date" /></TableHead>
                      <TableHead className="hidden lg:table-cell"><SourceText source="Replied" /></TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((t) => (
                      <TableRow className="row-hover group" key={t.id}>
                        <TableCell className="font-medium text-sm">
                          {sourceText(ticketIssueLabel(t))}
                        </TableCell>
                        <TableCell className="text-sm">{t.name}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{t.email}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", STATUS_COLORS[t.status])}>
                            {t.status === "open"
                              ? <SourceText source="Open" />
                              : <SourceText source="Closed" />}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {t.reply_sent ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> <SourceText source="Replied" />
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {t.status === "open" && (
                              <Button size="sm" variant="outline" onClick={() => setReplyTicket(t)}>
                                <Mail className="me-1.5 h-3.5 w-3.5" />
                                <SourceText source="Reply" />
                              </Button>
                            )}
                            {(t.status as string) !== 'done' && t.status !== "closed" && (
                              <Button size="sm" variant="ghost"
                                onClick={() => setTicketConfirm({ open: true, id: t.id, action: 'close' })}>
                                <Clock className="h-3.5 w-3.5" />
                                <SourceText source="Mark as done" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                              onClick={() => setTicketConfirm({ open: true, id: t.id, action: 'delete' })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </div>
            )}
          </CardContent>
        </Card>

        <ConfirmDialog
          isOpen={ticketConfirm.open}
          onClose={() => setTicketConfirm({ open: false, id: null, action: null })}
          onConfirm={() => {
            if (ticketConfirm.action === 'close' && ticketConfirm.id !== null) closeMutation.mutate(ticketConfirm.id);
            else if (ticketConfirm.action === 'delete' && ticketConfirm.id !== null) deleteMutation.mutate(ticketConfirm.id);
            setTicketConfirm({ open: false, id: null, action: null });
          }}
          title={ticketConfirm.action === 'close' ? sourceText("Close Ticket") : sourceText("Delete Ticket")}
          description={ticketConfirm.action === 'close' ? sourceText("Close this ticket?") : sourceText("Delete this ticket?")}
          confirmLabel={ticketConfirm.action === 'close' ? sourceText("Close") : sourceText("Delete")}
          variant={ticketConfirm.action === 'delete' ? "destructive" : "default"}
          isLoading={closeMutation.isPending || deleteMutation.isPending}
        />
        {replyTicket && <ReplyDialog ticket={replyTicket} onClose={() => setReplyTicket(null)} />}
      </div>
    </AdminOnly>
  );
}
