"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { romeLocalToUtc } from "@/lib/format";
import { manualPaymentStatus } from "@/lib/finance";
import { t } from "@/lib/i18n/it";
import { PROVIDER, processWebhookEvent } from "@/integrations/bookings/process";
import { resolveContact } from "./contact-link";
import { euroField, grossCents, intField, vatRateOf } from "./fields";
import { errorState, findDuplicates, logActivity, parseForm, type ActionState } from "./shared";

/** Rielabora gli eventi non riconosciuti o falliti (dopo aver adattato il mapper). Solo owner/admin. */
export async function reprocessBookingEvents() {
  const me = await getProfile();
  if (!can(me.role, "settings.view")) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { data } = await admin.from("webhook_events").select("id,payload,received_at,attempts")
    .eq("provider", PROVIDER).in("status", ["unmapped", "failed"]).order("received_at").limit(200);
  for (const ev of data ?? []) await processWebhookEvent(admin, ev);
  revalidatePath("/bookings");
}

// ---------------------------------------------------------------- prenotazioni manuali
const text = (n = 300) => z.string().max(n, t.validation.tooLong).optional();
const bookingSchema = z.object({
  service_name: text(200), resource_name: text(100),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, t.validation.date),
  duration: intField(5, 1440), participants: intField(1, 1000),
  total: euroField, total_vat: euroField, paid: euroField, paid_vat: euroField,
  method: z.enum(["cash", "card_pos", "bank_transfer", "gift_card", "other"]).optional(),
  status: z.enum(["pending", "confirmed", "completed", "no_show"]).default("confirmed"),
  notes: text(2000), staff_notes: text(2000),
});

function window(startsAtLocal: string, minutes: number) {
  const start = romeLocalToUtc(startsAtLocal);
  return start ? { start, end: new Date(start.getTime() + minutes * 60_000) } : null;
}

async function overlaps(supabase: Awaited<ReturnType<typeof createClient>>, resource: string | undefined, start: Date, end: Date, excludeId?: string) {
  if (!resource) return false;
  let q = supabase.from("bookings").select("id", { count: "exact", head: true }).eq("resource_name", resource).neq("status", "cancelled")
    .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString());
  if (excludeId) q = q.neq("id", excludeId);
  return ((await q).count ?? 0) > 0;
}

export async function createManualBooking(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "bookings.manage")) return errorState(t.common.notAllowed);
  const parsed = parseForm(bookingSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const w = window(d.starts_at, d.duration ?? 60);
  if (!w) return { fieldErrors: { starts_at: t.validation.date } };
  const supabase = await createClient();
  const contact = await resolveContact(supabase, fd);
  if (contact.fieldErrors) return { fieldErrors: contact.fieldErrors };
  if (!contact.id) return { fieldErrors: { contact_id: t.validation.required } };

  const canPay = can(me.role, "payments.record");
  const total = grossCents(d.total, d.total_vat), paidGross = grossCents(d.paid, d.paid_vat);
  if (canPay && paidGross && total != null && paidGross > total) return { fieldErrors: { paid: t.bookingsPage.paidTooHigh } };
  if (canPay && d.paid && !d.method) return { fieldErrors: { method: t.validation.required } };
  if (fd.get("confirm") !== "1" && (await overlaps(supabase, d.resource_name, w.start, w.end))) return { warning: t.bookingsPage.overlapWarning };

  const { data: c } = await supabase.from("contacts").select("display_name,email,phone").eq("id", contact.id).single();
  const paid = canPay ? paidGross ?? 0 : 0;
  const { data: b, error } = await supabase.from("bookings").insert({
    source: "manual", external_id: `manual:${crypto.randomUUID()}`, contact_id: contact.id,
    customer_name: c?.display_name ?? null, customer_email: c?.email ?? null, customer_phone: c?.phone ?? null,
    service_name: d.service_name ?? null, resource_name: d.resource_name ?? null, starts_at: w.start.toISOString(), ends_at: w.end.toISOString(),
    participants: d.participants ?? null, status: d.status, total_cents: total ?? null, vat_cents: d.total === undefined ? null : d.total_vat ?? 0, paid_cents: paid,
    payment_status: manualPaymentStatus(total ?? null, paid, 0), notes: d.notes ?? null, staff_notes: d.staff_notes ?? null,
  }).select("id").single();
  if (error || !b) return errorState();
  if (paid > 0) {
    await supabase.from("payments").insert({ kind: "payment", amount_cents: paid, vat_rate: vatRateOf(d.paid ?? 0, d.paid_vat), method: d.method, paid_at: new Date().toISOString(), contact_id: contact.id, booking_id: b.id, recorded_by: me.id, reference: "Prenotazione manuale" });
  }
  await logActivity(supabase, { contact_id: contact.id, type: "booking", summary: "Prenotazione creata manualmente" });
  revalidatePath("/bookings"); revalidatePath("/dashboard"); revalidatePath(`/contacts/${contact.id}`); revalidatePath("/finance");
  redirect(`/bookings/${b.id}`);
}

