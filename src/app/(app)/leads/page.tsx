import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts-tabs";
import { LeadBoard, type LeadItem } from "@/components/lead-board";
import { NewContactButton } from "@/components/forms";
import { isLeadStage } from "@/lib/leads";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.leads.title };

export default async function LeadsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("id,display_name,email,phone,lead_stage,created_at")
    .is("archived_at", null).not("lead_stage", "is", null).order("created_at", { ascending: false }).limit(500);
  const items: LeadItem[] = (data ?? []).flatMap((c) => isLeadStage(c.lead_stage)
    ? [{ id: c.id, name: c.display_name ?? t.contacts.noName, sub: c.email ?? c.phone, stage: c.lead_stage, created_at: c.created_at }] : []);
  return (
    <>
      <PageHeader title={t.contacts.title} actions={<NewContactButton />} />
      <ContactsTabs active="leads" />
      {items.length ? <LeadBoard initial={items} /> : <Card><EmptyState title={t.leads.empty} hint={t.leads.emptyHint} /></Card>}
    </>
  );
}
