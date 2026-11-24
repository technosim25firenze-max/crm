"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n/it";

export async function signIn(_: { error?: string } | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: t.auth.required };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: t.auth.invalid };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
