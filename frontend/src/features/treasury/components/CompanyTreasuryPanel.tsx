"use client";
/**
 * Company money position (Cycle 30): the company's treasury accounts with
 * live balances and per-currency totals.
 *
 * Balances are derived from posted transactions by the backend service layer
 * — never stored on the company, never edited by hand. Per-currency totals
 * are grouped, never collapsed into one invented currency. A company with no
 * accounts shows an explicit empty state (missing ≠ zero).
 */
import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Landmark, ArrowLeftRight } from "lucide-react";
import { SourceText } from "@/components/i18n/SourceText";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { treasuryApi } from "@/features/treasury/api";
import { useRole } from "@/hooks/useRole";
import type { TreasuryAccount } from "@/features/treasury/types";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat(localeTag(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}
export function CompanyTreasuryPanel({ companyId }: { companyId: string }) {
  const { isAdmin } = useRole();
  const { data, isLoading } = useQuery({
    queryKey: ["treasury:accounts", "by-company", companyId],
    queryFn: () =>
      treasuryApi.accounts.list({
        company: companyId,
        page_size: 200,
        is_archived: false,
      }),
    staleTime: 1000 * 60,
    enabled: !!companyId,
  });
  const accounts: TreasuryAccount[] = data?.results || [];
  // Group totals per currency — never collapse currencies together.
  const totals = accounts.reduce<Record<string, number>>((acc, a) => {
    const cur = a.currency || "MAD";
    const bal =
      typeof a.current_balance === "string"
        ? parseFloat(a.current_balance)
        : a.current_balance;
    acc[cur] = (acc[cur] || 0) + (Number.isNaN(bal) ? 0 : bal);
    return acc;
  }, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          <SourceText source="Treasury — Money Position" leading trailing />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-16 animate-pulse bg-muted rounded-lg" />
        ) : accounts.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            <p>
              <SourceText source="No treasury accounts for this company yet." />
            </p>
            <p className="mt-1">
              <SourceText
                source="Open one under Treasury → Accounts &amp; Balances to start tracking its money."
                leading
                trailing
              />
            </p>
          </div>
        ) : (
          <>
            {/* Per-currency totals */}
            <div className="flex flex-wrap gap-3">
              {Object.entries(totals).map(([currency, total]) => (
                <div
                  key={currency}
                  className="px-4 py-3 rounded-lg bg-primary/10 border border-primary/20"
                >
                  <p className="text-xs text-muted-foreground">
                    <SourceText source="Total position (" leading />
                    {currency})
                  </p>
                  <p
                    className={`text-xl font-bold tabular-nums ${total < 0 ? "text-red-600" : ""}`}
                  >
                    {fmt(total, currency)}
                  </p>
                </div>
              ))}
            </div>

            {/* Accounts table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs text-muted-foreground uppercase tracking-wider border-b">
                    <th className="py-2 pe-4">
                      <SourceText source="Account" />
                    </th>
                    <th className="py-2 pe-4">
                      <SourceText source="Kind" />
                    </th>
                    <th className="py-2 pe-4 text-end">
                      <SourceText source="Balance" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pe-4">
                        <span className="font-medium">{a.name}</span>
                        <span className="ms-2 font-mono text-xs text-muted-foreground">
                          {a.reference}
                        </span>
                      </td>
                      <td className="py-2 pe-4">
                        <Badge variant="outline">{a.kind}</Badge>
                      </td>
                      <td
                        className={`py-2 pe-4 text-end font-mono font-medium ${(typeof a.current_balance === "string" ? parseFloat(a.current_balance) : a.current_balance) < 0 ? "text-red-600" : ""}`}
                      >
                        {fmtMoney(a.current_balance, a.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="pt-2 border-t flex flex-wrap gap-2">
          {isAdmin && (
          <Link href="/treasury">
            <Button variant="outline" size="sm">
              <Landmark className="me-2 h-4 w-4" />
              <SourceText source="Open Treasury" leading trailing />
            </Button>
          </Link>
          )}
          {isAdmin && (
          <Link href="/treasury#transfers">
            <Button variant="outline" size="sm">
              <ArrowLeftRight className="me-2 h-4 w-4" />
              <SourceText
                source="Transfer to / from another company"
                leading
                trailing
              />
            </Button>
          </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
function fmtMoney(
  value: string | number | null | undefined,
  currency = "MAD",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return fmt(n, currency);
}
