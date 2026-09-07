"use client";
/**
 * Clients tickets — inbound enquiries submitted by visitors from the public
 * landing page.
 *
 * WHY THIS IS SEPARATE FROM /admin/tickets
 * ----------------------------------------
 * `/admin/tickets` is HelpTicket: an internal account-recovery queue, opened by
 * people who already have a login and cannot get in. It is Administrator-only
 * because the replies hand out credentials.
 *
 * This screen is ClientTicket: commercial contact from an anonymous visitor who
 * has no account and never will. Assistants answer these as day-to-day work, so
 * the audience is Administrator AND Assistant — which is exactly `canWrite`
 * (WRITE_ROLES in hooks/useRole.ts), matching CLIENT_TICKET_ROLES on the server
 * (apps/help_tickets/views.py). A Director is read-only there and would get a
 * 403 on every control here, so the whole surface is gated rather than each
 * button: with no read access there is nothing left to show them.
 *
 * `is_read` is deliberately independent of `status`. Seeing a ticket is not the
 * same as resolving it, and solved tickets are retained rather than deleted so
 * they can be revisited later.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Phone,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/ui/page-hero";
import { SkeletonTable } from "@/components/ui/page-skeletons";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import { useRole } from "@/hooks/useRole";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ReplyChannelToggle,
  type ReplyChannel,
} from "@/components/ui/reply-channel-toggle";

type ClientTicketStatus = "new" | "in_progress" | "solved";

interface ClientTicket {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  company_label: string;
  message: string;
  status: ClientTicketStatus;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  reply_body: string;
  replied_at: string | null;
  replied_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
}

/**
 * The list endpoint is paginated (StandardResultsPagination, PAGE_SIZE 20), so
 * the payload is `{ count, next, previous, results }`. `apiClient.get` already
 * unwraps `response.data`, so reaching for `.data` here would silently yield
 * undefined and render an empty queue forever — the exact bug present in the
 * neighbouring help-tickets screen. Kept tolerant of a bare array in case
 * pagination is ever turned off for this route.
 */
