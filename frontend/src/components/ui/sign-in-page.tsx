"use client";

/**
 * LoginPage v3 — Ultimate redesign for Groupe 3RB / EFOP
 * Layout: [FORM ← LEFT]  [SLIDESHOW → RIGHT]
 *
 * Features:
 * ─ Floating label inputs (label animates up on focus / fill)
 * ─ Gradient focus ring (brand blue → azure → orange cycling)
 * ─ Shimmer submit button with spring hover
 * ─ Framer Motion staggered entrance on every element
 * ─ Right panel: 5-image Ken Burns slideshow with crossfade
 * ─ Per-slide animated quote + highlight text
 * ─ Dot progress indicators + prev/next arrows
 * ─ Animated bottom progress bar
 * ─ Glassmorphism feature pills
 * ─ 100% CSS-variable based — both themes work, no white-on-white
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Eye,
  EyeOff,
  LifeBuoy,
  ShieldCheck,
  Database,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { z } from "zod";
import { SourceText } from "@/components/i18n/SourceText";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { GradientSpinner } from "@/components/ui/gradient-spinner";
import { apiClient } from "@/lib/api";
import { offerBrowserPasswordSave } from "@/lib/browser-password";
import { useExperience } from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";
import { cn } from "@/lib/utils";
import {
  HELP_SUBJECT_KEYS,
  HELP_SUBJECT_SOURCE,
  uiLocale,
} from "@/lib/ticket-mail";

/* ─────────────────────── validation ─────────────────────── */