export async function updateManualBooking(id: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (!can(me.role, "bookings.manage")) return errorState(t.common.notAllowed);
  const parsed = parseForm(bookingSchema, fd);
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const d = parsed.data;
  const w = window(d.starts_at, d.duration ?? 60);
  if (!w) return { fieldErrors: { starts_at: t.validation.date } };
  const supabase = await createClient();
  if (fd.get("confirm") !== "1" && (await overlaps(supabase, d.resource_name, w.start, w.end, id))) return { warning: t.bookingsPage.overlapWarning };
  const { data: cur } = await supabase.from("bookings").select("contact_id,paid_cents,source").eq("id", id).single();
  if (!cur || cur.source !== "manual") return errorState(t.common.notAllowed);
  const { error } = await supabase.from("bookings").update({
    service_name: d.service_name ?? null, resource_name: d.resource_name ?? null, starts_at: w.start.toISOString(), ends_at: w.end.toISOString(),
    participants: d.participants ?? null, status: d.status, total_cents: grossCents(d.total, d.total_vat) ?? null, vat_cents: d.total === undefined ? null : d.total_vat ?? 0, notes: d.notes ?? null, staff_notes: d.staff_notes ?? null,
  }).eq("id", id);
  if (error) return errorState();
  await syncManualBookingPayment(id);
  revalidatePath(`/bookings/${id}`); revalidatePath("/bookings");
  return { ok: true };
}

/** Ricalcola stato e importo pagato di una prenotazione manuale dai pagamenti registrati. */
export async function syncManualBookingPayment(bookingId: string) {
  const supabase = await createClient();
  const { data: b } = await supabase.from("bookings").select("source,total_cents").eq("id", bookingId).single();
  if (!b || b.source !== "manual") return;
  const { data: pays } = await supabase.from("payments").select("kind,amount_cents").eq("booking_id", bookingId).eq("source", "manual");
  const gross = (pays ?? []).filter((p) => p.kind === "payment").reduce((a, p) => a + p.amount_cents, 0);
  const refunds = (pays ?? []).filter((p) => p.kind === "refund").reduce((a, p) => a + p.amount_cents, 0);
  await supabase.from("bookings").update({ paid_cents: Math.max(0, gross - refunds), payment_status: manualPaymentStatus(b.total_cents, gross, refunds) }).eq("id", bookingId);
}

export async function setBookingStatus(id: string, status: "confirmed" | "completed" | "cancelled" | "no_show" | "pending") {
  const me = await getProfile();
  if (!can(me.role, "bookings.manage")) return;
  const supabase = await createClient();
  await supabase.from("bookings").update({ status }).eq("id", id).eq("source", "manual");
  revalidatePath(`/bookings/${id}`); revalidatePath("/bookings"); revalidatePath("/dashboard");
}

