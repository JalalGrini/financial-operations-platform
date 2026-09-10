"use client";

/**
 * Client ticket form - the public intake on the landing page.
 *
 * SCOPE OF THIS PHASE: UI ONLY.
 * The submit path deliberately stops at a single, clearly marked boundary
 * (`submitClientTicket`). When the backend lands, that one function body is
 * replaced with the real request and nothing else in this file changes.
 *
 * FIELD SET (as specified): name, email, phone, company, message.
 * `company` is a fixed SELECT rather than a free-text field, so tickets
 * arrive already grouped by entity instead of needing manual reconciliation.
 *
 * ACCESSIBILITY AND ANTI-SPAM
 * - Native <select> and native validation semantics: the form is usable
 *   before hydration and works with every assistive technology, which a
 *   custom listbox cannot match without significant extra work.
 * - Errors are wired with aria-describedby + aria-invalid and announced via
 *   a polite live region, not conveyed by colour alone.
 * - A honeypot field (`display:none`) so HTML-parsing bots fill `website`
 *   while real users never see it. Server-side rejection is authoritative.
 */

import { AlertCircle, Check, Loader2, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import {
  MAX_UPLOAD_FILES,
  TICKET_ACCEPT,
  validateTicketFiles,
} from "@/lib/upload-limits";
import { Input, Textarea } from "@/components/ui/input";
import { FOCUS_RING, RADIUS, TYPE } from "./design-system";
import { MagneticButton } from "./interactive";
import {
  CLIENT_SUBJECT_KEYS,
  CLIENT_SUBJECT_SOURCE,
  uiLocale,
} from "@/lib/ticket-mail";

/** The three companies of the group, plus an escape hatch. */
/**
 * Backend choice KEYS for ClientTicket.company. These are the values sent to
 * the API; they must stay identical to COMPANY_CHOICES in
 * backend/apps/help_tickets/models.py or the serializer rejects the payload.
 */
const COMPANIES = [
  "3rb_extreme",
  "3rb_maroc",
  "el_rhrib_cash",
  "other",
] as const;

/**
 * Human labels shown in the select. Company names are proper nouns, so they
 * are intentionally not routed through the translation catalogue.
 */
const COMPANY_LABELS: Record<(typeof COMPANIES)[number], string> = {
  "3rb_extreme": "3.R.B Extreme",
  "3rb_maroc": "3.R.B Maroc",
  "el_rhrib_cash": "EL RHRIB CASH",
  other: "Other / not sure",
};

/** Minimum gap between submissions from one browser. */
const THROTTLE_MS = 60_000;
const THROTTLE_KEY = "efop:ticket:last-submit";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(120, "That name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter a reachable phone number.")
    .max(32, "That phone number is too long.")
    // Moroccan formats vary widely (0661..., +212 6..., spaces, dashes),
    // so this stays deliberately permissive: digits and separators only.
    .regex(/^[+()\d\s.-]+$/, "Use digits, spaces, +, - or brackets only."),
  company: z.enum(COMPANIES, {
    errorMap: () => ({ message: "Please choose the company concerned." }),
  }),
  subject_key: z.enum(CLIENT_SUBJECT_KEYS, {
    errorMap: () => ({ message: "Please choose a subject." }),
  }),
  message: z
    .string()
    .trim()
    .min(20, "Please describe your request in at least 20 characters.")
    .max(2000, "Please keep the message under 2000 characters."),
});

type FormValues = z.infer<typeof schema>;
type FieldName = keyof FormValues;
type Status = "idle" | "submitting" | "success" | "error";

const EMPTY: Record<FieldName, string> = {
  name: "",
  email: "",
  phone: "",
  company: "",
  subject_key: "",
  message: "",
};

/**
 * Posts the ticket to the public intake endpoint.
 *
 * The endpoint is AllowAny by design: the submitter is an unauthenticated
 * visitor. No credentials are sent, so no cookie or token can leak to it.
 * The request goes through the app's own /api/v1 proxy route rather than
 * straight to Django, which keeps it inside the `connect-src 'self'` CSP.
 */
