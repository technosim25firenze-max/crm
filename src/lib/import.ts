import { normalizeEmail, normalizePhone } from "./phone";

export type ImportField = "first_name" | "last_name" | "email" | "phone" | "city" | "company";

export const IMPORT_FIELDS: ImportField[] = ["first_name", "last_name", "email", "phone", "city", "company"];

const ALIASES: Record<ImportField, string[]> = {
  first_name: ["nome", "first name", "firstname", "first_name", "name"],
  last_name: ["cognome", "last name", "lastname", "last_name", "surname"],
  email: ["email", "e-mail", "mail", "posta elettronica"],
  phone: ["telefono", "cellulare", "phone", "mobile", "tel", "numero di telefono"],
  city: ["città", "citta", "city", "comune"],
  company: ["azienda", "società", "societa", "company", "ragione sociale"],
};

/** Suggerisce la mappatura colonna → campo dai nomi delle intestazioni. */
export function guessMapping(headers: string[]): Record<string, ImportField | ""> {
  const used = new Set<ImportField>();
  const out: Record<string, ImportField | ""> = {};
  for (const h of headers) {
    const key = h.trim().toLowerCase();
    const field = IMPORT_FIELDS.find((f) => !used.has(f) && ALIASES[f].includes(key));
    if (field) used.add(field);
    out[h] = field ?? "";
  }
  return out;
}

export type ImportRow = Partial<Record<ImportField, string>>;
export type RowStatus = "ok" | "duplicate" | "error";
export interface RowResult { status: RowStatus; reason?: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Classifica le righe: errore (dati non validi), duplicato (già in archivio o già visto nel file) o ok.
 * Il confronto usa email e telefono normalizzati, mai il solo nome.
 */
export function classifyRows(rows: ImportRow[], existingEmails: Set<string>, existingPhones: Set<string>): RowResult[] {
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  return rows.map((r) => {
    if (!r.first_name?.trim() && !r.last_name?.trim()) return { status: "error", reason: "Nome o cognome mancante" };
    const email = normalizeEmail(r.email);
    if (email && !EMAIL_RE.test(email)) return { status: "error", reason: "Email non valida" };
    const phone = normalizePhone(r.phone);
    if (email && existingEmails.has(email)) return { status: "duplicate", reason: "Email già presente in archivio" };
    if (phone && existingPhones.has(phone)) return { status: "duplicate", reason: "Telefono già presente in archivio" };
    if (email && seenEmails.has(email)) return { status: "duplicate", reason: "Email ripetuta nel file" };
    if (phone && seenPhones.has(phone)) return { status: "duplicate", reason: "Telefono ripetuto nel file" };
    if (email) seenEmails.add(email);
    if (phone) seenPhones.add(phone);
    return { status: "ok" };
  });
}
