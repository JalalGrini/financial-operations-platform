"use client";
import { usePathname } from "next/navigation";
import { TagAction } from "@/components/collaboration/TagAction";
const patterns: Array<[RegExp, string]> = [
  [/^\/companies\/([0-9a-f-]+)$/i, "companies.company"],
  [/^\/personnel\/personnel\/([0-9a-f-]+)$/i, "personnel.personnelperson"],
  [/^\/personnel\/employments\/([0-9a-f-]+)$/i, "personnel.employment"],
  [/^\/personnel\/salaries\/([0-9a-f-]+)$/i, "personnel.employmentsalary"],
  [/^\/personnel\/payroll\/([0-9a-f-]+)$/i, "personnel.monthlypayrollrecord"],
  [/^\/personnel\/cnss\/([0-9a-f-]+)$/i, "personnel.cnssdeclaration"],
  [/^\/financial-records\/([0-9a-f-]+)$/i, "financial_records.financialrecord"],
  [/^\/reports\/([0-9a-f-]+)$/i, "reports.generatedreport"],
  [/^\/inventory\/([0-9a-f-]+)$/i, "inventory.inventoryitem"],
];
export function ContextTagAction() {
  const path = usePathname();
  for (const [pattern, type] of patterns) {
    const match = path.match(pattern);
    if (match) return <TagAction resourceType={type} targetId={match[1]} />;
  }
  return null;
}
