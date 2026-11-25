"use client";
import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { t } from "@/lib/i18n/it";

export default function LoginPage() {
  const [state, action] = useActionState(signIn, null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rise-in rounded-modal bg-surface p-8 shadow-pop">
        <div className="mb-6 flex flex-col items-center gap-3 rounded-card bg-sidebar py-7">
          <Image src="/logo.png" alt={t.app.name} width={80} height={80} priority />
          <p className="text-sm text-white/70">{t.app.tagline}</p>
        </div>
        <h1 className="mb-5 text-xl font-semibold tracking-[-0.02em]">{t.auth.title}</h1>
        <form action={action} className="space-y-4">
          <Field label={t.auth.email}><Input name="email" type="email" autoComplete="email" required autoFocus /></Field>
          <Field label={t.auth.password}><Input name="password" type="password" autoComplete="current-password" required /></Field>
          {state?.error && <p role="alert" className="text-sm text-brand">{state.error}</p>}
          <div className="[&>button]:w-full"><SubmitButton>{t.auth.submit}</SubmitButton></div>
          <p className="text-center text-sm"><Link href="/forgot-password" className="text-muted underline hover:text-foreground">{t.auth.forgot}</Link></p>
        </form>
        <p className="mt-6 text-center text-xs text-muted">{t.auth.footer}</p>
      </div>
    </main>
  );
}
