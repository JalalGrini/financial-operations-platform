"use client";

/**
 * CompanyTicketForm
 *
 * A public ticket intake form identical in API contract to ClientTicketForm,
 * but with the `company` field pre-filled and rendered as a read-only label
 * (not a select). The visitor cannot change the company.
 *
 * One instance of this component is rendered per company in CompaniesSection.
 */

import { AlertCircle, Check, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { sourceText } from "@/lib/i18n/source-catalog";
import { Input, Textarea } from "@/components/ui/input";
import { FOCUS_RING, RADIUS, TYPE } from "./design-system";
import { MagneticButton } from "./interactive";

/* ------------------------------------------------------------------ types */

type Status = "idle" | "submitting" | "success" | "error";

/** Must match COMPANY_CHOICES in backend/apps/help_tickets/models.py */
type CompanyKey = "3rb_extreme" | "3rb_maroc" | "el_rhrib_cash" | "other";

interface CompanyTicketFormProps {
  /** API key sent in the payload — e.g. "3rb_extreme" */
  company: CompanyKey;
  /** Human label shown to the visitor — e.g. "3.R.B Extrême" */
  companyLabel: string;
  /** Single “Email ou Téléphone” field instead of separate email + phone. */
  combinedContact?: boolean;
  /** Submit button label. Defaults to “Envoyer le ticket”. */
  submitLabel?: string;
}

/* ---------------------------------------------------------------- schema */

const schema = z.object({
  name: z.string().trim().min(2, "Veuillez saisir votre nom complet.").max(120),
  email: z.string().trim().min(1, "Veuillez saisir votre email.").email("Email invalide."),
  phone: z
    .string()
    .trim()
    .min(6, "Veuillez saisir un numéro de téléphone.")
    .max(32)
    .regex(/^[+()\d\s.-]+$/, "Chiffres, espaces, +, - ou parenthèses uniquement."),
  subject: z.string().trim().min(3, "Veuillez saisir un sujet.").max(160),
  message: z
    .string()
    .trim()
    .min(20, "Décrivez votre demande en au moins 20 caractères.")
    .max(2000),
  attachmentName: z.string().optional(),
});

type FormValues = z.infer<typeof schema> & { contact?: string };

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  contact: "",
  subject: "",
  message: "",
  attachmentName: "",
};

type FieldName = keyof typeof EMPTY;

const THROTTLE_MS = 60_000;

/* --------------------------------------------------------------- submit */

