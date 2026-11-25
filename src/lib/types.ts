import type { Role } from "./permissions";

export interface Profile { id: string; email: string; full_name: string | null; role: Role; active: boolean }

export interface Contact {
  id: string; first_name: string | null; last_name: string | null; display_name: string | null;
  email: string | null; phone: string | null; preferred_channel: string | null; language: string;
  city: string | null; country: string | null; job_title: string | null; kind: string; lifecycle: string;
  source: string; source_detail: string | null; campaign: string | null; attribution_status: string;
  first_seen_at: string; sim_preferences: string | null; do_not_contact: boolean;
  archived_at: string | null; merged_into: string | null; created_at: string; updated_at: string;
}

export interface Company {
  id: string; name: string; vat_number: string | null; industry: string | null; website: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null;
  size_category: string | null; archived_at: string | null; created_at: string;
}

export interface Tag { id: string; name: string; color: string | null }
export interface Note { id: string; body: string; author_id: string | null; created_at: string }
export interface Doc { id: string; title: string; category: string | null; url: string | null; storage_path: string | null; created_at: string }
export interface Activity { id: string; type: string; summary: string; created_at: string; actor_id: string | null }
export interface Consent { id: string; channel: string; status: "granted" | "withdrawn"; evidence: string | null; recorded_at: string }
