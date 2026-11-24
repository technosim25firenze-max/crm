import type { SupabaseClient } from "@supabase/supabase-js";
import { mapEvent } from "./mapper";

export const PROVIDER = "bookings";
type Status = "processed" | "unmapped" | "failed" | "ignored";

/** Elabora un evento già salvato: mappa, applica `upsert_booking` per ogni prenotazione, aggiorna lo stato. Sicuro da ripetere. */
export async function processWebhookEvent(
  admin: SupabaseClient, ev: { id: string; payload: unknown; received_at: string; attempts: number },
): Promise<{ status: Status; bookingId?: string; error?: string }> {
  const mapped = mapEvent(ev.payload, new Date(ev.received_at));
  const finish = async (status: Status, extra: Record<string, unknown> = {}) =>
    admin.from("webhook_events").update({ status, attempts: ev.attempts + 1, processed_at: new Date().toISOString(), ...extra }).eq("id", ev.id);

  if (!mapped.ok) {
    await finish("unmapped", { last_error: mapped.reason });
    return { status: "unmapped", error: mapped.reason };
  }
  if (mapped.kind === "test") {
    await finish("ignored", { last_error: null });
    return { status: "ignored" };
  }
  let first: string | undefined;
  for (const b of mapped.bookings) {
    const { data, error } = await admin.rpc("upsert_booking", { p: { ...b, event_at: mapped.eventAt } });
    if (error) {
      await finish("failed", { last_error: error.message.slice(0, 500) });
      return { status: "failed", error: error.message };
    }
    first ??= data as string;
  }
  await finish("processed", { booking_id: first, last_error: null });
  return { status: "processed", bookingId: first };
}
