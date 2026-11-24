import Link from "next/link";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Card, Input, PageHeader, Select, Tabs } from "@/components/ui";
import { EditCompanyButton } from "@/components/forms";
import { DocumentsPanel, NotesPanel, Timeline } from "@/components/panels";
import { SubmitButton } from "@/components/submit-button";
import { linkContactCompany, unlinkContactCompany } from "@/lib/actions/companies";
import { loadPeople, signDocuments } from "@/lib/people";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { Activity, Company, Doc, Note } from "@/lib/types";

type Tab = "overview" | "notes" | "documents" | "activity";
const LABELS: Record<Tab, string> = { overview: t.contacts.tabs.overview, notes: t.contacts.tabs.notes, documents: t.contacts.tabs.documents, activity: t.contacts.tabs.activity };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (["notes", "documents", "activity"] as const).find((x) => x === sp.tab) ?? "overview";
  const supabase = await createClient();
  const profile = await getProfile();
  const { data } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const co = data as Company;
  const from = `/companies/${id}`;
  const people = await loadPeople(supabase);
  const canModerate = can(profile.role, "contacts.archive");

  let body: React.ReactNode;
  if (tab === "overview") {
    const [linked, all] = await Promise.all([
      supabase.from("company_contacts").select("role,contacts(id,display_name,email)").eq("company_id", id),
      supabase.from("contacts").select("id,display_name").is("archived_at", null).order("display_name").limit(500),
    ]);
    const members = (linked.data ?? []).flatMap((x) => (x.contacts ? [{ role: x.role as string | null, c: x.contacts as unknown as { id: string; display_name: string; email: string | null } }] : []));
    body = (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <dl>
            <Row label={t.company.vat}>{co.vat_number}</Row>
            <Row label={t.company.industry}>{co.industry}</Row>
            <Row label={t.company.email}>{co.email}</Row>
            <Row label={t.company.phone}>{co.phone}</Row>
            <Row label={t.company.website}>{co.website && <a className="underline" href={co.website} target="_blank" rel="noopener noreferrer">{co.website}</a>}</Row>
            <Row label={t.company.address}>{[co.address, co.city].filter(Boolean).join(", ")}</Row>
            <Row label={t.company.size}>{co.size_category}</Row>
            <Row label={t.contacts.created}>{formatDate(co.created_at)}</Row>
          </dl>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.company.contacts}</h2>
          {members.length ? (
            <ul className="mb-3 space-y-2">
              {members.map(({ role, c }) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span><Link className="font-medium hover:underline" href={`/contacts/${c.id}`}>{c.display_name}</Link>
                    {role && <span className="block text-xs text-muted">{role}</span>}</span>
                  <form action={unlinkContactCompany.bind(null, from, c.id, id)}>
                    <button aria-label={t.common.remove} className="rounded p-1 text-muted hover:text-brand"><X size={14} /></button>
                  </form>
                </li>
              ))}
            </ul>
          ) : <p className="mb-3 text-sm text-muted">{t.company.noContacts}</p>}
          <form action={linkContactCompany.bind(null, from)} className="space-y-2">
            <input type="hidden" name="company_id" value={id} />
            <Select name="contact_id" required defaultValue="" aria-label={t.company.linkContact}>
              <option value="" disabled>{t.company.linkContact}…</option>
              {all.data?.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </Select>
            <Input name="role" placeholder={t.contacts.role} aria-label={t.contacts.role} />
            <SubmitButton variant="secondary" size="sm">{t.company.linkContact}</SubmitButton>
          </form>
        </Card>
      </div>
    );
  } else if (tab === "notes") {
    const { data: n } = await supabase.from("notes").select("id,body,author_id,created_at").eq("company_id", id).order("created_at", { ascending: false });
    body = <NotesPanel parent={{ company_id: id }} notes={(n ?? []) as Note[]} people={people} userId={profile.id} canModerate={canModerate} />;
  } else if (tab === "documents") {
    const { data: d } = await supabase.from("documents").select("id,title,category,url,storage_path,created_at").eq("company_id", id).order("created_at", { ascending: false });
    const docs = (d ?? []) as Doc[];
    body = <DocumentsPanel parent={{ company_id: id }} docs={docs} signed={await signDocuments(supabase, docs)} canModerate={canModerate} />;
  } else {
    const { data: a } = await supabase.from("activities").select("id,type,summary,created_at,actor_id").eq("company_id", id).order("created_at", { ascending: false }).limit(100);
    body = <Timeline items={(a ?? []) as Activity[]} people={people} />;
  }

  return (
    <>
      <PageHeader title={co.name} actions={<EditCompanyButton company={co} />} />
      <Tabs items={(Object.keys(LABELS) as Tab[]).map((k) => ({ href: k === "overview" ? from : `${from}?tab=${k}`, label: LABELS[k], active: tab === k }))} />
      {body}
    </>
  );
}
