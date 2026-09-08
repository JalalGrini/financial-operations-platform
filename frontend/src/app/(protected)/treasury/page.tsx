"use client";
import { sourceText } from "@/lib/i18n/source-catalog";
import { TagAction } from "@/components/collaboration/TagAction";
/**
 * Treasury hub — accounts (company balances), transactions, transfers and
 * reconciliations (Cycle 29, M3). Covers the "Company budget/balance" need:
 * each account carries opening/current balance per company.
 *
 * Backend: /api/v1/treasury/<accounts|transactions|transfers|reconciliations>/
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";

import { SourceText } from "@/components/i18n/SourceText";
import {
  Plus,
  Loader2,
  Eye,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  Landmark,
  ReceiptText,
  Scale,
  WalletCards,
  RefreshCw
} from "lucide-react";
import { PageHeader, Breadcrumb } from "@/components/ui/page-components";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard, STAT_CARDS_GRID } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  SearchInput,
  ConfirmDialog,
} from "@/features/personnel/components/common";
import { WriteOnly } from "@/components/auth/WriteOnly";
import {
  EntitySection,
  type FieldDef,
} from "@/features/configuration/components/EntitySection";
import { treasuryApi } from "@/features/treasury/api";
import { configurationApi } from "@/features/configuration/api";
import { useCompanies } from "@/features/personnel/hooks";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveRoles } from "@/lib/navigation";
import { ScheduleDate } from "@/components/ui/schedule-date";
import { SkeletonTable, SkeletonHero, SkeletonStatsStrip } from "@/components/ui/page-skeletons";
import type {
  Reconciliation,
  TransactionDirection,
  TreasuryAccount,
  TreasuryTransaction,
} from "@/features/treasury/types";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

const KIND_OPTIONS = [
  {
    value: "bank",
    get label() {
      return sourceText("Bank account");
    },
  },
  {
    value: "cash",
    get label() {
      return sourceText("Cash box");
    },
  },
  {
    value: "wallet",
    get label() {
      return sourceText("Mobile wallet");
    },
  },
  {
    value: "other",
    get label() {
      return sourceText("Other");
    },
  },
];
const DIRECTION_OPTIONS = [
  {
    value: "inbound",
    get label() {
      return sourceText("Inbound (money in)");
    },
  },
  {
    value: "outbound",
    get label() {
      return sourceText("Outbound (money out)");
    },
  },
];
const TXN_STATUS_OPTIONS = [
  {
    value: "",
    get label() {
      return sourceText("All Status");
    },
  },
  {
    value: "draft",
    get label() {
      return sourceText("Draft");
    },
  },
  {
    value: "posted",
    get label() {
      return sourceText("Posted");
    },
  },
  {
    value: "cancelled",
    get label() {
      return sourceText("Cancelled");
    },
  },
];
function fmtMoney(
  value: string | number | null | undefined,
  currency = "MAD",
): string {
  if (value === null || value === undefined || value === "") {
    return sourceText("—");
  }
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return sourceText("—");
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDateFr(value?: string | null): string {
  if (!value) return sourceText("—");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(localeTag(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const accountKindLabels: Record<string, string> = {
  bank: sourceText("Bank account"),
  cash: sourceText("Cash box"),
  wallet: sourceText("Mobile wallet"),
  other: sourceText("Other"),
};

const treasuryStatusLabels: Record<string, string> = {
  draft: sourceText("Draft"),
  posted: sourceText("Posted"),
  cancelled: sourceText("Cancelled"),
  open: sourceText("Open"),
  completed: sourceText("Completed"),
};
function useAccountOptions() {
  const { data } = useQuery({
    queryKey: ["treasury:accounts", "options"],
    queryFn: () =>
      treasuryApi.accounts.list({ page_size: 200, is_archived: false }),
    staleTime: 1000 * 60 * 2,
  });
  return (data?.results || []).map((a) => ({
    value: a.id,
    label: `${a.name}${a.company_name ? ` — ${a.company_name}` : ""} (${fmtMoney(a.current_balance, a.currency)})`,
  }));
}
function useTransactionTypeOptions() {
  const { data } = useQuery({
    queryKey: ["configuration:transaction-types", "options"],
    queryFn: () =>
      configurationApi["transaction-types"].list({
        page_size: 200,
        is_archived: false,
      }),
    staleTime: 1000 * 60 * 10,
  });
  return (data?.results || []).map((t) => ({ value: t.id, label: t.name }));
}


// ---------- Per-company balance summary ----------
/** Total money position per company, grouped per currency — never collapsed. */
function CompanyBalanceSummary() {
  const { data } = useQuery({
    queryKey: ["treasury:accounts", "summary"],
    queryFn: () =>
      treasuryApi.accounts.list({ page_size: 200, is_archived: false }),
    staleTime: 1000 * 60,
  });
  const byCompany = new Map<
    string,
    {
      name: string;
      totals: Record<string, number>;
    }
  >();
  for (const a of data?.results || []) {
    const entry = byCompany.get(a.company) || {
      name: a.company_name || sourceText("Unknown company"),
      totals: {},
    };
    const cur = a.currency || "MAD";
    const bal =
      typeof a.current_balance === "string"
        ? parseFloat(a.current_balance)
        : a.current_balance;
    entry.totals[cur] =
      (entry.totals[cur] || 0) + (Number.isNaN(bal) ? 0 : bal);
    byCompany.set(a.company, entry);
  }
  if (byCompany.size === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...byCompany.values()].map((c) => (
        <Card key={c.name}>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {c.name}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(c.totals).map(([cur, total]) => (
                <span
                  key={cur}
                  className={`text-lg font-bold tabular-nums ${total < 0 ? "text-red-600" : ""}`}
                >
                  {fmtMoney(total, cur)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
// ---------- Accounts (via generic EntitySection) ----------
function AccountsSection() {
  const { data: companies } = useCompanies();
  const companyOptions = (companies || []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const fields: FieldDef[] = [
    {
      name: "company",
      get label() {
        return sourceText("Company");
      },
      type: "select",
      options: companyOptions,
      required: true,
    },
    {
      name: "name",
      get label() {
        return sourceText("Account name");
      },
      type: "text",
      required: true,
      placeholder: sourceText("e.g., Main bank account"),
    },
    {
      name: "kind",
      get label() {
        return sourceText("Kind");
      },
      type: "select",
      options: KIND_OPTIONS,
      required: true,
    },
    {
      name: "currency",
      get label() {
        return sourceText("Currency");
      },
      type: "text",
      placeholder: sourceText("MAD"),
    },
    {
      name: "bank_name",
      get label() {
        return sourceText("Bank name");
      },
      type: "text",
    },
    {
      name: "account_number",
      get label() {
        return sourceText("Account number");
      },
      type: "text",
    },
    {
      name: "iban",
      get label() {
        return sourceText("IBAN");
      },
      type: "text",
    },
    {
      name: "swift",
      get label() {
        return sourceText("SWIFT");
      },
      type: "text",
    },
    {
      name: "opening_balance",
      get label() {
        return sourceText("Opening balance");
      },
      type: "number",
      step: "0.01",
      help: sourceText(
        "Seeded once at creation; the service layer moves balances afterwards.",
      ),
    },
    {
      name: "notes",
      get label() {
        return sourceText("Notes");
      },
      type: "textarea",
    },
  ];
  return (
    <EntitySection<TreasuryAccount>
      queryKey="treasury:accounts"
      crud={treasuryApi.accounts}
      title={sourceText("Account")}
      description={sourceText(
        "Bank accounts, cash boxes and wallets per company, with live balances.",
      )}
      columns={[
        {
          key: "reference",
          header: sourceText("Reference"),
          className: "w-28",
          render: (v) => <span className="font-mono text-xs">{String(v)}</span>,
        },
        { key: "name", header: sourceText("Account") },
        {
          key: "company_name",
          header: sourceText("Company"),
          className: "w-36",
        },
        {
          key: "kind",
          header: sourceText("Kind"),
          className: "w-24",
          render: (v) => (
            <Badge variant="outline">
              {accountKindLabels[String(v)] || String(v)}
            </Badge>
          ),
        },
        {
          key: "current_balance",
          header: sourceText("Balance"),
          className: "w-36 text-end",
          render: (_v, row) => (
            <span className="font-mono font-medium">
              {fmtMoney(
                (row as TreasuryAccount).current_balance,
                (row as TreasuryAccount).currency,
              )}
            </span>
          ),
        },
        {
          key: "is_active",
          header: sourceText("Active"),
          className: "w-20",
          render: (v) => (
            <Badge variant={v ? "default" : "outline"}>
              {v ? sourceText("Yes") : sourceText("No")}
            </Badge>
          ),
        },
      ]}
      fields={fields}
      createDefaults={{ kind: "bank", currency: "MAD" }}
      getEditValues={(a) => ({
        company: a.company,
        name: a.name,
        kind: a.kind,
        currency: a.currency || "MAD",
        bank_name: a.bank_name || "",
        account_number: a.account_number || "",
        iban: a.iban || "",
        swift: a.swift || "",
        notes: a.notes || "",
      })}
    />
  );
}
// ---------- Transactions (custom action-driven section) ----------
function TransactionsSection() {
  const queryClient = useQueryClient();
  const accountOptions = useAccountOptions();
  const transactionTypeOptions = useTransactionTypeOptions();
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TreasuryTransaction | null>(
    null,
  );
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const params = useMemo(
    () => ({
      page,
      page_size: 25,
      search: search || undefined,
      account: accountFilter || undefined,
      status: statusFilter || undefined,
    }),
    [page, search, accountFilter, statusFilter],
  );
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["treasury:transactions", "list", params],
    queryFn: () => treasuryApi.transactions.list(params),
    placeholderData: (prev) => prev,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["treasury:transactions"] });
    queryClient.invalidateQueries({ queryKey: ["treasury:accounts"] });
  };
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      treasuryApi.transactions.create(payload),
    onSuccess: () => {
      invalidate();
    },
  });
  const postMutation = useMutation({
    mutationFn: (id: string) => treasuryApi.transactions.post(id),
    onSuccess: () => {
      invalidate();
      toast.success(sourceText("Transaction posted to ledger"));
    },
    onError: (e: any) => toast.error(e?.message || sourceText("Post failed")),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      treasuryApi.transactions.cancel(id, reason),
    onSuccess: () => {
      invalidate();
      toast.success(sourceText("Transaction cancelled"));
      setCancelTarget(null);
      setCancelReason("");
    },
    onError: (e: any) => {
      const message = e?.message || sourceText("Cancel failed");
      setCancelError(message);
      toast.error(message);
    },
  });
  const openCreate = () => {
    setForm({
      direction: "inbound",
      transaction_date: todayInputValue(),
    });
    setFormError(null);
    setDialogOpen(true);
  };
  const setField = (name: string, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }));
  const handleSubmit = async () => {
    setFormError(null);
    if (!form.account) return setFormError(sourceText("Account is required."));
    if (!form.transaction_type)
      return setFormError(sourceText("Transaction type is required."));
    const amount = parseFloat(form.amount || "");
    if (!form.amount || Number.isNaN(amount) || amount <= 0)
      return setFormError(
        sourceText("Enter a valid amount greater than zero."),
      );
    if (!form.transaction_date)
      return setFormError(sourceText("Transaction date is required."));
    if (!form.description)
      return setFormError(sourceText("Description is required."));
    try {
      await createMutation.mutateAsync({
        account: form.account,
        transaction_type: form.transaction_type,
        direction: form.direction,
        amount,
        transaction_date: form.transaction_date,
        description: form.description,
        external_reference: form.external_reference || undefined,
        notes: form.notes || undefined,
      });
      toast.success(
        sourceText(
          "Transaction recorded as draft \u2014 post it to move the balance.",
        ),
      );
      setDialogOpen(false);
      refetch();
    } catch (error: any) {
      const detail = error?.message || sourceText("Save failed");
      setFormError(detail);
      toast.error(detail);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            <SourceText source="Transactions" />
          </h2>
          <p className="text-sm text-muted-foreground">
            <SourceText
              source="Money movements per account. Drafts move nothing until posted."
              leading
              trailing
            />
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={sourceText("Search reference, description…")}
          />
          <Select
            value={accountFilter || "all"}
            onValueChange={(v) => {
              setAccountFilter(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={sourceText("All accounts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <SourceText source="All accounts" />
              </SelectItem>
              {accountOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) => {
              setStatusFilter(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder={sourceText("All status")} />
            </SelectTrigger>
            <SelectContent>
              {TXN_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value || "all"}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <WriteOnly>
            <Button size="sm" onClick={openCreate}>
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="New Transaction" leading trailing />
            </Button>
          </WriteOnly>
        </div>
      </div>

      {dialogOpen && (
        <Card className="border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>
                <SourceText source="New Transaction" />
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Create the transaction on the page, then post it when you are ready."
                  leading
                  trailing
                />
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {formError}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Account *" />
                </Label>
                <Select
                  value={form.account || ""}
                  onValueChange={(v) => setField("account", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select account")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Transaction type *" />
                </Label>
                <Select
                  value={form.transaction_type || ""}
                  onValueChange={(v) => setField("transaction_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {transactionTypeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Direction *" />
                </Label>
                <Select
                  value={form.direction || "inbound"}
                  onValueChange={(v) =>
                    setField("direction", v as TransactionDirection)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Amount" leading trailing />*
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.amount || ""}
                  onChange={(e) => setField("amount", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Date *" />
                </Label>
                <ScheduleDate
                  value={form.transaction_date || "" || ""}
                  onChange={(val: string) => setField("transaction_date", String(val))}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                <Label>
                  <SourceText source="Description *" />
                </Label>
                <Input
                  value={form.description || ""}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder={sourceText("e.g., Client invoice payment")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="External reference" />
                </Label>
                <Input
                  value={form.external_reference || ""}
                  onChange={(e) =>
                    setField("external_reference", e.target.value)
                  }
                  placeholder={sourceText("Cheque / wire / receipt number")}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
                <Label>
                  <SourceText source="Notes" />
                </Label>
                <Input
                  value={form.notes || ""}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                <SourceText source="Cancel" leading trailing />
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Save draft" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cancelTarget && (
        <Card className="border-amber-200 shadow-[0_16px_38px_rgba(15,23,42,.08)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>
                <SourceText source="Cancel transaction" leading trailing />
                {cancelTarget.reference}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="A posted movement is reversed and the complete history remains. An audit reason is required."
                  leading
                  trailing
                />
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            {cancelError && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {cancelError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>
                <SourceText source="Cancellation reason *" />
              </Label>
              <textarea
                rows={4}
                maxLength={500}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder={sourceText("e.g., Duplicate bank entry")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCancelTarget(null)}
                disabled={cancelMutation.isPending}
              >
                <SourceText source="Keep transaction" leading trailing />
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setCancelError(null);
                  if (!cancelReason.trim()) {
                    setCancelError(
                      sourceText("A cancellation reason is required."),
                    );
                    return;
                  }
                  cancelMutation.mutate({
                    id: cancelTarget.id,
                    reason: cancelReason.trim(),
                  });
                }}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Cancel transaction" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-border/60">
        <div className="overflow-x-auto"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sourceText("Reference")}</TableHead>
              <TableHead className="hidden md:table-cell">{sourceText("Account")}</TableHead>
              <TableHead>{sourceText("Type")}</TableHead>
              <TableHead className="hidden lg:table-cell">{sourceText("Date")}</TableHead>
              <TableHead className="text-end">{sourceText("Amount")}</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.results || []).map((row) => (
              <TableRow className="row-hover" key={row.id}>
                <TableCell><span className="font-mono text-xs font-semibold text-primary">{row.reference}</span></TableCell>
                {/* A treasury movement hangs off an account, not a company: the
                    Transaction serializer returns `account_name` and
                    `transaction_date`, never company_name/type_name/date. */}
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.account_name || sourceText("—")}</TableCell>
                <TableCell><Badge variant="outline">{row.transaction_type_name || sourceText("—")}</Badge></TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatDateFr(row.transaction_date)}</TableCell>
                <TableCell className="text-end"><Amount value={row.amount} currency={row.currency || "MAD"} size="sm" /></TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <TagAction resourceType="treasury.transaction" targetId={row.id} compact />
                                  
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div>
      </div>
      {data && data.count > 25 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil((data?.count || 0) / 25)}
          totalCount={data?.count || 0}
          pageSize={25}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
// ---------- Transfers ----------
function TransfersSection() {
  const queryClient = useQueryClient();
  const accountOptions = useAccountOptions();
  const transactionTypeOptions = useTransactionTypeOptions();
  const [form, setForm] = useState<Record<string, string>>({
    transaction_date: todayInputValue(),
  });
  const [post, setPost] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const transferMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      treasuryApi.transfers.create(payload as unknown as import("@/features/treasury/types").TransferInput),
    onSuccess: () => {
      toast.success(
        sourceText(
          "Transfer recorded \u2014 both account movements appear in Transactions.",
        ),
      );
      setForm({ transaction_date: todayInputValue() });
      setPost(true);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["treasury:transactions"] });
      queryClient.invalidateQueries({ queryKey: ["treasury:accounts"] });
    },
    onError: (e: any) => {
      const detail = e?.message || sourceText("Transfer failed");
      setFormError(detail);
      toast.error(detail);
    },
  });
  const setField = (name: string, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }));
  const handleSubmit = () => {
    setFormError(null);
    if (!form.source_account)
      return setFormError(sourceText("Source account is required."));
    if (!form.destination_account)
      return setFormError(sourceText("Destination account is required."));
    if (form.source_account === form.destination_account)
      return setFormError(sourceText("Source and destination must differ."));
    const amount = parseFloat(form.amount || "");
    if (!form.amount || Number.isNaN(amount) || amount <= 0)
      return setFormError(
        sourceText("Enter a valid amount greater than zero."),
      );
    if (!form.transaction_date)
      return setFormError(sourceText("Date is required."));
    if (!form.description)
      return setFormError(sourceText("Description is required."));
    if (!form.transaction_type)
      return setFormError(sourceText("Transaction type is required."));
    transferMutation.mutate({
      source_account: form.source_account,
      destination_account: form.destination_account,
      amount,
      transaction_date: form.transaction_date,
      description: form.description,
      transaction_type: form.transaction_type,
      post,
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          <SourceText source="New Transfer" leading trailing />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <p className="text-sm text-muted-foreground">
          <SourceText
            source="Move money between two accounts — including between accounts of DIFFERENT companies (inter-company movement). The backend creates both legs atomically — one debit, one credit, mirrored — so one company can never be updated while the other company’s side fails."
            leading
            trailing
          />
        </p>
        {formError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {formError}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>
              <SourceText source="From account *" />
            </Label>
            <Select
              value={form.source_account || ""}
              onValueChange={(v) => setField("source_account", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={sourceText("Source")} />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              <SourceText source="To account *" />
            </Label>
            <Select
              value={form.destination_account || ""}
              onValueChange={(v) => setField("destination_account", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={sourceText("Destination")} />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              <SourceText source="Amount" leading trailing />*
            </Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={form.amount || ""}
              onChange={(e) => setField("amount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              <SourceText source="Date *" />
            </Label>
            <ScheduleDate
              value={form.transaction_date || "" || ""}
              onChange={(val: string) => setField("transaction_date", String(val))}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Description *" />
          </Label>
          <Input
            value={form.description || ""}
            onChange={(e) => setField("description", e.target.value)}
            placeholder={sourceText("e.g., Cash deposit to bank")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            <SourceText source="Transaction type *" />
          </Label>
          <Select
            value={form.transaction_type || ""}
            onValueChange={(v) => setField("transaction_type", v)}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={sourceText(
                  "Select type (e.g., Internal Transfer)",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {transactionTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={post}
            onChange={(e) => setPost(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <SourceText
            source="Post immediately (move balances now). Unchecked saves both legs as drafts."
            leading
            trailing
          />
        </label>
        <div className="pt-2">
          <WriteOnly>
            <Button onClick={handleSubmit} disabled={transferMutation.isPending}>
              {transferMutation.isPending && (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              )}
              <SourceText source="Record Transfer" leading trailing />
            </Button>
          </WriteOnly>
        </div>
      </CardContent>
    </Card>
  );
}
// ---------- Reconciliations ----------
function ReconciliationsSection() {
  const queryClient = useQueryClient();
  const accountOptions = useAccountOptions();
  const [page, setPage] = useState(1);
  const [accountFilter, setAccountFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const params = useMemo(
    () => ({ page, page_size: 25, account: accountFilter || undefined }),
    [page, accountFilter],
  );
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["treasury:reconciliations", "list", params],
    queryFn: () => treasuryApi.reconciliations.list(params),
    placeholderData: (prev) => prev,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["treasury:reconciliations"] });
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      treasuryApi.reconciliations.create(payload),
    onSuccess: () => {
      invalidate();
    },
  });
  const completeMutation = useMutation({
    mutationFn: (id: string) => treasuryApi.reconciliations.complete(id),
    onSuccess: () => {
      invalidate();
      toast.success(sourceText("Reconciliation completed"));
    },
    onError: (e: any) =>
      toast.error(e?.message || sourceText("Complete failed")),
  });
  const reopenMutation = useMutation({
    mutationFn: (id: string) => treasuryApi.reconciliations.reopen(id),
    onSuccess: () => {
      invalidate();
      toast.success(sourceText("Reconciliation reopened"));
    },
    onError: (e: any) => toast.error(e?.message || sourceText("Reopen failed")),
  });
  const openCreate = () => {
    setForm({});
    setFormError(null);
    setDialogOpen(true);
  };
  const setField = (name: string, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }));
  const handleSubmit = async () => {
    setFormError(null);
    if (!form.account) return setFormError(sourceText("Account is required."));
    if (!form.period_start)
      return setFormError(sourceText("Period start is required."));
    if (!form.period_end)
      return setFormError(sourceText("Period end is required."));
    if (form.period_end < form.period_start)
      return setFormError(
        sourceText("Period end cannot precede period start."),
      );
    const balance = parseFloat(form.statement_balance || "");
    if (!form.statement_balance || Number.isNaN(balance))
      return setFormError(sourceText("Enter the statement closing balance."));
    try {
      await createMutation.mutateAsync({
        account: form.account,
        period_start: form.period_start,
        period_end: form.period_end,
        statement_balance: balance,
        notes: form.notes || undefined,
      });
      toast.success(sourceText("Reconciliation period opened"));
      setDialogOpen(false);
      refetch();
    } catch (error: any) {
      const detail = error?.message || sourceText("Save failed");
      setFormError(detail);
      toast.error(detail);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            <SourceText source="Reconciliations" />
          </h2>
          <p className="text-sm text-muted-foreground">
            <SourceText
              source="Compare account balances against bank statements for a period."
              leading
              trailing
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={accountFilter || "all"}
            onValueChange={(v) => {
              setAccountFilter(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder={sourceText("All accounts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <SourceText source="All accounts" />
              </SelectItem>
              {accountOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <WriteOnly>
            <Button size="sm" onClick={openCreate}>
              <Plus className="me-2 h-4 w-4" />
              <SourceText source="New Reconciliation" leading trailing />
            </Button>
          </WriteOnly>
        </div>
      </div>

      {dialogOpen && (
        <Card className="border-primary/20 shadow-[0_16px_38px_rgba(15,23,42,.08)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>
                <SourceText source="New Reconciliation" />
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                <SourceText
                  source="Open the reconciliation period directly on the page."
                  leading
                  trailing
                />
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              <SourceText source="Close" leading trailing />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {formError}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5 xl:col-span-2">
                <Label>
                  <SourceText source="Account *" />
                </Label>
                <Select
                  value={form.account || ""}
                  onValueChange={(v) => setField("account", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={sourceText("Select account")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Period start *" />
                </Label>
                <ScheduleDate
                  value={form.period_start || "" || ""}
                  onChange={(val: string) => setField("period_start", String(val))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  <SourceText source="Period end *" />
                </Label>
                <ScheduleDate
                  value={form.period_end || "" || ""}
                  onChange={(val: string) => setField("period_end", String(val))}
                />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>
                  <SourceText
                    source="Statement closing balance"
                    leading
                    trailing
                  />
                  *
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={form.statement_balance || ""}
                  onChange={(e) =>
                    setField("statement_balance", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>
                  <SourceText source="Notes" />
                </Label>
                <Input
                  value={form.notes || ""}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                <SourceText source="Cancel" leading trailing />
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                )}
                <SourceText source="Open period" leading trailing />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-border/60">
        <div className="overflow-x-auto"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sourceText("Reference")}</TableHead>
              <TableHead className="hidden md:table-cell">{sourceText("Account")}</TableHead>
              <TableHead>{sourceText("Status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{sourceText("Period")}</TableHead>
              <TableHead className="text-end">{sourceText("Statement Balance")}</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Reconciliation rows, not transactions: this table was a verbatim
                copy of the one in TransactionsSection, so it read company_name/
                type_name/date/amount/currency - none of which exist on a
                Reconciliation. A reconciliation is a period over one account
                with a statement balance. */}
            {(data?.results || []).map((row) => (
              <TableRow className="row-hover" key={row.id}>
                <TableCell><span className="font-mono text-xs font-semibold text-primary">{row.reference}</span></TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{row.account_name || sourceText("—")}</TableCell>
                <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {formatDateFr(row.period_start)} — {formatDateFr(row.period_end)}
                </TableCell>
                <TableCell className="text-end tabular-nums">{fmtMoney(row.statement_balance)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div>
      </div>
      {data && data.count > 25 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil((data?.count || 0) / 25)}
          totalCount={data?.count || 0}
          pageSize={25}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
// ---------- Administrator diagnostics ----------
function TreasuryDiagnostics() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["treasury:accounts", "balance-drift"],
    queryFn: () => treasuryApi.accounts.balanceDrift(),
  });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>
            <SourceText source="Ledger balance diagnostics" />
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            <SourceText
              source="Stored balances are recomputed from opening balances and posted ledger movements."
              leading
              trailing
            />
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <SourceText source="Refresh" leading trailing />
        </Button>
      </CardHeader>
      <CardContent className="mt-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isError ? (
          <p className="text-sm text-red-700">
            <SourceText
              source="Diagnostics could not be loaded."
              leading
              trailing
            />
          </p>
        ) : (data || []).length === 0 ? (
          <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <SourceText source="No balance drift detected." leading trailing />
          </p>
        ) : (
          <div className="space-y-2">
            {(data || []).map((row) => (
              <div
                key={row.account.id}
                className="rounded border border-red-200 bg-red-50 p-3 text-sm"
              >
                <p className="font-medium">
                  {row.account.name} — {row.account.company_name}
                </p>
                <p>
                  <SourceText source="Stored:" leading trailing />
                  {fmtMoney(row.stored_balance, row.account.currency)}
                  <SourceText source="· Ledger:" leading trailing />
                  {fmtMoney(row.ledger_balance, row.account.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
// ---------- Page ----------
export default function TreasuryPage() {
  const { user } = useAuth();
  const isAdministrator = getEffectiveRoles(user).includes("Administrator");
  const accountsSummaryQuery = useQuery({
    queryKey: ["treasury:accounts", "summary-count"],
    queryFn: () =>
      treasuryApi.accounts.list({ page_size: 1, is_archived: false }),
    staleTime: 1000 * 60 * 2,
  });
  const transactionsSummaryQuery = useQuery({
    queryKey: ["treasury:transactions", "summary-count"],
    queryFn: () =>
      treasuryApi.transactions.list({ page_size: 1, is_archived: false }),
    staleTime: 1000 * 60 * 2,
  });
  const reconciliationsSummaryQuery = useQuery({
    queryKey: ["treasury:reconciliations", "summary-count"],
    queryFn: () => treasuryApi.reconciliations.list({ page_size: 1 }),
    staleTime: 1000 * 60 * 2,
  });
  const diagnosticsSummaryQuery = useQuery({
    queryKey: ["treasury:accounts", "balance-drift-summary"],
    queryFn: () => treasuryApi.accounts.balanceDrift(),
    enabled: isAdministrator,
    staleTime: 1000 * 60 * 2,
  });
  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Treasury");
            },
            isCurrent: true,
          },
        ]}
      />
      <PageHero
        icon={Landmark}
        eyebrow="Financial operations hub"
        title={sourceText("Treasury")}
        description={sourceText("Company accounts and balances, money movements, inter-account transfers and bank reconciliations — all in one place.")}
      />

      <section className="space-y-4">
        <div className={STAT_CARDS_GRID}>
          <StatCard icon={WalletCards} label={sourceText("Accounts")} value={accountsSummaryQuery.data?.count ?? 0} tone="primary" />
          <StatCard icon={ReceiptText} label={sourceText("Transactions")} value={transactionsSummaryQuery.data?.count ?? 0} tone="indigo" />
          <StatCard icon={Landmark} label={sourceText("Reconciliations")} value={reconciliationsSummaryQuery.data?.count ?? 0} tone="emerald" />
          <StatCard icon={Scale} label={sourceText("Drift alerts")} value={diagnosticsSummaryQuery.data?.length ?? 0} tone="rose" />
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {sourceText("Treasury guidance")}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            {sourceText("Keep balances, postings and reconciliations aligned")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {sourceText(
              "Treasury should explain where money sits, how it moved and whether the ledger still matches reality.",
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>
              {sourceText(
                "Open transactions on the page first, then post only when the supporting details are correct.",
              )}
            </li>
            <li>
              {sourceText(
                "Use transfers for internal movements so both sides stay connected.",
              )}
            </li>
            <li>
              {sourceText(
                "Review diagnostics regularly to catch balance drift before month-end.",
              )}
            </li>
          </ul>
        </div>
      </section>

      <Tabs defaultValue="accounts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="accounts">
            <SourceText source="Accounts & Balances" />
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <SourceText source="Transactions" />
          </TabsTrigger>
          <TabsTrigger value="transfers">
            <SourceText source="Transfers" />
          </TabsTrigger>
          <TabsTrigger value="reconciliations">
            <SourceText source="Reconciliations" />
          </TabsTrigger>
          {isAdministrator && (
            <TabsTrigger value="diagnostics">
              <SourceText source="Diagnostics" />
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="accounts" className="pt-4 space-y-4">
          <CompanyBalanceSummary />
          <AccountsSection />
        </TabsContent>
        <TabsContent value="transactions" className="pt-4">
          <TransactionsSection />
        </TabsContent>
        <TabsContent value="transfers" className="pt-4">
          <TransfersSection />
        </TabsContent>
        <TabsContent value="reconciliations" className="pt-4">
          <ReconciliationsSection />
        </TabsContent>
        {isAdministrator && (
          <TabsContent value="diagnostics" className="pt-4">
            <TreasuryDiagnostics />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
