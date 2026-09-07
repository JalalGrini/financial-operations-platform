"use client";

/**
 * Premium login page — v2.
 *
 * Left panel: the same WebGL LiveBackground from the landing hero,
 * making the login unmistakably part of the same visual identity.
 * A dark navy overlay sits on top so the text is always readable.
 * In light mode the overlay is lighter; the shader adapts automatically.
 *
 * Right panel: clean white / dark-card form. Input fields show a
 * slow-cycling brand-gradient border ring on focus — the “two main
 * colours rolling inside the box” effect requested by the team.
 */

import { useState } from "react";
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
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  HelpCircle,
  LifeBuoy,
  ShieldCheck,
  Database,
  Gauge,
  ArrowLeft,
} from "lucide-react";
import { z } from "zod";
import { SourceText } from "@/components/i18n/SourceText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LandingExperienceControls } from "@/components/product/LandingExperienceControls";
import { LiveBackground } from "@/components/landing/LiveBackground";
import { ThemeSwitch } from "@/components/ui/theme-switch-button";
import { apiClient } from "@/lib/api";
import { useExperience } from "@/lib/experience";
import { sourceText } from "@/lib/i18n/source-catalog";
import { GradientSpinner } from "@/components/ui/gradient-spinner";

/* ------------------------------------------------------------------ schema */

