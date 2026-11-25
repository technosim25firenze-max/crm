/** Fasi della bacheca lead, in ordine. Le etichette sono in `t.leads.stages`. */
export const LEAD_STAGES = ["to_contact", "called", "message_sent", "visit_booked", "quote_sent", "follow_up", "closed", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const isLeadStage = (v: unknown): v is LeadStage => (LEAD_STAGES as readonly string[]).includes(v as string);
