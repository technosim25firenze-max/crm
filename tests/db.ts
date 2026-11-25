import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Crea un database in memoria con uno stub minimo di Supabase (auth.users, auth.uid, ruolo authenticated). */
export async function createDb() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated;
  `);
  for (const f of ["20261118000001_foundation_crm.sql", "20261120000003_bookings_webhook.sql", "20261121000004_sales_finance_marketing.sql", "20261123000005_booking_platform_manual.sql", "20261124000006_booking_test_flag.sql", "20261125000007_contact_options.sql", "20261125000008_meta_leads.sql", "20261125000009_lead_stage.sql", "20261125000010_stripe_fee.sql"]) {
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8"));
  }
  return db;
}

export async function addUser(db: PGlite, email: string) {
  const r = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return r.rows[0].id;
}

/** Esegue `fn` come utente autenticato (RLS attiva). */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
