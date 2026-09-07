function localeTag() {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "fr").toLowerCase();
    if (lang.startsWith("ar")) return "ar-MA";
    if (lang.startsWith("en")) return "en-GB";
  }
  return "fr-MA";
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currency = "MAD",
): string {
  if (amount === null || amount === undefined || amount === "") {
    return "-";
  }
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  try {
    return new Intl.NumberFormat(localeTag(), {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}

export function formatDate(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  const extra = options ?? {};
  const formatOptions: Intl.DateTimeFormatOptions =
    extra.dateStyle != null || extra.timeStyle != null
      ? {
          ...(extra.dateStyle ? { dateStyle: extra.dateStyle } : {}),
          ...(extra.timeStyle ? { timeStyle: extra.timeStyle } : {}),
        }
      : {
          year: extra.year ?? "numeric",
          month: extra.month ?? "2-digit",
          day: extra.day ?? "2-digit",
          ...(extra.hour ? { hour: extra.hour } : {}),
          ...(extra.minute ? { minute: extra.minute } : {}),
        };
  try {
    return extra.dateStyle || extra.timeStyle
      ? d.toLocaleString("fr-MA", formatOptions)
      : d.toLocaleDateString("fr-MA", formatOptions);
  } catch {
    return "-";
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString(localeTag(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPercentage(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return `${num.toFixed(1)}%`;
}

export function formatNumber(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat(localeTag()).format(num);
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return cleaned.replace(
      /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
      "$1 $2 $3 $4 $5",
    );
  }
  return phone;
}

export function formatCIN(cin: string | null | undefined): string {
  if (!cin) return "-";
  return cin.toUpperCase();
}

export function formatEmail(email: string | null | undefined): string {
  if (!email) return "-";
  return email.toLowerCase();
}

export function formatStatus(status: string | null | undefined): string {
  if (!status) return "-";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function formatCNSSNumber(cnss: string | null | undefined): string {
  if (!cnss) return "-";
  return cnss.replace(/(\d{2})(\d{6})(\d{1})/, "$1 $2 $3");
}
