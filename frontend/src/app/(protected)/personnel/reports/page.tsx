"use client";

import { sourceText } from "@/lib/i18n/source-catalog";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "@/components/ui/toast";
import { format } from "date-fns";
import {
  Download,
  FileText,
  Search,
  Filter,
  Loader2,
  Calendar,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";

import { SourceText } from "@/components/i18n/SourceText";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/ui/page-hero";
import { StatCard } from "@/components/ui/stat-card";
import { Breadcrumb, PageHeader } from "@/components/ui/page-components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { GuidePanel } from "@/components/ui/guide-panel";

function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

type ReportRow = {
  company?: string;
  company_reference?: string;
  cnss_registration_number?: string;
  last_name?: string;
  first_name?: string;
  full_name?: string;
  declared_days?: number;
  cin?: string;
  situation?: string;
  first_declaration_date?: string;
  declaration_start_date?: string;
  declaration_stop_date?: string;
  resignation_date?: string;
  current_declaration_state?: string;
  observation?: string;
  work_domain?: string;
  work_city?: string;
  department?: string;
  employee_reference?: string;
  phone?: string;
  hire_date?: string;
  payroll_month?: string;
  scheduled_days?: number;
  worked_days?: number;
  absence_days?: number;
  fixed_gross_salary?: number;
  gross_salary_snapshot?: number;
  supplements?: number;
  deductions?: number;
  calculated_net_salary?: number;
  total_paid?: number;
  remaining_amount?: number;
  rib?: string;
  payment_method?: string;
  payroll_status?: string;
};

function SummaryTile({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/90 shadow-[0_12px_28px_rgba(15,23,42,.05)]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
          <div className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

export default function PersonnelReportsPage() {
  const [reportType, setReportType] = useState<
    "cnss_monthly" | "payroll_monthly"
  >("cnss_monthly");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [personnelIds, setPersonnelIds] = useState<string[]>([]);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState(false);
  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [personnel, setPersonnel] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiClient.get<{
        results: Array<{ id: string; name: string }>;
      }>("/companies/");
      setCompanies(response.results || []);
    } catch (error) {
      console.error("Failed to fetch companies:", error);
    }
  }, []);

  const fetchPersonnel = useCallback(async () => {
    try {
      const response = await apiClient.get<{
        results: Array<{ id: string; name: string }>;
      }>("/personnel/persons/");
      setPersonnel(response.results || []);
    } catch (error) {
      console.error("Failed to fetch personnel:", error);
    }
  }, []);

  // Both loaders set state only after their awaits resolve, but calling them
  // straight from the effect body is still a synchronous call into a setState
  // path as far as react-hooks/set-state-in-effect is concerned. Running them
  // as one detached async task keeps the fetch-once-on-mount behaviour exactly
  // as it was while making the asynchrony explicit.
  useEffect(() => {
    void (async () => {
      await Promise.all([fetchCompanies(), fetchPersonnel()]);
    })();
  }, [fetchCompanies, fetchPersonnel]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.post<{
        rows: ReportRow[];
        count: number;
      }>(`/personnel/reports/${reportType.replaceAll("_", "-")}/preview/`, {
        year,
        month,
        output_format: "xlsx",
        company_ids: companyIds,
        personnel_ids: personnelIds,
      });
      setData(response.rows || []);
      setTotalCount(response.count || 0);
      setPage(1);
    } catch (error) {
      setError(sourceText("Failed to fetch report"));
      console.error("Report fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [year, month, reportType, companyIds, personnelIds]);

  const handleExport = useCallback(async () => {
    try {
      const blob = await apiClient.post<Blob>(
        `/personnel/reports/${reportType.replaceAll("_", "-")}/export/`,
        {
          year,
          month,
          report_type: reportType,
          output_format: "xlsx",
          company_ids: companyIds,
          personnel_ids: personnelIds,
        },
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${
        reportType === "cnss_monthly"
          ? sourceText("cnss_monthly_export_file_prefix")
          : sourceText("payroll_monthly_export_file_prefix")
      }_${month.toString().padStart(2, "0")}_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(sourceText("Export failed"));
    }
  }, [reportType, year, month, companyIds, personnelIds]);

  // Same reason as the loaders above: fetchReport opens with setLoading(true),
  // so it must not be invoked synchronously in the effect body.
  useEffect(() => {
    void (async () => {
      await fetchReport();
    })();
  }, [fetchReport]);

  const columns = useMemo(() => {
    if (reportType === "cnss_monthly") {
      return [
        { key: "company", header: sourceText("Company") },
        { key: "cnss_registration_number", header: sourceText("CNSS #") },
        { key: "full_name", header: sourceText("Name") },
        { key: "declared_days", header: sourceText("Days") },
        { key: "cin", header: sourceText("CIN") },
        { key: "situation", header: sourceText("Situation") },
        {
          key: "first_declaration_date",
          header: sourceText("First Declaration"),
        },
        { key: "declaration_start_date", header: sourceText("Start Date") },
        { key: "declaration_stop_date", header: sourceText("Stop Date") },
        { key: "resignation_date", header: sourceText("Resignation") },
        {
          key: "current_declaration_state",
          header: sourceText("Current State"),
        },
        { key: "observation", header: sourceText("Observation") },
      ];
    }

    return [
      { key: "company", header: sourceText("Company") },
      { key: "employee_reference", header: sourceText("Emp Ref") },
      { key: "full_name", header: sourceText("Name") },
      { key: "cin", header: sourceText("CIN") },
      { key: "phone", header: sourceText("Phone") },
      { key: "hire_date", header: sourceText("Hire Date") },
      { key: "payroll_month", header: sourceText("Period") },
      { key: "scheduled_days", header: sourceText("Sched. Days") },
      { key: "worked_days", header: sourceText("Worked") },
      { key: "absence_days", header: sourceText("Absence") },
      { key: "declared_days", header: sourceText("Declared") },
      { key: "fixed_gross_salary", header: sourceText("Fixed Gross") },
      { key: "gross_salary_snapshot", header: sourceText("Gross Snapshot") },
      { key: "supplements", header: sourceText("Supplements") },
      { key: "deductions", header: sourceText("Deductions") },
      { key: "calculated_net_salary", header: sourceText("Net Salary") },
      { key: "total_paid", header: sourceText("Total Paid") },
      { key: "remaining_amount", header: sourceText("Remaining") },
      { key: "rib", header: sourceText("RIB") },
      { key: "payment_method", header: sourceText("Pay Method") },
      { key: "payroll_status", header: sourceText("Status") },
      { key: "observation", header: sourceText("Observation") },
    ];
  }, [reportType]);

  const totalRows = totalCount || data.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const paginatedRows = data.slice((page - 1) * pageSize, page * pageSize);
  const monthLabel = new Date(2000, month - 1, 1).toLocaleString(localeTag(), {
    month: "long",
  });

  const formatValue = (value: unknown, key: string): string => {
    if (value === null || value === undefined || value === "") return "-";
    if (
      typeof value === "number" &&
      (key.includes("salary") ||
        key.includes("amount") ||
        key.includes("gross") ||
        key.includes("net") ||
        key.includes("paid") ||
        key.includes("remaining") ||
        key.includes("supplement") ||
        key.includes("deduction") ||
        key.includes("fixed"))
    ) {
      return new Intl.NumberFormat(localeTag(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
    if (
      value instanceof Date ||
      (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
    ) {
      try {
        return format(new Date(value), "dd/MM/yyyy");
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const renderCellValue = (value: unknown, key: string): React.ReactNode => {
    let displayValue: React.ReactNode = formatValue(value, key);

    if (key === "situation" && typeof value === "string") {
      displayValue = (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${getSituationColor(value)}`}
        >
          {getSituationLabel(value)}
        </span>
      );
    }

    if (key === "payroll_status" && typeof value === "string") {
      const statusColors: Record<string, string> = {
        draft: "bg-gray-100 text-gray-800",
        calculated: "bg-blue-100 text-blue-800",
        approved: "bg-green-100 text-green-800",
        paid: "bg-green-100 text-green-800",
        cancelled: "bg-red-100 text-red-800",
      };
      displayValue = (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[value] || "bg-gray-100 text-gray-800"}`}
        >
          {getPayrollStatusLabel(value)}
        </span>
      );
    }

    return displayValue;
  };

  const getSituationLabel = (situation: string) => {
    const labels: Record<string, string> = {
      entrant: sourceText("Entrant"),
      sortant: sourceText("Sortant"),
      active: sourceText("Active"),
      suspended: sourceText("Suspended"),
      correction: sourceText("Correction"),
      other: sourceText("Other"),
    };
    return labels[situation] || situation;
  };

  const getSituationColor = (situation: string) => {
    const colors: Record<string, string> = {
      entrant: "bg-green-100 text-green-800",
      sortant: "bg-red-100 text-red-800",
      active: "bg-blue-100 text-blue-800",
      suspended: "bg-yellow-100 text-yellow-800",
      correction: "bg-purple-100 text-purple-800",
      other: "bg-gray-100 text-gray-800",
    };
    return colors[situation] || "bg-gray-100 text-gray-800";
  };

  const getPayrollStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: sourceText("Draft"),
      calculated: sourceText("Calculated"),
      approved: sourceText("Approved"),
      paid: sourceText("Paid"),
      cancelled: sourceText("Cancelled"),
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          {
            get label() {
              return sourceText("Personnel");
            },
            href: "/personnel",
          },
          {
            get label() {
              return sourceText("Reports");
            },
            isCurrent: true,
          },
        ]}
      />

      <PageHero
        icon={FileText}
        eyebrow="Export & compliance"
        title={sourceText("Personnel Reports")}
        description={sourceText("Review monthly CNSS and payroll exports before sharing or downloading them.")}
        action={
          <Button
            variant="onHeroOutline"
            onClick={handleExport}
            disabled={loading || totalRows === 0}
          >
            <Download className="me-2 h-4 w-4" />
            <SourceText source="Export XLSX" leading trailing />
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Eye} label={sourceText("Visible rows")} value={totalRows} tone="primary" />
          <StatCard icon={Building2} label={sourceText("Companies")} value={companyIds.length === 0 ? sourceText("All") : companyIds.length} tone="indigo" />
          <StatCard icon={FileText} label={sourceText("Personnel")} value={personnelIds.length === 0 ? sourceText("All") : personnelIds.length} tone="emerald" />
          <StatCard icon={Calendar} label={sourceText("Period")} value={`${month.toString().padStart(2, "0")}/${year}`} tone="amber" />
        </div>

        <GuidePanel
          eyebrow={"Personnel reporting guide"}
          title={"Validate payroll and declaration outputs before export"}
          body={"Use previews to catch missing assignments, date gaps and suspicious totals before generating the monthly file."}
          items={[
            "Filter by company or personnel when a manager only needs a controlled subset.",
            "Review CNSS situations and payroll statuses before exporting the final workbook.",
            "Keep the reporting period aligned with the operational month used in payroll and declarations.",
          ]}
        />
      </section>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <SourceText source="Filters" leading trailing />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                <SourceText source="Report Type" />
              </label>
              <Select
                value={reportType}
                onValueChange={(v: string) =>
                  setReportType(v as "cnss_monthly" | "payroll_monthly")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={sourceText("Select report type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cnss_monthly">
                    <SourceText source="CNSS Monthly" />
                  </SelectItem>
                  <SelectItem value="payroll_monthly">
                    <SourceText source="Payroll Monthly" leading trailing />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                <SourceText source="Year" />
              </label>
              <Select
                value={year.toString()}
                onValueChange={(v) => setYear(parseInt(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={sourceText("Year")} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    { length: 10 },
                    (_, i) => new Date().getFullYear() - i,
                  ).map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                <SourceText source="Month" />
              </label>
              <Select
                value={month.toString()}
                onValueChange={(v) => setMonth(parseInt(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={sourceText("Month")} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {new Date(2000, i, 1).toLocaleString(localeTag(), {
                        month: "long",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                <SourceText source="Company" />
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                  className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-start text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-expanded={companyDropdownOpen}
                  aria-haspopup="listbox"
                >
                  {companyIds.length === 0 ? (
                    <span className="text-muted-foreground">
                      <SourceText source="All companies" />
                    </span>
                  ) : (
                    <span>
                      {companyIds.length}
                      <SourceText source="selected" leading />
                    </span>
                  )}
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${companyDropdownOpen ? "rotate-90" : ""}`}
                  />
                </button>
                {companyDropdownOpen && (
                  <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                    {companies.map((company) => (
                      <label
                        key={company.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={companyIds.includes(company.id)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setCompanyIds([...companyIds, company.id]);
                            } else {
                              setCompanyIds(
                                companyIds.filter((id) => id !== company.id),
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{company.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                <SourceText source="Personnel" />
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setPersonnelDropdownOpen(!personnelDropdownOpen)
                  }
                  className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-start text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-expanded={personnelDropdownOpen}
                  aria-haspopup="listbox"
                >
                  {personnelIds.length === 0 ? (
                    <span className="text-muted-foreground">
                      <SourceText source="All personnel" />
                    </span>
                  ) : (
                    <span>
                      {personnelIds.length}
                      <SourceText source="selected" leading />
                    </span>
                  )}
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${personnelDropdownOpen ? "rotate-90" : ""}`}
                  />
                </button>
                {personnelDropdownOpen && (
                  <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                    {personnel.map((person) => (
                      <label
                        key={person.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={personnelIds.includes(person.id)}
                          onChange={(event) => {
                            if (event.target.checked) {
                              setPersonnelIds([...personnelIds, person.id]);
                            } else {
                              setPersonnelIds(
                                personnelIds.filter((id) => id !== person.id),
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{person.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-end">
              <Button onClick={() => fetchReport()} disabled={loading}>
                {loading ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="me-2 h-4 w-4" />
                )}
                <SourceText source="Generate" leading trailing />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>
            <SourceText source="Results (" />
            {totalRows}
            <SourceText source="records)" leading />
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            {reportType === "cnss_monthly" ? (
              <SourceText source="CNSS Monthly Report" />
            ) : (
              <SourceText source="Payroll Monthly Report" />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  <SourceText source="Loading report…" />
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="mb-3 text-sm text-red-600">{error}</p>
              <Button variant="outline" onClick={() => fetchReport()}>
                <SourceText source="Retry" leading trailing />
              </Button>
            </div>
          ) : paginatedRows.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <FileText className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-lg font-medium text-foreground">
                <SourceText source="No data found" />
              </p>
              <p className="text-sm">
                <SourceText source="No records match the current filters" />
              </p>
            </div>
          ) : (
            <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
              {paginatedRows.map((row, rowIndex) => {
                const title =
                  row.full_name ||
                  row.company ||
                  row.employee_reference ||
                  row.cnss_registration_number ||
                  `${sourceText("Reference")} ${rowIndex + 1}`;
                const subtitle =
                  row.company_reference ||
                  row.company ||
                  row.payroll_month ||
                  row.current_declaration_state ||
                  null;
                return (
                  <div
                    key={rowIndex}
                    className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {title}
                        </p>
                        {subtitle ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {subtitle}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="outline">{rowIndex + 1}</Badge>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {columns.map((col, colIndex) => {
                        const value = row[col.key as keyof typeof row];
                        return (
                          <div
                            key={colIndex}
                            className="rounded-xl border border-border/60 bg-muted/30 p-3"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              {col.header}
                            </p>
                            <div className="mt-1 text-sm font-medium text-foreground">
                              {renderCellValue(value, col.key)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {totalRows > pageSize && !loading && (
        <div className="flex items-center justify-between border-t py-4">
          <span className="text-sm text-muted-foreground">
            <SourceText source="Showing" leading trailing />
            {Math.min((page - 1) * pageSize + 1, totalRows)}
            <SourceText source="to" leading />{" "}
            {Math.min(page * pageSize, totalRows)}
            <SourceText source="of" leading trailing />
            {totalRows}
            <SourceText source="results" leading trailing />
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">{page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
