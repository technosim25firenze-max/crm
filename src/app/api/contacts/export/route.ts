import { createClient } from "@/lib/supabase/server";
import { can, type Role } from "@/lib/permissions";
import { toCsv } from "@/lib/csv";
import { t } from "@/lib/i18n/it";
import { sourceLabel } from "@/lib/sources";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Accesso richiesto" } }, { status: 401 });
  const { data: p } = await supabase.from("profiles").select("role,active").eq("id", auth.user.id).single();
  if (!p?.active || !can(p.role as Role, "contacts.export")) {
    return Response.json({ error: { code: "FORBIDDEN", message: t.common.notAllowed } }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("contacts")
    .select("first_name,last_name,email,phone,city,country,kind,lifecycle,source,created_at,do_not_contact")
    .is("archived_at", null).order("created_at").limit(50000);
  if (error) return Response.json({ error: { code: "SERVER_ERROR", message: t.common.genericError } }, { status: 500 });

  const headers = ["Nome", "Cognome", "Email", "Telefono", "Città", "Paese", "Tipo", "Stato", "Origine", "Creato il", "Non contattare"];
  const rows = (data ?? []).map((c) => [c.first_name, c.last_name, c.email, c.phone, c.city, c.country,
    t.kinds[c.kind as keyof typeof t.kinds], t.lifecycle[c.lifecycle as keyof typeof t.lifecycle],
    sourceLabel(c.source), c.created_at, c.do_not_contact ? "Sì" : "No"]);
  return new Response("﻿" + toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatti-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