const loginSchema = z.object({
  email: z.string().min(1, "Please enter your email or username"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

/* ------------------------------------------------------------------ data */

const FEATURES = [
  {
    Icon: ShieldCheck,
    text: "Secure access to group operations",
  },
  {
    Icon: Database,
    text: "Personnel, payroll, CNSS and treasury in one place",
  },
  {
    Icon: Gauge,
    text: "Live tracking of records and tickets",
  },
] as const;

/* ---------------------------------------------------------------- gradient border */

/**
 * Wraps an input in a 1.5 px animated gradient ring.
 * The gradient cycles through the three brand colours while focused.
 * When blurred, it collapses back to the standard border colour.
 */
function GradientBorderInput({
  id,
  name,
  type,
  autoComplete,
  required,
  className,
  suffix,
  hasError,
}: {
  id: string;
  name: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
  suffix?: React.ReactNode;
  hasError?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className="relative rounded-xl p-[1.5px] transition-all duration-300"
      style={{
        background: hasError
          ? "hsl(0 72% 51%)"
          : focused
          ? "linear-gradient(90deg, hsl(224,71%,45%), hsl(197,100%,41%), hsl(30,88%,51%), hsl(197,100%,41%), hsl(224,71%,45%))"
          : "hsl(220 20% 88%)",
        backgroundSize: focused && !hasError ? "300% 100%" : "100% 100%",
        animation:
          focused && !hasError ? "loginGradientSpin 2.8s linear infinite" : "none",
      }}
    >
      <div className="relative overflow-hidden rounded-[10px] bg-white dark:bg-[hsl(222,40%,12%)]">  
        <Input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          required={required}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={[
            "h-12 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
            suffix ? "pe-12" : "",
            className ?? "",
          ].join(" ")}
        />
        {suffix}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- component */

export function LoginPage() {
  const searchParams = useSearchParams();
  useExperience();

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /* help dialog state */
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpReason, setHelpReason] = useState("");
  const [helpName, setHelpName] = useState("");
  const [helpEmail, setHelpEmail] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [helpSending, setHelpSending] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const [helpError, setHelpError] = useState("");

  const handleHelpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpReason || !helpName || !helpEmail) return;
    setHelpSending(true);
    setHelpError("");
    try {
      await fetch("/api/v1/help/tickets/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: helpReason,
          name: helpName,
          email: helpEmail,
          message: helpMessage,
        }),
      });
      setHelpSent(true);
    } catch {
      setHelpError(sourceText("Failed to send. Please try again."));
    } finally {
      setHelpSending(false);
    }
  };

  const resetHelp = () => {
    setHelpOpen(false);
    setHelpReason("");
    setHelpName("");
    setHelpEmail("");
    setHelpMessage("");
    setHelpSent(false);
    setHelpError("");
  };

  const safeRedirect = () => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({
      email: event.currentTarget.email.value,
      password: event.currentTarget.password.value,
      rememberMe: event.currentTarget.rememberMe?.checked ?? false,
    });
    if (!parsed.success) {
      setError(
        sourceText(parsed.error.issues[0]?.message || "Please check your input."),
      );
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.login(
        parsed.data.email,
        parsed.data.password,
        parsed.data.rememberMe,
      );
      window.location.href = safeRedirect();
    } catch (cause: any) {
      setError(
        cause?.response?.data?.message ||
          cause?.message ||
          sourceText("Unable to sign in"),
      );
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Keyframe for the gradient border spin animation */}
      <style>{`
        @keyframes loginGradientSpin {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
        @keyframes loginPanelFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
      `}</style>

      <main className="grid min-h-screen lg:grid-cols-2">

        {/* ========================================================
            LEFT PANEL — Brand identity + WebGL background
        ======================================================== */}
        <section
          aria-hidden="true"
          className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col"
        >
          {/* WebGL background — same shader as landing hero */}
          <LiveBackground className="absolute inset-0 -z-10" intensity={1.2} interactive={false} />

          {/* Dark overlay: deep navy in dark, teal-navy in light */}
          <div
            className="absolute inset-0 -z-[5]"
            style={{
              background: "linear-gradient(160deg, hsl(224,71%,10%,0.88) 0%, hsl(197,80%,12%,0.82) 50%, hsl(224,71%,8%,0.92) 100%)",
            }}
          />
          {/* Light mode overlay — lighter teal wash */}
          <div
            className="absolute inset-0 -z-[4] dark:opacity-0 transition-opacity duration-500"
            style={{
              background: "linear-gradient(160deg, hsl(224,71%,92%,0.82) 0%, hsl(197,60%,88%,0.78) 50%, hsl(224,50%,90%,0.86) 100%)",
            }}
          />

          {/* Subtle grid dot pattern for depth */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Logo block — top centre */}
          <div className="relative z-10 flex flex-col items-center pt-16">
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-4"
            >
              {/* Logo mark */}
              <div
                className="grid size-[88px] place-items-center rounded-[24px] shadow-2xl"
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.20)",
                }}
              >
                <Image
                  src="/brand/3rb-logo.png"
                  alt="Groupe 3RB"
                  width={64}
                  height={64}
                  priority
                  className="h-[60px] w-[60px] object-contain"
                />
              </div>

              {/* Company name */}
              <div className="text-center">
                <p
                  className="text-[1.75rem] font-black tracking-[-0.04em] text-white dark:text-white"
                  style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}
                >
                  Groupe 3.R.B
                </p>
                <p
                  className="mt-1 text-[0.8125rem] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "rgba(255,255,255,0.65)" }}
                >
                  <SourceText source="Services and operations" />
                </p>
                {/* Separator dots */}
                <p
                  className="mt-1 text-[0.75rem]"
                  style={{ color: "rgba(255,255,255,0.40)" }}
                >
                  <SourceText source="Morocco · Since 2014" />
                </p>
              </div>
            </motion.div>
          </div>

          {/* Centre illustration: glowing ring around the logo */}
          <div className="relative z-10 flex flex-1 items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex h-52 w-52 items-center justify-center"
              style={{ animation: "loginPanelFloat 5s ease-in-out infinite" }}
            >
              {/* Outer ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, hsl(197,100%,41%,0.6), hsl(30,88%,51%,0.4), hsl(224,71%,60%,0.6), hsl(197,100%,41%,0.6))",
                  animation: "loginGradientSpin 6s linear infinite",
                  backgroundSize: "300% 100%",
                  filter: "blur(18px)",
                }}
              />
              {/* Inner card */}
              <div
                className="relative z-10 flex h-36 w-36 flex-col items-center justify-center rounded-[28px] text-center"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(20px)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                }}
              >
                <Image
                  src="/brand/3rb-logo.png"
                  alt=""
                  width={56}
                  height={56}
                  aria-hidden="true"
                  className="h-14 w-14 object-contain opacity-90"
                />
              </div>
            </motion.div>
          </div>

          {/* Feature pills — bottom */}
          <div className="relative z-10 w-full max-w-md self-center space-y-3 px-10 pb-14">
            {FEATURES.map(({ Icon, text }, i) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.35 + i * 0.1,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-xl"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                >
                  <Icon
                    className="size-4"
                    style={{ color: "hsl(197,100%,70%)" }}
                  />
                </span>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "rgba(255,255,255,0.88)" }}
                >
                  <SourceText source={text} />
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ========================================================
            RIGHT PANEL — Login form
        ======================================================== */}
        <section className="relative flex min-h-screen flex-col bg-white dark:bg-[hsl(222,47%,7%)]">          
          {/* Top bar */}
          <div className="flex h-16 items-center justify-between border-b border-border/60 px-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <SourceText source="Home" />
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LifeBuoy className="size-3.5" />
                <SourceText source="Help" />
              </button>
              <LandingExperienceControls />
              <ThemeSwitch />
            </div>
          </div>

          {/* Form area */}
          <div className="flex flex-1 items-center justify-center px-6 py-12">
            <div className="w-full max-w-sm">

              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Brand accent line */}
                <div
                  className="mb-6 h-1 w-10 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--brand-blue-500)))",
                  }}
                />
                <h2 className="text-[1.75rem] font-black tracking-[-0.04em] text-foreground">
                  <SourceText source="Welcome" />
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  <SourceText source="Sign in to your operations workspace" />
                </p>
              </motion.div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="mt-9 space-y-5" noValidate>

                {/* Email */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-2"
                >
                  <Label htmlFor="email" className="text-[0.8125rem] font-semibold">
                    <SourceText source="Email" />
                  </Label>
                  <GradientBorderInput
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    hasError={!!error}
                  />
                </motion.div>

                {/* Password */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-2"
                >
                  <Label htmlFor="password" className="text-[0.8125rem] font-semibold">
                    <SourceText source="Password" />
                  </Label>
                  <GradientBorderInput
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    hasError={!!error}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={sourceText(
                          showPassword ? "Hide password" : "Show password",
                        )}
                        className="absolute end-0 top-0 grid h-12 w-12 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    }
                  />
                </motion.div>

                {/* Error message */}
                <AnimatePresence>
                  {error ? (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="rounded-lg bg-destructive/8 px-3 py-2 text-sm font-medium text-destructive"
                    >
                      {error}
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                {/* Remember me */}
                <motion.label
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="flex cursor-pointer items-center gap-3 text-sm text-muted-foreground"
                >
                  <input
                    id="rememberMe"
                    name="rememberMe"
                    type="checkbox"
                    className="size-4 rounded border-input accent-[hsl(var(--primary))]"
                  />
                  <SourceText source="Remember me" />
                </motion.label>

                {/* Submit */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="space-y-3 pt-1"
                >
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isLoading}
                    className="h-12 w-full rounded-xl font-bold text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--brand-blue-500)) 100%)",
                      boxShadow: isLoading
                        ? "none"
                        : "0 4px 14px hsl(var(--primary)/0.35)",
                      transition: "box-shadow 0.2s, opacity 0.2s",
                    }}
                  >
                    {isLoading ? (
                      <GradientSpinner size={18} className="shrink-0" />
                    ) : null}
                    <SourceText source={isLoading ? "Signing in…" : "Sign in"} />
                  </Button>

                  <div className="flex items-center justify-between">
                    <Link
                      href="/forgot-password"
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      <SourceText source="Forgot password?" />
                    </Link>
                  </div>
                </motion.div>
              </form>

              {/* Footer note */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-10 text-center text-[0.75rem] text-muted-foreground/60"
              >
                <SourceText source="Groupe 3.R.B — Internal operations platform" />
              </motion.p>
            </div>
          </div>
        </section>
      </main>

      {/* ================================================== Help dialog */}
      <Dialog
        open={helpOpen}
        onOpenChange={(open: boolean) => {
          if (!open) resetHelp();
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
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
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
            <form onSubmit={handleHelpSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="help-reason">
                  <SourceText source="Reason *" />
                </Label>
                <Select value={helpReason} onValueChange={setHelpReason} required>
                  <SelectTrigger id="help-reason">
                    <SelectValue placeholder={sourceText("Select a reason")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forgot_password">
                      <SourceText source="Forgot password" />
                    </SelectItem>
                    <SelectItem value="login_issue">
                      <SourceText source="Login problem" />
                    </SelectItem>
                    <SelectItem value="access_denied">
                      <SourceText source="Access denied" />
                    </SelectItem>
                    <SelectItem value="other">
                      <SourceText source="Other" />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="help-name">
                  <SourceText source="Full name *" />
                </Label>
                <Input
                  id="help-name"
                  value={helpName}
                  onChange={(e) => setHelpName(e.target.value)}
                  placeholder={sourceText("Your name")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="help-email">
                  <SourceText source="Email address *" />
                </Label>
                <Input
                  id="help-email"
                  type="email"
                  value={helpEmail}
                  onChange={(e) => setHelpEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="help-message">
                  <SourceText source="Message (optional)" />
                </Label>
                <Textarea
                  id="help-message"
                  value={helpMessage}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setHelpMessage(e.target.value)
                  }
                  placeholder={sourceText("Describe your issue...")}
                  rows={3}
                  className="resize-none"
                />
              </div>
              {helpError && <p className="text-sm text-destructive">{helpError}</p>}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={resetHelp}>
                  <SourceText source="Cancel" />
                </Button>
                <Button
                  type="submit"
                  disabled={helpSending || !helpReason || !helpName || !helpEmail}
                >
                  {helpSending && (
                    <GradientSpinner size={16} className="me-2 shrink-0" />
                  )}
                  <SourceText source="Send message" />
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