async function submitCompanyTicket(
  values: FormValues,
  company: CompanyKey,
): Promise<number | null> {
  const composedMessage = [
    values.subject ? `Sujet: ${values.subject}` : "",
    values.attachmentName ? `Pièce jointe: ${values.attachmentName}` : "",
    values.contact ? `Contact: ${values.contact}` : "",
    values.message,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch("/api/v1/help/client-tickets/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    body: JSON.stringify({
      name: values.name,
      email: values.email,
      phone: values.phone,
      company,
      message: composedMessage,
    }),
  });

  if (!response.ok) {
    let detail = `Échec de l'envoi (${response.status}).`;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      const first = Object.entries(body)[0];
      if (first) {
        const [field, problem] = first;
        const text = Array.isArray(problem) ? problem[0] : problem;
        if (typeof text === "string") detail = `${field}: ${text}`;
      }
    } catch {
      /* keep status message */
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

/* ---------------------------------------------------------------- form */

export function CompanyTicketForm({
  company,
  companyLabel,
  combinedContact = false,
  submitLabel = "Envoyer le ticket",
}: CompanyTicketFormProps) {
  const [values, setValues] = useState<Record<FieldName, string>>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const honeypotRef = useRef<HTMLInputElement | null>(null);
  const firstErrorRef = useRef<FieldName | null>(null);
  const throttleKeyRef = useRef(`efop:ticket:last-submit:${company}`);

  const setField = useCallback((field: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  }, []);

  useEffect(() => {
    if (status !== "error" || !firstErrorRef.current) return;
    const el = document.getElementById(`ctf-${company}-${firstErrorRef.current}`);
    el?.focus();
    firstErrorRef.current = null;
  }, [status, company]);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (status === "submitting") return;

      if (honeypotRef.current?.value) {
        setStatus("success");
        return;
      }

      const last = Number(
        window.sessionStorage.getItem(throttleKeyRef.current) ?? 0,
      );
      if (last && Date.now() - last < THROTTLE_MS) {
        const wait = Math.ceil((THROTTLE_MS - (Date.now() - last)) / 1000);
        setStatus("error");
        setFormError(`Veuillez patienter ${wait} secondes avant d'envoyer un autre ticket.`);
        return;
      }

      const contact = values.contact.trim();
      const contactIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
      const contactIsPhone = /^[+()\d\s.-]{6,32}$/.test(contact);

      const parsed = schema.safeParse({
        ...values,
        email: combinedContact
          ? contactIsEmail
            ? contact
            : "contact@groupe3rb.ma"
          : values.email,
        phone: combinedContact
          ? contactIsPhone
            ? contact
            : "+000000000"
          : values.phone,
      });

      const next: Partial<Record<FieldName, string>> = {};
      if (combinedContact && !contactIsEmail && !contactIsPhone) {
        next.contact = "Veuillez saisir un email ou un numéro de téléphone.";
      }
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] as FieldName | undefined;
          if (!field || next[field]) continue;
          if (combinedContact && (field === "email" || field === "phone")) continue;
          next[field] = issue.message;
        }
      }
      if (Object.keys(next).length) {
        setErrors(next);
        firstErrorRef.current =
          (Object.keys(next)[0] as FieldName | undefined) ?? null;
        setStatus("error");
        setFormError("Veuillez corriger les champs signalés.");
        return;
      }
      if (!parsed.success) return;

      setStatus("submitting");
      setErrors({});
      setFormError(null);

      try {
        const id = await submitCompanyTicket(
          { ...parsed.data, contact: values.contact },
          company,
        );
        window.sessionStorage.setItem(throttleKeyRef.current, String(Date.now()));
        setTicketNumber(id);
        setStatus("success");
        setValues(EMPTY);
      } catch {
        setStatus("error");
        setFormError("Nous n'avons pas pu envoyer votre ticket. Veuillez réessayer ou nous appeler directement.");
      }
    },
    [status, values, company, combinedContact],
  );

  /* ---------------------------------------------------------- success */
  if (status === "success") {
    return (
      <div
        className={`relative overflow-hidden border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--glass))] p-8 dark:bg-[hsl(var(--brand-surface))] ${RADIUS.panel}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-start gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]">
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
            </svg>
          </span>
          <div>
            <h3 className={`${TYPE.h3} text-foreground`}>
              Votre ticket a bien été enregistré.
            </h3>
            {ticketNumber ? (
              <p className="mt-2 text-lg font-black text-[hsl(var(--brand-primary))]">
                Ticket #{ticketNumber}
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-[hsl(var(--brand-primary))]">
                Votre demande a bien été enregistrée.
              </p>
            )}
            <p className={`mt-2 max-w-[52ch] ${TYPE.body} text-muted-foreground`}>
              Notre équipe traite les tickets clients pendant les heures ouvrables et vous répondra à l'email et au numéro fournis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setTicketNumber(null); setStatus("idle"); }}
            className={`${RADIUS.pill} ${FOCUS_RING} border border-[hsl(var(--primary)/0.18)] px-4 py-2 text-[0.8125rem] font-semibold text-foreground transition-colors duration-150 hover:border-[hsl(var(--brand-blue-500)/0.5)]`}
          >
            Envoyer un autre ticket
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- form */
  const fw = "flex flex-col gap-2";
  const lc = "text-[0.8125rem] font-semibold text-foreground";
  const ec = "flex items-start gap-1.5 text-[0.8125rem] font-medium text-[hsl(var(--destructive))]";
  const id = (field: FieldName) => `ctf-${company}-${field}`;
  const err = (field: FieldName) => (errors[field] ? `${id(field)}-error` : undefined);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={`relative overflow-hidden border border-[hsl(var(--primary)/0.12)] bg-[hsl(var(--glass)/0.86)] p-6 backdrop-blur-2xl dark:bg-[hsl(var(--brand-surface)/0.86)] sm:p-8 ${RADIUS.panel}`}
    >
      {/* Honeypot */}
      <div className="absolute -left-[9999px] top-0" aria-hidden="true">
        <label htmlFor={`ctf-${company}-website`}>{sourceText("Website")}</label>
        <input
          ref={honeypotRef}
          id={`ctf-${company}-website`}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* Company (read-only) */}
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-[hsl(var(--primary)/0.12)] bg-[hsl(var(--primary)/0.04)] px-4 py-3">
        <span className="text-[0.75rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Entreprise
        </span>
        <span className="text-[0.9375rem] font-bold text-foreground">{companyLabel}</span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Nom complet */}
        <div className={fw}>
          <label htmlFor={id("name")} className={lc}>Nom complet</label>
          <Input
            id={id("name")}
            name="name"
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={err("name")}
            placeholder="Ahmed Benali"
          />
          {errors.name && (
            <p id={`${id("name")}-error`} className={ec}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {errors.name}
            </p>
          )}
        </div>

        {combinedContact ? (
          <div className={fw}>
            <label htmlFor={id("contact")} className={lc}>Email ou Téléphone</label>
            <Input
              id={id("contact")}
              name="contact"
              value={values.contact}
              onChange={(e) => setField("contact", e.target.value)}
              autoComplete="email"
              aria-invalid={Boolean(errors.contact)}
              aria-describedby={err("contact")}
              placeholder="nom@entreprise.ma ou +212 6 00 00 00 00"
            />
            {errors.contact && (
              <p id={`${id("contact")}-error`} className={ec}>
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {errors.contact}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className={fw}>
              <label htmlFor={id("email")} className={lc}>Email</label>
              <Input
                id={id("email")}
                name="email"
                type="email"
                inputMode="email"
                value={values.email}
                onChange={(e) => setField("email", e.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={err("email")}
                placeholder="nom@entreprise.ma"
              />
              {errors.email && (
                <p id={`${id("email")}-error`} className={ec}>
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {errors.email}
                </p>
              )}
            </div>
            <div className={fw}>
              <label htmlFor={id("phone")} className={lc}>Téléphone</label>
              <Input
                id={id("phone")}
                name="phone"
                type="tel"
                inputMode="tel"
                value={values.phone}
                onChange={(e) => setField("phone", e.target.value)}
                autoComplete="tel"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={err("phone")}
                placeholder="+212 6 00 00 00 00"
              />
              {errors.phone && (
                <p id={`${id("phone")}-error`} className={ec}>
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {errors.phone}
                </p>
              )}
            </div>
          </>
        )}

        {/* Sujet */}
        <div className={fw}>
          <label htmlFor={id("subject")} className={lc}>Sujet</label>
          <Input
            id={id("subject")}
            name="subject"
            value={values.subject}
            onChange={(e) => setField("subject", e.target.value)}
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={err("subject")}
            placeholder="Objet de votre demande"
          />
          {errors.subject && (
            <p id={`${id("subject")}-error`} className={ec}>
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {errors.subject}
            </p>
          )}
        </div>

        {/* Message */}
        <div className={`${fw} sm:col-span-2`}>
          <label htmlFor={id("message")} className={lc}>Message</label>
          <Textarea
            id={id("message")}
            name="message"
            rows={5}
            value={values.message}
            onChange={(e) => setField("message", e.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={err("message")}
            placeholder="Décrivez votre demande, le site concerné et vos délais éventuels."
          />
          <div className="flex items-start justify-between gap-4">
            {errors.message ? (
              <p id={`${id("message")}-error`} className={ec}>
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {errors.message}
              </p>
            ) : <span />}
            <span className="shrink-0 text-[0.75rem] tabular-nums text-muted-foreground" aria-hidden="true">
              {values.message.trim().length} / 2000
            </span>
          </div>
        </div>

        {/* Pièce jointe */}
        <div className={`${fw} sm:col-span-2`}>
          <label htmlFor={id("attachmentName")} className={lc}>Pièce jointe (optionnel)</label>
          <Input
            id={id("attachmentName")}
            name="attachment"
            type="file"
            onChange={(e) => setField("attachmentName", e.target.files?.[0]?.name ?? "")}
          />
          <p className="text-[0.75rem] text-muted-foreground">
            Le nom du fichier est transmis avec votre message.
          </p>
        </div>
      </div>

      <div aria-live="polite" className="min-h-6">
        {formError && (
          <p className={`mt-4 ${ec}`}>
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}
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
              Envoi en cours…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitLabel}
            </>
          )}
        </MagneticButton>

        <p className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />
          Vos données sont utilisées uniquement pour répondre à votre demande.
        </p>
      </div>
    </form>
  );
}

export default CompanyTicketForm;
