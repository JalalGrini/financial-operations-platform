import type { Locale } from "@/lib/experience";

export const CLIENT_SUBJECT_KEYS = [
  "ticket_reply",
  "quote_request",
  "partnership",
  "complaint",
  "technical_info",
  "other_request",
] as const;

export const CLIENT_SUBJECT_SOURCE: Record<(typeof CLIENT_SUBJECT_KEYS)[number], string> = {
  ticket_reply: "Reply to your ticket on 3.R.B Extreme",
  quote_request: "Quote request — 3.R.B Extreme",
  partnership: "Partnership request — 3.R.B Extreme",
  complaint: "Complaint — 3.R.B Extreme",
  technical_info: "Information request — 3.R.B Extreme",
  other_request: "Other request — 3.R.B Extreme",
};

export const HELP_SUBJECT_KEYS = [
  "cannot_sign_in",
  "page_blocked",
  "data_not_saving",
  "display_issue",
  "other_issue",
] as const;

export const HELP_SUBJECT_SOURCE: Record<(typeof HELP_SUBJECT_KEYS)[number], string> = {
  cannot_sign_in: "I cannot sign in",
  page_blocked: "A page is blocked or access is denied",
  data_not_saving: "My data is not saving",
  display_issue: "Display or language problem",
  other_issue: "Other issue",
};

export function uiLocale(): Locale {
  if (typeof document === "undefined") return "fr";
  const lang = document.documentElement.lang;
  return lang === "en" || lang === "ar" ? lang : "fr";
}
