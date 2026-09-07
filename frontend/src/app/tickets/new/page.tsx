import { ClientTicketForm } from "@/components/landing/ClientTicketForm";
import Link from "next/link";

export default function PublicTicketPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/#tickets" className="text-sm font-semibold text-primary">
          ← Retour
        </Link>
        <h1 className="mt-6 text-3xl font-black tracking-tight">
          Soumettre un ticket de support
        </h1>
        <p className="mt-2 text-muted-foreground">
          Signalez un problème ou faites une demande. Aucune connexion n’est
          requise.
        </p>
        <div className="mt-8">
          <ClientTicketForm />
        </div>
      </div>
    </main>
  );
}