async function submitClientTicket(
  values: FormValues,
  files: File[],
  website = "",
): Promise<number | null> {
  const composedMessage = [values.message].filter(Boolean).join("\n\n");

  const body = new FormData();
  body.append("name", values.name);
  body.append("email", values.email);
  body.append("phone", values.phone);
  body.append("company", values.company);
  body.append("subject_key", values.subject_key);
  body.append("locale", uiLocale());
  body.append("message", composedMessage);
  body.append("website", website);
  files.forEach((file, index) => {
    body.append("files", file);
    if (index === 0) body.append("file", file);
  });

  const response = await fetch("/api/v1/help/client-tickets/", {
    method: "POST",
    credentials: "omit",
    body,
  });

  if (!response.ok) {
    // Surface field-level validation coming back from the serializer, but
    // never dump a raw payload into the UI.
    let detail = `Ticket submission failed (${response.status}).`;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      const first = Object.entries(body)[0];
      if (first) {
        const [field, problem] = first;
        const text = Array.isArray(problem) ? problem[0] : problem;
        if (typeof text === "string") detail = `${field}: ${text}`;
      }
    } catch {
      // Non-JSON error body; keep the status-code message.
    }
    throw new Error(detail);
  }

  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const nested = payload.data as Record<string, unknown> | undefined;
    const raw = payload.id ?? nested?.id;
    const id = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export function ClientTicketForm() {
  const [values, setValues] = useState<Record<FieldName, string>>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const honeypotRef = useRef<HTMLInputElement | null>(null);
  const firstErrorRef = useRef<FieldName | null>(null);

  const setField = useCallback(
    (field: FieldName, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }));
      // Clear an error as soon as the visitor starts fixing it; leaving it
      // visible while they type reads as the form arguing with them.
      setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
      setFormError(null);
    },
    [],
  );

  // Move focus to the first invalid control after a failed submit.
  useEffect(() => {
    if (status !== "error" || !firstErrorRef.current) return;
    const el = document.getElementById(`ticket-${firstErrorRef.current}`);
    el?.focus();
    firstErrorRef.current = null;
  }, [status]);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (status === "submitting") return;

      const last = Number(window.sessionStorage.getItem(THROTTLE_KEY) ?? 0);
      if (last && Date.now() - last < THROTTLE_MS) {
        const wait = Math.ceil((THROTTLE_MS - (Date.now() - last)) / 1000);
        setStatus("error");
        setFormError(
          `You have just sent a ticket. Please wait ${wait} seconds before sending another.`,
        );
        return;
      }

      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        const next: Partial<Record<FieldName, string>> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as FieldName | undefined;
          if (field && !next[field]) next[field] = issue.message;
        }
        setErrors(next);
        firstErrorRef.current =
          (Object.keys(next)[0] as FieldName | undefined) ?? null;
        setStatus("error");
        setFormError("Please correct the highlighted fields.");
        return;
      }

      const fileError = validateTicketFiles(files);
      if (fileError) {
        setStatus("error");
        setFormError(fileError);
        return;
      }

      setStatus("submitting");
      setErrors({});
      setFormError(null);

      try {
        const id = await submitClientTicket(
          parsed.data,
          files,
          honeypotRef.current?.value ?? "",
        );
        window.sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
        setTicketNumber(id);
        setStatus("success");
        setValues(EMPTY);
        setFiles([]);
      } catch {
        setStatus("error");
        setFormError(
          "We could not send your ticket. Please try again, or call us directly.",
        );
      }
    },
    [status, values, files],
  );

  /* ------------------------------------------------------------ success */

  if (status === "success") {
    return (
      <div
        className={`relative overflow-hidden border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--glass))] p-8 dark:bg-[hsl(var(--brand-surface))] ${RADIUS.panel}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-start gap-4">
          {/* The tick draws itself on: a stroke-dashoffset sweep confirms
              receipt physically rather than only in words. */}
          <span
            className={`inline-flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]`}
          >
            <svg
              viewBox="0 0 32 32"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path
                d="M6 17.5 13 24 26 9"
                style={{
                  strokeDasharray: 40,
                  strokeDashoffset: 40,
                  animation:
                    "efop-tick-draw 420ms cubic-bezier(0.22,1,0.36,1) 80ms forwards",
                }}
              />
              <style>{`@keyframes efop-tick-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { [style*="efop-tick-draw"] { animation: none !important; stroke-dashoffset: 0 !important; } }`}</style>
            </svg>
          </span>

          <div>
            <h3 className={`${TYPE.h3} text-foreground`}>
              <SourceText source="Your ticket has been recorded." />
            </h3>
            {ticketNumber ? (
              <p className="mt-2 text-lg font-black text-[hsl(var(--brand-primary))]">
                <SourceText source="Ticket" /> #{ticketNumber}
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-[hsl(var(--brand-primary))]">
                <SourceText source="Your request has been recorded." />
              </p>
            )}
            <p className={`mt-2 max-w-[52ch] ${TYPE.body} text-muted-foreground`}>
              <SourceText source="Our team reviews client tickets during working hours and will reply to the email and phone number you provided. For anything urgent, call us directly." />
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setTicketNumber(null);
              setStatus("idle");
            }}
            className={`${RADIUS.pill} ${FOCUS_RING} border border-[hsl(var(--primary)/0.18)] px-4 py-2 text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-blue-500)/0.5)]`}
          >
            <SourceText source="Send another ticket" />
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------- form */

  const fieldWrap = "flex flex-col gap-2";
  const labelClass = "text-[0.8125rem] font-semibold text-foreground";
  const errorClass =
    "flex items-start gap-1.5 text-[0.8125rem] font-medium text-[hsl(var(--destructive))]";

  const describedBy = (field: FieldName) =>
    errors[field] ? `ticket-${field}-error` : undefined;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`relative overflow-hidden border border-[hsl(var(--primary)/0.12)] bg-[hsl(var(--glass)/0.86)] p-6 backdrop-blur-2xl dark:bg-[hsl(var(--brand-surface)/0.86)] sm:p-8 ${RADIUS.panel}`}
    >
      <input
        ref={honeypotRef}
        type="text"
        name="website"
        style={{ display: "none" }}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className={fieldWrap}>
          <label htmlFor="ticket-name" className={labelClass}>
            <SourceText source="Full name" />
          </label>
          <Input
            id="ticket-name"
            name="name"
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
            placeholder={String("Ahmed Benali")}
          />
          {errors.name ? (
            <p id="ticket-name-error" className={errorClass}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <SourceText source={errors.name} />
            </p>
          ) : null}
        </div>

        <div className={fieldWrap}>
          <label htmlFor="ticket-email" className={labelClass}>
            <SourceText source="Email address" />
          </label>
          <Input
            id="ticket-email"
            name="email"
            type="email"
            inputMode="email"
            value={values.email}
            onChange={(event) => setField("email", event.target.value)}
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email")}
            placeholder="name@company.ma"
          />
          {errors.email ? (
            <p id="ticket-email-error" className={errorClass}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <SourceText source={errors.email} />
            </p>
          ) : null}
        </div>

        <div className={fieldWrap}>
          <label htmlFor="ticket-phone" className={labelClass}>
            <SourceText source="Phone number" />
          </label>
          <Input
            id="ticket-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(event) => setField("phone", event.target.value)}
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describedBy("phone")}
            placeholder="+212 6 00 00 00 00"
          />
          {errors.phone ? (
            <p id="ticket-phone-error" className={errorClass}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <SourceText source={errors.phone} />
            </p>
          ) : null}
        </div>

        <div className={fieldWrap}>
          <label htmlFor="ticket-company" className={labelClass}>
            <SourceText source="Company concerned" />
          </label>
          {/*
            A native select, on purpose. It is keyboard- and
            screen-reader-correct for free, renders the platform's own picker
            on mobile, and works before hydration.
          */}
          <select
            id="ticket-company"
            name="company"
            value={values.company}
            onChange={(event) => setField("company", event.target.value)}
            aria-invalid={Boolean(errors.company)}
            aria-describedby={describedBy("company")}
            className={`h-11 w-full appearance-none border border-[hsl(var(--primary)/0.16)] bg-background px-3 text-[0.9375rem] text-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-blue-500)/0.45)] ${RADIUS.control} ${FOCUS_RING}`}
            style={{
              // Chevron drawn with a token colour rather than an image request.
              backgroundImage:
                "linear-gradient(45deg, transparent 50%, hsl(var(--muted-foreground)) 50%), linear-gradient(135deg, hsl(var(--muted-foreground)) 50%, transparent 50%)",
              backgroundPosition:
                "calc(100% - 18px) calc(50% - 2px), calc(100% - 13px) calc(50% - 2px)",
              backgroundSize: "5px 5px, 5px 5px",
              backgroundRepeat: "no-repeat",
            }}
          >
            <option value="" disabled>
              {sourceText("Select a company")}
            </option>
            {COMPANIES.map((company) => (
              <option key={company} value={company}>
                {company === "other"
                  ? sourceText("Other / not sure")
                  : COMPANY_LABELS[company]}
              </option>
            ))}
          </select>
          {errors.company ? (
            <p id="ticket-company-error" className={errorClass}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <SourceText source={errors.company} />
            </p>
          ) : null}
        </div>

        <div className={`${fieldWrap} sm:col-span-2`}>
          <label htmlFor="ticket-subject" className={labelClass}>
            <SourceText source="Email subject" />
          </label>
          <select
            id="ticket-subject"
            name="subject_key"
            value={values.subject_key}
            onChange={(event) => setField("subject_key", event.target.value)}
            aria-invalid={Boolean(errors.subject_key)}
            aria-describedby={describedBy("subject_key")}
            className={`h-11 w-full appearance-none border border-[hsl(var(--primary)/0.16)] bg-background px-3 text-[0.9375rem] text-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-blue-500)/0.45)] ${RADIUS.control} ${FOCUS_RING}`}
          >
            <option value="" disabled>
              {sourceText("Choose an email subject")}
            </option>
            {CLIENT_SUBJECT_KEYS.map((key) => (
              <option key={key} value={key}>
                {sourceText(CLIENT_SUBJECT_SOURCE[key])}
              </option>
            ))}
          </select>
          {errors.subject_key ? (
            <p id="ticket-subject-error" className={errorClass}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <SourceText source={errors.subject_key} />
            </p>
          ) : null}
        </div>

        <div className={`${fieldWrap} sm:col-span-2`}>
          <label htmlFor="ticket-message" className={labelClass}>
            <SourceText source="How can we help?" />
          </label>
          <Textarea
            id="ticket-message"
            name="message"
            rows={5}
            value={values.message}
            onChange={(event) => setField("message", event.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={describedBy("message")}
            placeholder={sourceText(
              "Tell us which service you need, the site or city concerned, and any deadline you are working to.",
            )}
          />
          <div className="flex items-start justify-between gap-4">
            {errors.message ? (
              <p id="ticket-message-error" className={errorClass}>
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <SourceText source={errors.message} />
              </p>
            ) : (
              <span />
            )}
            <span
              className="shrink-0 text-[0.75rem] tabular-nums text-muted-foreground"
              aria-hidden="true"
            >
              {values.message.trim().length}
              {" / 2000"}
            </span>
          </div>
        </div>

        <div className={`${fieldWrap} sm:col-span-2`}>
          <label htmlFor="ticket-attachment" className={labelClass}>
            <SourceText source="Attachments" />
          </label>
          <Input
            id="ticket-attachment"
            name="files"
            type="file"
            multiple
            accept={TICKET_ACCEPT}
            onChange={(event) => {
              const incoming = Array.from(event.target.files ?? []);
              const next = [...files, ...incoming].slice(0, MAX_UPLOAD_FILES);
              const problem = validateTicketFiles(next);
              if (problem) {
                setFormError(problem);
                event.target.value = "";
                return;
              }
              setFiles(next);
              setFormError(null);
              event.target.value = "";
            }}
          />
          {files.length > 0 ? (
            <ul className="space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--primary)/0.12)] px-3 py-2 text-[0.8125rem]"
                >
                  <span className="min-w-0 truncate">
                    {file.name}{" "}
                    <span className="text-muted-foreground">
                      ({Math.max(1, Math.round(file.size / 1024))} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, item) => item !== index),
                      )
                    }
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    aria-label={sourceText("Remove file")}
                  >
                    <X className="h-3.5 w-3.5" />
                    <SourceText source="Remove file" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[0.75rem] text-muted-foreground">
            <SourceText source="You can attach up to 2 files (2 MB each, 4 MB total)." />
          </p>
        </div>
      </div>

      {/* Form-level status. A live region so failures are announced, not
          merely coloured. */}
      <div aria-live="polite" className="min-h-6">
        {formError ? (
          <p className={`mt-4 ${errorClass}`}>
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <SourceText source={formError} />
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <MagneticButton
          type="submit"
          variant="primary"
          size="lg"
          disabled={status === "submitting"}
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <SourceText source="Sending" />
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden="true" />
              <SourceText source="Send ticket" />
            </>
          )}
        </MagneticButton>

        <p className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />
          <SourceText source="Your details are used only to answer your request." />
        </p>
      </div>
    </form>
  );
}

export default ClientTicketForm;
export { COMPANIES, COMPANY_LABELS };
