"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import { t } from "@/lib/i18n/it";

export default function ForgotPasswordPage() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) return;
    setState("sending");
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/set-password` });
    // Stesso messaggio se l'indirizzo esiste o no: non riveliamo chi ha un account.
    setState(error && error.status !== 400 && error.status !== 422 ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rise-in rounded-modal bg-surface p-8 shadow-pop">
        <div className="mb-6 flex flex-col items-center gap-3 rounded-card bg-sidebar py-7">
          <Image src="/logo.png" alt={t.app.name} width={80} height={80} priority />
        </div>
        <h1 className="mb-2 text-xl font-semibold tracking-[-0.02em]">{t.auth.forgotTitle}</h1>
        {state === "sent" ? (
          <p role="status" className="text-sm text-muted">{t.auth.forgotSent}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted">{t.auth.forgotHint}</p>
            <Field label={t.auth.email}><Input name="email" type="email" autoComplete="email" required autoFocus /></Field>
            {state === "error" && <p role="alert" className="text-sm text-brand">{t.auth.forgotError}</p>}
            <Button type="submit" className="w-full" disabled={state === "sending"}>{t.auth.forgotSend}</Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm"><Link href="/login" className="text-muted underline hover:text-foreground">{t.auth.backToLogin}</Link></p>
      </div>
    </main>
  );
}