const loginSchema = z.object({
  email: z.string().min(1, "Please enter your email or username"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

/* ────────────────────── slideshow data ────────────────────── */

const SLIDES = [
  {
    src: "/images/landing/hero-office-hi.jpg",
    quote: "We are Groupe 3RB.",
    highlight: "Your operations workspace.",
    sub: "Guarding, cleaning and technical staffing — one platform.",
  },
  {
    src: "/images/companies/3rb-extreme/hero.jpg",
    quote: "Trained teams.",
    highlight: "Guaranteed results.",
    sub: "368 completed projects. 99% client satisfaction.",
  },
  {
    src: "/images/companies/3rb-maroc/hero.jpg",
    quote: "Security does not wait.",
    highlight: "Neither do we.",
    sub: "Surveillance and intervention, operational 24/7.",
  },
  {
    src: "/brand/services/nettoyage-bureaux.jpg",
    quote: "Your company deserves",
    highlight: "the best partner.",
    sub: "Groupe 3.R.B — Morocco, since 2014.",
  },
  {
    src: "/brand/services/protection-evenements.jpg",
    quote: "A clear vision.",
    highlight: "Flawless execution.",
    sub: "Cleaning, disinfection, events and transfers.",
  },
] as const;

const FEATURES = [
  { Icon: ShieldCheck, text: "Secure access to group operations" },
  { Icon: Database, text: "Personnel, payroll, CNSS and treasury in one place" },
  { Icon: Clock, text: "Real-time tracking — 24/7" },
] as const;

const SLIDE_MS = 5000;

/* ──────────────────── inline CSS (keyframes + utilities) ──────────────────── */

const CSS = `
@keyframes _bar {
  0%,100%{ background-position:0% 50%; }
  50%    { background-position:100% 50%; }
}
@keyframes _shimmer {
  0%      { transform:translateX(-100%); }
  60%,100%{ transform:translateX(100%); }
}
@keyframes _prog {
  from{ width:0%; } to{ width:100%; }
}
@keyframes _kb1 {
  from{ transform:scale(1)    translate(0%,0%);   }
  to  { transform:scale(1.08) translate(-1%,-.5%); }
}
@keyframes _kb2 {
  from{ transform:scale(1.06) translate(1%,0%); }
  to  { transform:scale(1)    translate(0%,1%); }
}

/* accent bar */
.l-bar {
  background:linear-gradient(90deg,
    hsl(var(--primary)),
    hsl(var(--brand-blue-500)),
    hsl(var(--brand-orange-500)),
    hsl(var(--brand-blue-500)),
    hsl(var(--primary)));
  background-size:300% 100%;
  animation:_bar 4s ease infinite;
}

/* shimmer button overlay */
.l-shimmer::after {
  content:'';
  position:absolute;inset:0;
  background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.18) 50%,transparent 100%);
  transform:translateX(-100%);
  animation:_shimmer 2.6s ease infinite;
  pointer-events:none;
}

/* gradient focus ring */
.l-ring-wrap:focus-within .l-ring { opacity:1; }
.l-ring {
  position:absolute;inset:0;border-radius:.875rem;
  opacity:0;transition:opacity .22s ease;
  background:linear-gradient(90deg,
    hsl(var(--primary)),
    hsl(var(--brand-blue-500)),
    hsl(var(--brand-orange-500)),
    hsl(var(--brand-blue-500)),
    hsl(var(--primary)));
  background-size:300% 100%;
  animation:_bar 3s ease infinite;
  pointer-events:none;
}

/* slides — Ken Burns only on the visible photo so idle slides stay still */
.l-slide {
  position:absolute;inset:0;overflow:hidden;
  opacity:0;transition:opacity 1.3s cubic-bezier(.4,0,.2,1);
}
.l-slide.on{ opacity:1; }
.l-slide img {
  width:100%;height:100%;object-fit:cover;object-position:center;
  transform:scale(1.02);
}
.l-slide.on img {
  animation:_kb1 14s ease-in-out infinite alternate;
}
.l-slide.on:nth-child(even) img { animation-name:_kb2; }

/* solid field fill so autofill / theme never go white-on-white */
.l-field input:-webkit-autofill,
.l-field input:-webkit-autofill:hover,
.l-field input:-webkit-autofill:focus {
  -webkit-text-fill-color:hsl(var(--foreground));
  caret-color:hsl(var(--foreground));
  box-shadow:0 0 0 1000px hsl(var(--muted)) inset;
  transition:background-color 9999s ease-out;
}

/* progress bar */
.l-prog{ animation:_prog linear forwards; }

@media (prefers-reduced-motion:reduce) {
  .l-bar,.l-shimmer::after,.l-ring,.l-prog,.l-slide.on img { animation:none !important; }
  .l-slide { transition:none; }
}
`;

/* ──────────────────── floating label input ──────────────────── */

function FloatInput({
  id,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;
  return (
    <div className="l-ring-wrap relative">
      <div className="l-ring" aria-hidden />
      <div
        className={cn(
          "l-field relative z-10 m-[1.5px] overflow-hidden rounded-[13px]",
          "bg-muted dark:bg-muted/55",
          "border border-border transition-colors",
        )}
      >
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute left-4 z-10 origin-left",
            "font-medium text-muted-foreground",
            "transition-all duration-200 ease-out",
            floated
              ? "top-[9px] scale-[0.72] text-[10px] font-bold uppercase tracking-[.08em] text-[hsl(var(--brand-blue-500))]"
              : "top-1/2 -translate-y-1/2 text-[14px]",
          )}
        >
          {label}
        </label>
        <input
          id={id}
          name={id === "email" ? "username" : id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder=" "
          className={cn(
            "w-full border-0 bg-transparent outline-none ring-0",
            "pe-12 ps-4 text-[14px] font-medium text-foreground caret-[hsl(var(--foreground))]",
            "transition-all duration-200",
            floated ? "pb-2 pt-6" : "py-4",
          )}
        />
        {suffix && (
          <div className="absolute inset-y-0 end-0 flex items-center pe-3">
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── main export ─────────────────────────── */

export function LoginPage() {
  const searchParams = useSearchParams();
  useExperience();
  const reduceMotion = useReducedMotion();

  /* form */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* help dialog */
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSubject, setHelpSubject] = useState("");
  const [helpName, setHelpName] = useState("");
  const [helpEmail, setHelpEmail] = useState("");
  const [helpMsg, setHelpMsg] = useState("");
  const [helpSending, setHelpSending] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const [helpErr, setHelpErr] = useState("");

  /* slideshow */
  const [slide, setSlide] = useState(0);
  const [progKey, setProgKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((n: number) => {
    setSlide(n);
    setProgKey((k) => k + 1);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => goTo((n + 1) % SLIDES.length), SLIDE_MS);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSlide((s) => {
        setProgKey((k) => k + 1);
        return (s + 1) % SLIDES.length;
      });
    }, SLIDE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* redirect */
  const safeNext = () => {
    const n = searchParams.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  };

  /* submit — same API, tokens, and error handling as the previous login */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = loginSchema.safeParse({ email, password, rememberMe: remember });
    if (!r.success) {
      setError(
        sourceText(r.error.issues[0]?.message || "Please check your input."),
      );
      return;
    }
    setLoading(true);
    try {
      await apiClient.login(r.data.email, r.data.password, r.data.rememberMe);
      await offerBrowserPasswordSave(r.data.email, r.data.password);
      window.location.href = safeNext();
    } catch (ex: any) {
      setError(
        ex?.response?.data?.message ||
          ex?.message ||
          sourceText("Unable to sign in"),
      );
      setLoading(false);
    }
  };

  /* help submit */
  const handleHelp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!helpSubject || !helpName || !helpEmail) return;
    setHelpSending(true);
    setHelpErr("");
    const website =
      (e.currentTarget.elements.namedItem("hp_website") as HTMLInputElement | null)
        ?.value ?? "";
    try {
      const res = await fetch("/api/v1/help/tickets/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: helpSubject,
          subject_key: helpSubject,
          locale: uiLocale(),
          name: helpName,
          email: helpEmail,
          message: helpMsg,
          website: "",
          hp_website: website,
        }),
      });
      if (res.status !== 201) {
        setHelpErr(sourceText("Failed to send. Please try again."));
        return;
      }
      setHelpSent(true);
    } catch {
      setHelpErr(sourceText("Failed to send. Please try again."));
    } finally {
      setHelpSending(false);
    }
  };

  const resetHelp = () => {
    setHelpOpen(false);
    setHelpSubject("");
    setHelpName("");
    setHelpEmail("");
    setHelpMsg("");
    setHelpSent(false);
    setHelpErr("");
  };

  /* animation variants — never start at opacity 0. In some browsers
   * (and when JS motion is delayed) hidden+stagger left the whole form
   * invisible while the header still painted. */
  const list = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const row = {
    hidden: { opacity: 1, y: 0 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 400, damping: 30 },
    },
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ======================================================= LEFT: FORM */}
      <section className="relative flex flex-col bg-background border-r border-border">
        {/* top bar */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <SourceText source="Home" />
          </Link>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              <LifeBuoy className="size-3.5" />
              <SourceText source="Help" />
            </button>
            <ThemeSwitch className="h-8 w-8" />
          </div>
        </div>

        {/* form */}
        <div className="flex flex-1 items-center justify-center px-8 py-10">
          <motion.div
            className="w-full max-w-[340px]"
            variants={list}
            initial={false}
            animate="show"
          >
            {/* accent bar */}
            <motion.div variants={row}>
              <div className="l-bar mb-7 h-[3px] w-12 rounded-full" />
            </motion.div>

            {/* heading */}
            <motion.div variants={row}>
              <h1 className="text-[30px] font-black tracking-[-0.045em] text-foreground">
                <SourceText source="Welcome" />
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                <SourceText source="Sign in to your operations workspace" />
              </p>
            </motion.div>

            <form method="post" action="/login" autoComplete="on" onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
              {/* email */}
              <motion.div variants={row}>
                <FloatInput
                  id="email"
                  label={sourceText("Email")}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={setEmail}
                />
              </motion.div>

              {/* password */}
              <motion.div variants={row}>
                <FloatInput
                  id="password"
                  label={sourceText("Password")}
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={sourceText(
                        showPass ? "Hide password" : "Show password",
                      )}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPass ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  }
                />
              </motion.div>

              {/* error */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    key="err"
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* remember */}
              <motion.label
                variants={row}
                className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                <SourceText source="Remember me" />
              </motion.label>

              {/* submit */}
              <motion.div variants={row} className="space-y-3 pt-1">
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className={cn(
                    "l-shimmer relative h-[52px] w-full overflow-hidden rounded-[14px]",
                    "bg-gradient-to-br from-primary to-[hsl(var(--brand-blue-600))]",
                    "font-bold text-white shadow-[0_4px_20px_hsl(var(--primary)/0.35)]",
                    "transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_8px_28px_hsl(var(--primary)/0.50)] active:translate-y-0",
                    loading && "cursor-not-allowed opacity-75",
                  )}
                >
                  {loading && (
                    <GradientSpinner size={18} className="mr-2 shrink-0" />
                  )}
                  <SourceText
                    source={loading ? "Signing in…" : "Sign in"}
                  />
                </Button>

                <Link
                  href="/forgot-password"
                  className="inline-block text-sm font-bold text-primary transition-colors hover:text-primary/70"
                >
                  <SourceText source="Forgot password?" />
                </Link>
              </motion.div>
            </form>

            <motion.p
              variants={row}
              className="mt-10 text-center text-[11px] text-muted-foreground/45"
            >
              <SourceText source="Groupe 3.R.B · Services & Operations · Morocco" />
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ===================================================== RIGHT: SLIDESHOW */}
      <section className="relative hidden overflow-hidden bg-[hsl(222_47%_8%)] lg:block">
        {/* 5 slides */}
        {SLIDES.map((s, i) => {
          const shouldLoad =
            i === slide || i === (slide + 1) % SLIDES.length;
          return (
          <div
            key={s.src}
            className={cn("l-slide", i === slide && "on")}
            aria-hidden={i !== slide}
          >
            {shouldLoad ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.src} alt="" decoding="async" />
            ) : null}
          </div>
          );
        })}

        {/* Readability: left/bottom scrim so copy stays readable on bright service photos */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "linear-gradient(90deg,rgba(6,12,28,.72) 0%,rgba(6,12,28,.40) 46%,rgba(6,12,28,.22) 100%),linear-gradient(180deg,rgba(6,12,28,.38) 0%,transparent 32%,rgba(6,12,28,.58) 100%)",
          }}
        />

        {/* dot grid texture */}
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-[0.055]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* content */}
        <div className="absolute inset-0 z-20 flex flex-col p-10 pb-24 xl:p-12 xl:pb-24">
          {/* logo */}
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/3rb-logo-icon.png"
              alt=""
              className="size-11 rounded-[13px] border border-white/20 bg-black/40 object-contain p-1 backdrop-blur-sm"
            />
            <div>
              <p className="text-[15px] font-black leading-none text-white">
                Groupe 3.R.B
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[.16em] text-white/55">
                <SourceText source="Services and operations" />
              </p>
            </div>
          </div>

          <div className="mt-auto max-w-[400px] space-y-8">
          {/* animated quote */}
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
              }}
              exit={
                reduceMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 0,
                      y: -12,
                      transition: { duration: 0.3 },
                    }
              }
              className="max-w-[380px]"
            >
              <p className="text-[27px] font-black leading-[1.12] tracking-[-0.04em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,.55),0_10px_28px_rgba(0,0,0,.45)]">
                <SourceText source={SLIDES[slide].quote} />
              </p>
              <p
                className="text-[27px] font-black leading-[1.12] tracking-[-0.04em] [text-shadow:0_8px_24px_rgba(0,0,0,.35)]"
                style={{
                  background:
                    "linear-gradient(90deg,hsl(var(--brand-blue-400)),hsl(var(--brand-orange-500)))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                <SourceText source={SLIDES[slide].highlight} />
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-white/75">
                <SourceText source={SLIDES[slide].sub} />
              </p>
            </motion.div>
          </AnimatePresence>

          {/* feature pills */}
          <div className="space-y-2.5">
            {FEATURES.map(({ Icon, text }, i) => (
              <motion.div
                key={text}
                initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.1 + i * 0.08,
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.11] bg-white/[0.07] px-4 py-2.5 backdrop-blur-md"
              >
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Icon
                    className="size-4 text-[hsl(var(--brand-blue-400))]"
                    aria-hidden
                  />
                </span>
                <p className="text-[13px] font-semibold leading-snug text-white/88">
                  <SourceText source={text} />
                </p>
              </motion.div>
            ))}
          </div>
          </div>
        </div>

        {/* dot indicators */}
        <div className="absolute bottom-10 right-12 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo((slide - 1 + SLIDES.length) % SLIDES.length)}
            aria-label={sourceText("Previous slide")}
            className="grid size-7 place-items-center rounded-full bg-white/10 text-white/60 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
          >
            <ChevronLeft className="size-3.5" />
          </button>

          {SLIDES.map((s, i) => (
            <button
              type="button"
              key={s.src}
              onClick={() => goTo(i)}
              className={cn(
                "h-[5px] rounded-full transition-all duration-500 ease-out",
                i === slide
                  ? "w-6 bg-[hsl(var(--brand-orange-500))]"
                  : "w-[5px] bg-white/30 hover:bg-white/55",
              )}
              aria-label={`Slide ${i + 1}`}
            />
          ))}

          <button
            type="button"
            onClick={() => goTo((slide + 1) % SLIDES.length)}
            aria-label={sourceText("Next slide")}
            className="grid size-7 place-items-center rounded-full bg-white/10 text-white/60 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        {/* progress bar */}
        <div className="absolute bottom-0 left-0 right-0 z-30 h-[2px] bg-white/10">
          <div
            key={progKey}
            className="l-prog h-full rounded-r-full"
            style={{
              animationDuration: `${SLIDE_MS}ms`,
              background:
                "linear-gradient(90deg, hsl(var(--brand-blue-400)), hsl(var(--brand-orange-500)))",
            }}
          />
        </div>
      </section>

      {/* ===================================================== HELP DIALOG */}
      <Dialog
        open={helpOpen}
        onOpenChange={(o) => {
          if (!o) resetHelp();
          else setHelpOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="size-5 text-primary" />
              <SourceText source="Need Help?" />
            </DialogTitle>
            <DialogDescription>
              <SourceText source="Send a message to the administrator and we'll get back to you." />
            </DialogDescription>
          </DialogHeader>

          {helpSent ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
                <HelpCircle className="size-6" />
              </div>
              <p className="font-semibold">{sourceText("Message sent!")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {sourceText("The administrator will review your request shortly.")}
              </p>
              <Button className="mt-4" variant="outline" onClick={resetHelp}>
                <SourceText source="Close" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleHelp} className="relative space-y-4">
              <input
                type="text"
                name="hp_website"
                className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              <div className="space-y-1.5">
                <Label htmlFor="hs">
                  <SourceText source="Email subject" />
                </Label>
                <Select value={helpSubject} onValueChange={setHelpSubject} required>
                  <SelectTrigger id="hs">
                    <SelectValue placeholder={sourceText("Choose an email subject")} />
                  </SelectTrigger>
                  <SelectContent>
                    {HELP_SUBJECT_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        <SourceText source={HELP_SUBJECT_SOURCE[key]} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hn">
                  <SourceText source="Full name *" />
                </Label>
                <Input
                  id="hn"
                  value={helpName}
                  onChange={(e) => setHelpName(e.target.value)}
                  placeholder={sourceText("Your name")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="he">
                  <SourceText source="Email address *" />
                </Label>
                <Input
                  id="he"
                  type="email"
                  value={helpEmail}
                  onChange={(e) => setHelpEmail(e.target.value)}
                    placeholder={sourceText("you@example.com")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hm">
                  <SourceText source="Message (optional)" />
                </Label>
                <Textarea
                  id="hm"
                  value={helpMsg}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setHelpMsg(e.target.value)
                  }
                  placeholder={sourceText("Describe your issue...")}
                  rows={3}
                  className="resize-none"
                />
              </div>
              {helpErr && <p className="text-sm text-destructive">{helpErr}</p>}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={resetHelp}>
                  <SourceText source="Cancel" />
                </Button>
                <Button
                  type="submit"
                  disabled={
                    helpSending || !helpSubject || !helpName || !helpEmail
                  }
                >
                  {helpSending && (
                    <GradientSpinner size={16} className="mr-2 shrink-0" />
                  )}
                  <SourceText source="Send message" />
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
