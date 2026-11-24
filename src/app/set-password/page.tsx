"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setReady(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password.length < 10) return setError("La password deve avere almeno 10 caratteri.");
    if (password !== fd.get("confirm")) return setError("Le password non coincidono.");
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) { setError("Impossibile impostare la password. Richiedi un nuovo invito."); setPending(false); return; }
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rise-in rounded-modal bg-surface p-8 shadow-pop">
        <h1 className="text-lg font-semibold">Imposta la tua password</h1>
        {!ready && <p className="text-sm text-muted">Verifica dell&apos;invito in corso… Se il messaggio non scompare, apri di nuovo il link ricevuto via email.</p>}
        <Field label="Nuova password"><Input name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
        <Field label="Ripeti la password"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
        {error && <p role="alert" className="text-sm text-brand">{error}</p>}
        <Button type="submit" className="w-full" disabled={!ready || pending}>Salva password</Button>
      </form>
    </main>
  );
}