export async function deleteManualBooking(id: string) {
  const me = await getProfile();
  if (!can(me.role, "contacts.archive")) return;
  const supabase = await createClient();
  await supabase.from("bookings").delete().eq("id", id).eq("source", "manual");
  revalidatePath("/bookings");
  redirect("/bookings");
}

export async function saveStaffNotes(id: string, fd: FormData) {
  const me = await getProfile();
  if (!can(me.role, "bookings.manage")) return;
  const supabase = await createClient();
  await supabase.from("bookings").update({ staff_notes: String(fd.get("staff_notes") ?? "").trim().slice(0, 2000) || null }).eq("id", id);
  revalidatePath(`/bookings/${id}`);
}

// ---------------------------------------------------------------- collegamento ai contatti
export type LinkEntity = "booking" | "payment" | "opportunity" | "task";
const TABLE: Record<LinkEntity, string> = { booking: "bookings", payment: "payments", opportunity: "opportunities", task: "tasks" };
const PAGE: Record<LinkEntity, (id: string) => string> = { booking: (id) => `/bookings/${id}`, payment: () => "/finance", opportunity: (id) => `/sales/${id}`, task: () => "/sales" };

/** Collega (o ricollega) un elemento a un contatto esistente o nuovo. */
export async function linkToContact(entity: LinkEntity, id: string, _: ActionState | null, fd: FormData): Promise<ActionState> {
  const me = await getProfile();
  if (entity === "payment" && !can(me.role, "payments.record")) return errorState(t.common.notAllowed);
  const supabase = await createClient();
  const contact = await resolveContact(supabase, fd);
  if (contact.fieldErrors) return { fieldErrors: contact.fieldErrors };
  if (!contact.id) return { fieldErrors: { contact_id: t.validation.required } };
  const { error } = await supabase.from(TABLE[entity]).update({ contact_id: contact.id }).eq("id", id);
  if (error) return errorState();
  await finishLink(supabase, entity, id, contact.id);
  return { ok: true };
}

async function finishLink(supabase: Awaited<ReturnType<typeof createClient>>, entity: LinkEntity, id: string, contactId: string) {
  const label = { booking: "Prenotazione collegata", payment: "Pagamento collegato", opportunity: "Trattativa collegata", task: "Attività collegata" }[entity];
  await logActivity(supabase, { contact_id: contactId, type: "linked", summary: label });
  revalidatePath(PAGE[entity](id)); revalidatePath(`/contacts/${contactId}`); revalidatePath("/bookings"); revalidatePath("/finance"); revalidatePath("/sales");
}

/** Collega un elemento esistente a un contatto già noto (dalla scheda del contatto). */
export async function linkExistingToContact(entity: LinkEntity, contactId: string, itemId: string) {
  const me = await getProfile();
  if (entity === "payment" && !can(me.role, "payments.record")) return;
  const supabase = await createClient();
  const { error } = await supabase.from(TABLE[entity]).update({ contact_id: contactId }).eq("id", itemId);
  if (!error) await finishLink(supabase, entity, itemId, contactId);
}

/** Crea un contatto con i dati della prenotazione (nome, email, telefono) e la collega. Riusa un contatto esistente con stessa email/telefono. */
export async function createContactFromBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: b } = await supabase.from("bookings").select("customer_name,customer_email,customer_phone,attribution").eq("id", bookingId).single();
  if (!b) return;
  const dup = await findDuplicates(supabase, b.customer_email, b.customer_phone);
  let contactId = dup[0]?.id;
  if (!contactId) {
    const parts = (b.customer_name ?? "").trim().split(/\s+/);
    const { data } = await supabase.from("contacts").insert({
      first_name: parts[0] || null, last_name: parts.slice(1).join(" ") || null, email: b.customer_email, phone: b.customer_phone, source: "direct", utm: b.attribution ?? {},
    }).select("id").single();
    contactId = data?.id;
  }
  if (!contactId) return;
  await supabase.from("bookings").update({ contact_id: contactId }).eq("id", bookingId);
  await finishLink(supabase, "booking", bookingId, contactId);
}