function unwrapList(payload: unknown): ClientTicket[] {
  if (Array.isArray(payload)) return payload as ClientTicket[];
  const results = (payload as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? (results as ClientTicket[]) : [];
}

const STATUS_STYLES: Record<ClientTicketStatus, string> = {
  new: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  in_progress:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  solved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function StatusBadge({ status }: { status: ClientTicketStatus }) {
  return (
    <Badge className={cn("border-0 font-medium", STATUS_STYLES[status])}>
      {status === "new" ? <SourceText source="New" /> : null}
      {status === "in_progress" ? <SourceText source="In progress" /> : null}
      {status === "solved" ? <SourceText source="Solved" /> : null}
    </Badge>
  );
}

/** Absent values render as an em dash rather than an empty cell. */
function formatMoment(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function TicketDialog({
  ticket,
  onClose,
}: {
  ticket: ClientTicket;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(ticket.reply_body ?? "");
  const [failed, setFailed] = useState(false);
  const [channel, setChannel] = useState<ReplyChannel>("email");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["client-tickets"] });

  const reply = useMutation({
    mutationFn: (markSolved: boolean) =>
      apiClient.post(`/help/client-tickets/${ticket.id}/reply/`, {
        reply_body: body,
        mark_solved: markSolved,
        channel,
      }),
    onMutate: () => setFailed(false),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setFailed(true),
  });

  const busy = reply.isPending;
  const canSend = body.trim().length > 0 && !busy;

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent
        className="inset-x-0 top-[7vh] mx-auto flex max-h-[85vh] w-full max-w-2xl translate-x-0 translate-y-0 flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" aria-hidden="true" />
            <SourceText source="Client enquiry" />
            <span className="text-muted-foreground">#{ticket.id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pe-1">
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">{ticket.name}</p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                {ticket.email}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {ticket.phone}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                {ticket.company_label}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatMoment(ticket.created_at)}
            </p>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              <SourceText source="Message from the client" />
            </Label>
            <p className="mt-1 whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm">
              {ticket.message}
            </p>
          </div>

          {ticket.replied_at ? (
            <p className="text-xs text-muted-foreground">
              <SourceText source="Last replied" /> {formatMoment(ticket.replied_at)}
              {ticket.replied_by_name ? ` · ${ticket.replied_by_name}` : ""}
            </p>
          ) : null}

          <div>
            <Label htmlFor="client-ticket-reply">
              <SourceText source="Your reply" />
            </Label>
            <ReplyChannelToggle
              className="mt-2"
              value={channel}
              onChange={setChannel}
            />
            <Textarea
              id="client-ticket-reply"
              className="mt-1 min-h-[140px]"
              value={body}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setBody(event.target.value)
              }
              placeholder={sourceText("Write the response the client will receive")}
            />
          </div>

          {failed ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <SourceText source="The reply could not be saved. Please try again." />
            </p>
          ) : null}

        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
              <SourceText source="Close" />
            </Button>
            <Button
              variant="outline"
              onClick={() => reply.mutate(false)}
              disabled={!canSend}
            >
              {busy ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="me-2 h-4 w-4" aria-hidden="true" />
              )}
              <SourceText source="Save reply" />
            </Button>
            {ticket.status !== "solved" && (
              <Button onClick={() => reply.mutate(true)} disabled={!canSend}>
                <CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />
                <SourceText source="Reply and mark solved" />
              </Button>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FILTERS: Array<{ value: "" | ClientTicketStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "solved", label: "Solved" },
];

export default function ClientTicketsPage() {
  const queryClient = useQueryClient();
  // Administrator and Assistant, matching CLIENT_TICKET_ROLES on the server.
  // Named rather than a bare predicate so the intent survives refactors.
  const canManageClientTickets = useRole().canWrite;
  const [statusFilter, setStatusFilter] = useState<"" | ClientTicketStatus>("");
  const [search, setSearch] = useState("");
  const [openTicket, setOpenTicket] = useState<ClientTicket | null>(null);

  const {
    data: tickets = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<ClientTicket[]>({
    queryKey: ["client-tickets", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/help/client-tickets/list/?status=${statusFilter}`
        : "/help/client-tickets/list/";
      return unwrapList(await apiClient.get(url));
    },
    enabled: canManageClientTickets,
  });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      apiClient.patch(`/help/client-tickets/${id}/`, { is_read: true }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] }),
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tickets;
    return tickets.filter((ticket) =>
      [ticket.name, ticket.email, ticket.phone, ticket.company_label, ticket.message]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [tickets, search]);

  const counts = useMemo(
    () => ({
      unread: tickets.filter((ticket) => !ticket.is_read).length,
      open: tickets.filter((ticket) => ticket.status !== "solved").length,
      solved: tickets.filter((ticket) => ticket.status === "solved").length,
    }),
    [tickets],
  );

  // A Director has no read access server-side, so there is no partial view to
  // offer. Say so plainly instead of rendering an empty queue that looks broken.
  if (!canManageClientTickets) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-lg font-semibold">
              <SourceText source="This section is not available for your role" />
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              <SourceText source="Client enquiries are handled by administrators and assistants." />
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHero
        icon={Inbox}
        eyebrow={sourceText("Client relations")}
        title={sourceText("Clients tickets")}
        description={sourceText(
          "Enquiries sent by visitors from the public website. Reply, resolve, and keep the history.",
        )}
        action={
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            title={sourceText("Refresh")}
          >
            <RefreshCw
              className={cn("me-2 h-4 w-4", isFetching && "animate-spin")}
              aria-hidden="true"
            />
            <SourceText source="Refresh" />
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Mail}
          label={sourceText("Unread")}
          value={counts.unread}
          tone="orange"
          loading={isLoading}
        />
        <StatCard
          icon={Clock}
          label={sourceText("Awaiting resolution")}
          value={counts.open}
          tone="blue"
          loading={isLoading}
        />
        <StatCard
          icon={CheckCircle2}
          label={sourceText("Solved")}
          value={counts.solved}
          tone="green"
          loading={isLoading}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <Button
                  key={filter.value || "all"}
                  size="sm"
                  variant={statusFilter === filter.value ? "primary" : "outline"}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  <SourceText source={filter.label} />
                </Button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="ps-9"
                value={search}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                placeholder={sourceText("Search name, email, company")}
                aria-label={sourceText("Search client tickets")}
              />
            </div>
          </div>

          {isLoading ? (
            <SkeletonTable />
          ) : isError ? (
            <p
              role="alert"
              className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 p-8 text-sm text-destructive"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <SourceText source="Client tickets could not be loaded." />
            </p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                <SourceText source="No client enquiries to show yet." />
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SourceText source="Client" />
                    </TableHead>
                    <TableHead>
                      <SourceText source="Company" />
                    </TableHead>
                    <TableHead>
                      <SourceText source="Received" />
                    </TableHead>
                    <TableHead>
                      <SourceText source="Status" />
                    </TableHead>
                    <TableHead className="text-end">
                      <SourceText source="Actions" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className={cn(!ticket.is_read && "font-medium")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!ticket.is_read ? (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-primary"
                              aria-label={sourceText("Unread")}
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate">{ticket.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {ticket.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ticket.company_label}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatMoment(ticket.created_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={ticket.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {!ticket.is_read ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markRead.mutate(ticket.id)}
                              disabled={markRead.isPending}
                              title={sourceText("Mark as read")}
                            >
                              <MailOpen className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">
                                <SourceText source="Mark as read" />
                              </span>
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenTicket(ticket)}
                          >
                            <SourceText source="Open" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {openTicket ? (
        <TicketDialog
          ticket={openTicket}
          onClose={() => setOpenTicket(null)}
        />
      ) : null}
    </div>
  );
}
