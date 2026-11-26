/** Cronologia unica di una trattativa o di un contatto: note (touchpoint), pagamenti e aggiornamenti, dal più recente. */
export type ThreadItem =
  | { id: string; at: string; kind: "note"; body: string; authorId: string | null }
  | { id: string; at: string; kind: "payment"; refund: boolean; amountCents: number; method: string; reference: string | null }
  | { id: string; at: string; kind: "event"; summary: string; actorId: string | null };

// Le attività che duplicano una nota o un pagamento già presenti nella cronologia non si ripetono.
const DUPLICATE_ACTIVITY = new Set(["note", "payment"]);

export function buildThread(input: {
  notes: { id: string; body: string; author_id: string | null; created_at: string }[];
  payments?: { id: string; kind: string; amount_cents: number; method: string; paid_at: string; reference: string | null }[];
  activities: { id: string; type: string; summary: string; created_at: string; actor_id: string | null }[];
}): ThreadItem[] {
  const items: ThreadItem[] = [
    ...input.notes.map((n): ThreadItem => ({ id: `n${n.id}`, at: n.created_at, kind: "note", body: n.body, authorId: n.author_id })),
    ...(input.payments ?? []).map((p): ThreadItem => ({ id: `p${p.id}`, at: p.paid_at, kind: "payment", refund: p.kind === "refund", amountCents: p.amount_cents, method: p.method, reference: p.reference })),
    ...input.activities.filter((a) => !DUPLICATE_ACTIVITY.has(a.type)).map((a): ThreadItem => ({ id: `a${a.id}`, at: a.created_at, kind: "event", summary: a.summary, actorId: a.actor_id })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}
