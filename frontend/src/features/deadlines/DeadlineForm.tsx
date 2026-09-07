"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { deadlinesApi } from "@/features/deadlines/api";
import { collaborationApi } from "@/features/collaboration/api";
import { companyApi } from "@/features/companies/api";
import type { Deadline, DeadlinePayload } from "@/features/deadlines/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sourceText } from "@/lib/i18n/source-catalog";

/**
 * Create and edit forms for deadlines, as pages rather than panels.
 *
 * Both used to render at the bottom of `deadlines/page.tsx`, below the stat
 * strip and the entire queue, which is why `useRevealOnOpen` existed there: the
 * hero button changed something off-screen. As routes they cannot be
 * off-screen, they survive a refresh, and an edit URL is shareable.
 *
 * The markup is carried over field for field - this is a move, not a redesign.
 * The two forms keep their original, slightly different styling (create uses
 * the shared <Input>, edit uses raw styled inputs); unifying them is a visual
 * change and does not belong in a relocation batch. One fix in passing: the
 * create form's description placeholder held three U+FFFD replacement
 * characters where the edit form had the intended ellipsis.
 */

function defaultDueAt() {
  const d = new Date(Date.now() + 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export interface DeadlineFormState {
  title: string;
  description: string;
  due_at: string;
  priority: string;
  channel: string;
  destination: string;
  company: string;
  owner: string;
  period_type: "one_time" | "monthly" | "quarterly" | "yearly" | "custom";
  recurrence_days: string;
}

const EMPTY_FORM: DeadlineFormState = {
  title: "",
  description: "",
  due_at: defaultDueAt(),
  priority: "medium",
  channel: "Operations",
  destination: "",
  company: "",
  owner: "",
  period_type: "one_time",
  recurrence_days: "",
};

function useFormOptions() {
  const eligibleUsers = useQuery({
    queryKey: ["collaboration", "eligible-users"],
    queryFn: () => collaborationApi.users(""),
    staleTime: 60_000,
  });
  const companiesList = useQuery({
    queryKey: ["companies", "select"],
    queryFn: () => companyApi.getSelectOptions(),
    staleTime: 60_000,
  });
  return { eligibleUsers, companiesList };
}

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function DeadlineCreateForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<DeadlineFormState>(EMPTY_FORM);
  const { eligibleUsers, companiesList } = useFormOptions();

  const createMutation = useMutation({
    mutationFn: deadlinesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      toast.success("Deadline saved");
      router.push("/deadlines");
    },
    onError: () => toast.error("Unable to save deadline"),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      due_at: new Date(form.due_at).toISOString(),
      priority: form.priority || undefined,
      channel: form.channel || undefined,
      destination: form.destination || undefined,
      company: form.company || null,
      owner: form.owner || null,
      period_type: form.period_type,
      recurrence_days:
        form.period_type === "custom" && form.recurrence_days
          ? parseInt(form.recurrence_days, 10)
          : null,
    });
  };

  return (
    <section className="rounded-[28px] border border-border/80 bg-card p-6 shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
      <form onSubmit={handleCreate}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Title")}</label>
            <Input
              required
              placeholder={sourceText("Deadline title")}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Due at")}</label>
            <Input
              required
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm({ ...form, due_at: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Priority")}</label>
            <select
              className={SELECT_CLASS}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">{sourceText("Low")}</option>
              <option value="medium">{sourceText("Medium")}</option>
              <option value="high">{sourceText("High")}</option>
              <option value="critical">{sourceText("Critical")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Channel")}</label>
            <Input
              placeholder={sourceText("e.g. Operations")}
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Company (optional)")}</label>
            <select
              className={SELECT_CLASS}
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            >
              <option value="">{sourceText("None")}</option>
              {(companiesList.data ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Owner / Assignee (optional)")}</label>
            <select
              className={SELECT_CLASS}
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            >
              <option value="">{sourceText("None")}</option>
              {(eligibleUsers.data ?? []).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Period type")}</label>
            <select
              className={SELECT_CLASS}
              value={form.period_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  period_type: e.target.value as DeadlineFormState["period_type"],
                  recurrence_days: "",
                })
              }
            >
              <option value="one_time">{sourceText("One-time")}</option>
              <option value="monthly">{sourceText("Monthly")}</option>
              <option value="quarterly">{sourceText("Quarterly (3 months)")}</option>
              <option value="yearly">{sourceText("Yearly")}</option>
              <option value="custom">{sourceText("Custom period")}</option>
            </select>
          </div>
          {form.period_type === "custom" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{sourceText("Recurrence (days)")}</label>
              <Input
                type="number"
                min="1"
                placeholder={sourceText("e.g. 15")}
                value={form.recurrence_days}
                onChange={(e) =>
                  setForm({ ...form, recurrence_days: e.target.value })
                }
              />
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium">{sourceText("Description")}</label>
            <textarea
              className="min-h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
              placeholder={sourceText("Optional description")}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/deadlines">{sourceText("Cancel")}</Link>
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save deadline
          </Button>
        </div>
      </form>
    </section>
  );
}

function deadlineToForm(row: Deadline): DeadlineFormState {
  return {
    title: row.title ?? "",
    description: row.description ?? "",
    due_at: row.due_at ? row.due_at.slice(0, 16) : "",
    priority: row.priority ?? "medium",
    channel: row.channel ?? "",
    destination: row.destination ?? "",
    company: row.company ?? "",
    owner: row.owner ?? "",
    period_type: (row.period_type as DeadlineFormState["period_type"]) ?? "one_time",
    recurrence_days: row.recurrence_days ? String(row.recurrence_days) : "",
  };
}

/**
 * Fetches the deadline, then mounts the form. The old panel already had the row
 * from the list query so it never read a single deadline; a route must.
 * `deadlinesApi.retrieve` was added for this - DeadlineViewSet is a
 * ModelViewSet and already served the endpoint.
 */
export function DeadlineEditLoader({ deadlineId }: { deadlineId: string }) {
  const query = useQuery({
    queryKey: ["deadlines", "detail", deadlineId],
    queryFn: () => deadlinesApi.retrieve(deadlineId),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-destructive">
          {sourceText("This deadline could not be loaded. It may have been archived.")}
        </p>
        <Button asChild variant="outline">
          <Link href="/deadlines">{sourceText("Back to deadlines")}</Link>
        </Button>
      </div>
    );
  }

  return <DeadlineEditForm key={query.data.id} deadline={query.data} />;
}

export function DeadlineEditForm({ deadline }: { deadline: Deadline }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [editForm, setEditForm] = useState<DeadlineFormState>(() =>
    deadlineToForm(deadline),
  );
  const { eligibleUsers, companiesList } = useFormOptions();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DeadlinePayload> }) =>
      deadlinesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      toast.success("Deadline updated");
      router.push("/deadlines");
    },
    onError: () => toast.error("Unable to update deadline"),
  });

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateMutation.mutate({
      id: deadline.id,
      data: {
        title: editForm.title,
        description: editForm.description || undefined,
        due_at: editForm.due_at,
        priority: editForm.priority,
        channel: editForm.channel || undefined,
        destination: editForm.destination || undefined,
        company: editForm.company || null,
        owner: editForm.owner || null,
        period_type: editForm.period_type,
        recurrence_days: editForm.recurrence_days
          ? Number(editForm.recurrence_days)
          : null,
      },
    });
  };

  const inputClass =
    "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring";

  return (
    <section className="rounded-[28px] border border-amber-200 bg-amber-50/40 p-5 shadow-sm dark:bg-amber-900/10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <Edit className="h-4 w-4 text-amber-600" />
          {sourceText("Edit deadline")}
        </h2>
      </div>
      <form onSubmit={handleEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-sm font-medium">{sourceText("Title *")}</label>
          <input
            required
            className={inputClass}
            placeholder={sourceText("Deadline title")}
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{sourceText("Due date *")}</label>
          <input
            required
            type="datetime-local"
            className={inputClass}
            value={editForm.due_at}
            onChange={(e) => setEditForm({ ...editForm, due_at: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{sourceText("Priority")}</label>
          <select
            className={inputClass}
            value={editForm.priority}
            onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
          >
            <option value="low">{sourceText("Low")}</option>
            <option value="medium">{sourceText("Medium")}</option>
            <option value="high">{sourceText("High")}</option>
            <option value="critical">{sourceText("Critical")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{sourceText("Company (optional)")}</label>
          <select
            className={inputClass}
            value={editForm.company}
            onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
          >
            <option value="">{sourceText("All companies")}</option>
            {(companiesList.data ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{sourceText("Owner (optional)")}</label>
          <select
            className={inputClass}
            value={editForm.owner}
            onChange={(e) => setEditForm({ ...editForm, owner: e.target.value })}
          >
            <option value="">{sourceText("Unassigned")}</option>
            {(eligibleUsers.data ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{sourceText("Period type")}</label>
          <select
            className={inputClass}
            value={editForm.period_type}
            onChange={(e) =>
              setEditForm({
                ...editForm,
                period_type: e.target.value as DeadlineFormState["period_type"],
              })
            }
          >
            <option value="one_time">{sourceText("One-time")}</option>
            <option value="monthly">{sourceText("Monthly")}</option>
            <option value="quarterly">{sourceText("Quarterly (3 months)")}</option>
            <option value="yearly">{sourceText("Yearly")}</option>
            <option value="custom">{sourceText("Custom period")}</option>
          </select>
        </div>
        {editForm.period_type === "custom" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{sourceText("Recurrence (days)")}</label>
            <input
              type="number"
              min="1"
              placeholder={sourceText("e.g. 15")}
              className={inputClass}
              value={editForm.recurrence_days}
              onChange={(e) =>
                setEditForm({ ...editForm, recurrence_days: e.target.value })
              }
            />
          </div>
        )}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-sm font-medium">{sourceText("Description")}</label>
          <textarea
            className="min-h-20 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
            placeholder={sourceText("Optional description")}
            value={editForm.description}
            onChange={(e) =>
              setEditForm({ ...editForm, description: e.target.value })
            }
          />
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/deadlines">{sourceText("Cancel")}</Link>
          </Button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {updateMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}
