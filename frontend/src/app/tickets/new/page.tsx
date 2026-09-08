import { ClientTicketForm } from "@/components/landing/ClientTicketForm";
import { SourceText } from "@/components/i18n/SourceText";
import { sourceText } from "@/lib/i18n/source-catalog";
import Link from "next/link";

export default function PublicTicketPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/#tickets" className="text-sm font-semibold text-primary">
          ← {sourceText("Back")}
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">
          <SourceText source="Submit a support ticket" />
        </h1>
        <p className="mt-2 text-muted-foreground">
          <SourceText source="Report a problem or make a request. No sign-in is required." />
        </p>
        <div className="mt-8">
          <ClientTicketForm />
        </div>
      </div>
    </main>
  );
}
