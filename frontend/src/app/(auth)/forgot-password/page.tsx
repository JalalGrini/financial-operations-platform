"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SourceText } from "@/components/i18n/SourceText";
import { offerBrowserPasswordSave } from "@/lib/browser-password";
import { sourceText } from "@/lib/i18n/source-catalog";
import { uiLocale } from "@/lib/ticket-mail";

type Step = "email" | "code" | "password";

async function postReset(path: string, body: Record<string, string>) {
  const response = await fetch(`/api/v1/auth/password-reset/${path}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { detail?: string };
  if (!response.ok) {
    throw new Error(payload.detail || "Failed to send. Please try again.");
  }
}

export default function Page() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const locale = uiLocale();

  const onEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await postReset("request", { email, locale });
      setStep("code");
    } catch (err) {
      setError(sourceText(err instanceof Error ? err.message : "Failed to send. Please try again."));
    } finally {
      setPending(false);
    }
  };

  const onCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await postReset("verify", { email, code });
      setStep("password");
    } catch (err) {
      setError(sourceText(err instanceof Error ? err.message : "That code is not valid."));
    } finally {
      setPending(false);
    }
  };

  const onPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(sourceText("Passwords do not match."));
      return;
    }
    setPending(true);
    try {
      await postReset("confirm", {
        email,
        code,
        new_password: password,
        confirm_password: confirm,
      });
      await offerBrowserPasswordSave(email, password);
      window.location.href = "/login";
    } catch (err) {
      setError(sourceText(err instanceof Error ? err.message : "Failed to send. Please try again."));
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-md space-y-6 py-12">
        <Button asChild variant="outline">
          <Link href="/login">
            <ArrowLeft className="me-2 h-4 w-4" />
            <SourceText source="Back to sign in" leading trailing />
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <SourceText source="Forgot password?" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "email" ? (
              <form onSubmit={onEmail} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <SourceText source="Enter the email you use to sign in. If it matches an account, we will send a 6-digit code." />
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">
                    <SourceText source="Email" />
                  </Label>
                  <Input
                    id="reset-email"
                    name="username"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                  <SourceText source="Send code" />
                </Button>
              </form>
            ) : null}

            {step === "code" ? (
              <form onSubmit={onCode} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <SourceText source="Enter the 6-digit code sent to your email. It is not a password." />
                </p>
                <div className="space-y-2">
                  <Label htmlFor="reset-code">
                    <SourceText source="Sign-in code" />
                  </Label>
                  <Input
                    id="reset-code"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
                  {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                  <SourceText source="Continue" />
                </Button>
              </form>
            ) : null}

            {step === "password" ? (
              <form onSubmit={onPassword} method="post" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  <SourceText source="Choose a new password for your account." />
                </p>
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={email}
                  readOnly
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <div className="space-y-2">
                  <Label htmlFor="new-password">
                    <SourceText source="New password" />
                  </Label>
                  <Input
                    id="new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">
                    <SourceText source="Confirm new password" />
                  </Label>
                  <Input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                  <SourceText source="Save password" />
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
