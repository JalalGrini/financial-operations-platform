export const GROUP_COMPANY_VALUE = "all";

export function withGroupCompanyOption(
  options: { value: string; label: string }[],
  label: string,
): { value: string; label: string }[] {
  return [{ value: GROUP_COMPANY_VALUE, label }, ...options];
}

export function companyFilterOptions(
  companies: { id: string; name: string }[] | undefined | null,
  groupLabel: string,
): { value: string; label: string }[] {
  return withGroupCompanyOption(
    (companies || []).map((company) => ({
      value: String(company.id),
      label: company.name,
    })),
    groupLabel,
  );
}

export function companyFieldToApi(value: string | null | undefined): string | null {
  if (!value || value === GROUP_COMPANY_VALUE) return null;
  return value;
}

export function companySelectValue(value: string | null | undefined): string {
  return value || GROUP_COMPANY_VALUE;
}

export function companyDisplayName(
  name: string | null | undefined,
  fallback: string,
): string {
  return name?.trim() ? name : fallback;
}
