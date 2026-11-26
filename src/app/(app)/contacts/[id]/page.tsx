import { CompanyPicker } from "@/components/company-picker";
import { ActionMenu } from "@/components/action-menu";
import Link from "@/components/nav-link";
import { notFound } from "next/navigation";
import { Mail, Phone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Card, Input, PageHeader, Button } from "@/components/ui";
import { ConfirmButton, ConsentForm, EditContactButton } from "@/components/forms";
import { DocumentsPanel } from "@/components/panels";
import { Thread } from "@/components/thread";
import { SubmitButton } from "@/components/submit-button";
import { NewTaskButton } from "@/components/tasks";
import { LinkExistingButton, NewBookingButton } from "@/components/booking-forms";
import { NewOpportunityButton } from "@/components/opportunity-form";
import { loadBookingFormData } from "@/lib/booking-data";
import { RecordPaymentButton } from "@/components/finance-forms";
import { buildThread } from "@/lib/thread";
import { staleness } from "@/lib/staleness";
import { addContactTag, archiveContact, mergeContacts, removeContactTag, setDoNotContact } from "@/lib/actions/contacts";
import { linkContactCompany, unlinkContactCompany } from "@/lib/actions/companies";
import { findDuplicates } from "@/lib/actions/shared";
import { loadPeople, signDocuments } from "@/lib/people";
import { dealTitle, formatDate, formatDateTime, formatEuro } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import { sourceLabel } from "@/lib/sources";
import type { Activity, Consent, Contact, Doc, Note } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children || "—"}</dd>
    </div>
  );
}

/** Scheda contatto in un'unica pagina: dettagli, trattative e prenotazioni, cronologia (note, pagamenti, aggiornamenti), documenti e consensi. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getProfile();
  const finance = can(profile.role, "payments.record");

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) notFound();
  const c = contact as Contact;
  const canModerate = can(profile.role, "contacts.archive");
  const from = `/contacts/${id}`;

  const [tagsRes, linksRes, people, servicesRes, dups, companies, allTags, oppsRes, unlinkedOpps, bookingsRes, unlinkedBookings, bookingForm, notesRes, actsRes, paysRes, docsRes, consentsRes] = await Promise.all([
    supabase.from("contact_tags").select("tags(id,name)").eq("contact_id", id),
    supabase.from("company_contacts").select("role,companies(id,name)").eq("contact_id", id),
    loadPeople(supabase),
    finance ? supabase.from("services").select("id,name,vat_rate").eq("active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string; vat_rate: number }[] }),
    c.archived_at ? Promise.resolve([]) : findDuplicates(supabase, c.email, c.phone, id),
    supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
    supabase.from("tags").select("name").order("name").limit(200),
    supabase.from("opportunities").select("id,name,expected_value_cents,agreed_value_cents,kind,companies(name),pipeline_stages(name,kind)").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("opportunities").select("id,name,expected_value_cents").is("contact_id", null).order("created_at", { ascending: false }).limit(30),
    supabase.from("bookings").select("id,starts_at,service_name,resource_name,status,payment_status").eq("contact_id", id).order("starts_at", { ascending: false }).limit(50),
    supabase.from("bookings").select("id,starts_at,customer_name,customer_email,service_name").eq("is_test", false).is("contact_id", null).order("starts_at", { ascending: false }).limit(30),
    loadBookingFormData(supabase),
    supabase.from("notes").select("id,body,author_id,created_at").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("activities").select("id,type,summary,created_at,actor_id").eq("contact_id", id).order("created_at", { ascending: false }).limit(100),
    finance ? supabase.from("payments").select("id,kind,amount_cents,vat_rate,method,paid_at,reference").eq("contact_id", id).order("paid_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    supabase.from("documents").select("id,title,category,url,storage_path,created_at").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("marketing_consents").select("id,channel,status,evidence,recorded_at").eq("contact_id", id).order("recorded_at", { ascending: false }),
  ]);
  const tags = (tagsRes.data ?? []).flatMap((x) => (x.tags ? [x.tags as unknown as { id: string; name: string }] : []));
  const links = (linksRes.data ?? []).flatMap((x) => (x.companies ? [{ role: x.role as string | null, company: x.companies as unknown as { id: string; name: string } }] : []));
  const thread = buildThread({ notes: (notesRes.data ?? []) as Note[], payments: (paysRes.data ?? []) as { id: string; kind: string; amount_cents: number; method: string; paid_at: string; reference: string | null }[], activities: (actsRes.data ?? []) as Activity[] });
  const docs = (docsRes.data ?? []) as Doc[];
  const signed = await signDocuments(supabase, docs);
  const history = (consentsRes.data ?? []) as Consent[];
  const currentConsents = Object.keys(t.consents.channels).map((ch) => ({ ch, last: history.find((h) => h.channel === ch) }));
  const stale = c.archived_at ? null : staleness(c.last_contact_at);
  const preset = { id, name: c.display_name ?? t.contacts.noName };

  return (
    <>
      <PageHeader
        back={{ href: "/contacts", label: t.contacts.title }}
        title={c.display_name ?? t.contacts.noName}
        actions={<>
          <NewTaskButton revalidate={from} link={{ contact_id: id }} team={Object.entries(people).map(([pid, name]) => ({ id: pid, name }))} me={profile.id} variant="secondary" label={t.tasks.quick} />
          <EditContactButton contact={c} />
          {canModerate && !c.archived_at && <ActionMenu><ConfirmButton menu label={t.common.archive} title={t.contacts.archiveTitle} body={t.contacts.archiveBody} action={archiveContact.bind(null, id)} /></ActionMenu>}
        </>}
      />
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <Badge>{t.kinds[c.kind as keyof typeof t.kinds]}</Badge>
        {c.archived_at && <Badge tone="warning">{t.contacts.archived}</Badge>}
        {c.do_not_contact && <Badge tone="brand">{t.consents.doNotContact}</Badge>}
        {stale && <Badge tone={stale === "late" ? "brand" : "warning"}>{t.detail.stale[stale]}</Badge>}
        {c.email && <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`mailto:${c.email}`}><Mail size={14} />{c.email}</a>}
        {c.phone && <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`tel:${c.phone}`}><Phone size={14} />{c.phone}</a>}
        {c.merged_into && <Link className="underline" href={`/contacts/${c.merged_into}`}>{t.contacts.mergedNotice}</Link>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {dups.length > 0 && (
            <Card className="border-amber-300 bg-warning-soft p-4">
              <p className="text-sm font-medium">{t.contacts.duplicateTitle}</p>
              <p className="mt-1 text-sm text-muted">{t.contacts.duplicateBody}</p>
              <ul className="mt-3 space-y-2">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span><Link className="font-medium underline" href={`/contacts/${d.id}`}>{d.display_name}</Link>
                      <span className="text-muted"> {[d.email, d.phone].filter(Boolean).join(" · ")}</span></span>
                    {can(profile.role, "contacts.merge") && (
                      <ConfirmButton size="sm" variant="secondary" label={t.contacts.merge} title={t.contacts.mergeTitle}
                        body={`${t.contacts.mergeBody} (${d.display_name})`} action={mergeContacts.bind(null, id, d.id)} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <dl>
              <Row label={t.contacts.company}>{links.length ? links.map((l, i) => (
                <span key={l.company.id}>{i > 0 && ", "}<Link className="underline" href={`/companies/${l.company.id}`}>{l.company.name}</Link>{l.role && <span className="font-normal text-muted"> ({l.role})</span>}</span>
              )) : null}</Row>
              <Row label={t.contacts.city}>{[c.city, c.country].filter(Boolean).join(", ")}</Row>
              <Row label={t.contacts.lifecycle}>{t.lifecycle[c.lifecycle as keyof typeof t.lifecycle]}</Row>
              <Row label={t.contacts.source}>{sourceLabel(c.source)}</Row>
              <Row label={t.contacts.preferredChannel}>{c.preferred_channel ? t.channels[c.preferred_channel as keyof typeof t.channels] : null}</Row>
              <Row label={t.contacts.simPreferences}>{c.sim_preferences}</Row>
              <Row label={t.contacts.created}>{formatDate(c.created_at)}</Row>
            </dl>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">{t.contacts.tabs.opportunities}</h2>
              <div className="flex gap-2">
                <LinkExistingButton entity="opportunity" contactId={id} items={(unlinkedOpps.data ?? []).map((o) => ({ id: o.id, label: o.name, sub: o.expected_value_cents != null ? formatEuro(o.expected_value_cents) : undefined }))} />
                <NewOpportunityButton companies={companies.data ?? []} preset={preset} variant="secondary" />
              </div>
            </div>
            {oppsRes.data?.length ? <ul className="divide-y divide-border">{oppsRes.data.map((o) => {
              const st = o.pipeline_stages as unknown as { name: string; kind: string };
              const co = o.companies as unknown as { name: string } | null;
              const v = o.agreed_value_cents ?? o.expected_value_cents;
              return <li key={o.id}><Link href={`/sales/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-background">
                <span className="font-medium">{dealTitle(co?.name, c.display_name, o.name)}</span>
                <span className="flex items-center gap-3"><Badge tone={st.kind === "won" ? "success" : st.kind === "lost" ? "brand" : "neutral"}>{st.name}</Badge>{v != null && <span>{formatEuro(v)}</span>}</span></Link></li>;
            })}</ul> : <p className="px-5 py-6 text-center text-sm text-muted">{t.contacts.noOpps}</p>}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">{t.contacts.tabs.bookings}</h2>
              <div className="flex gap-2">
                <LinkExistingButton entity="booking" contactId={id} items={(unlinkedBookings.data ?? []).map((b) => ({ id: b.id, label: `${b.customer_name ?? "—"} · ${formatDateTime(b.starts_at)}`, sub: [b.service_name, b.customer_email].filter(Boolean).join(" · ") }))} />
                {can(profile.role, "bookings.manage") && <NewBookingButton {...bookingForm} canPay={finance} preset={preset} variant="secondary" />}
              </div>
            </div>
            {bookingsRes.data?.length ? <ul className="divide-y divide-border">{bookingsRes.data.map((b) => (
              <li key={b.id}><Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-background">
                <span>{formatDateTime(b.starts_at)}<span className="block text-xs text-muted">{[b.service_name, b.resource_name].filter(Boolean).join(" · ")}</span></span>
                <span className="flex items-center gap-2"><Badge>{t.bookingStatus[b.status as keyof typeof t.bookingStatus]}</Badge><Badge tone={b.payment_status === "paid" ? "success" : "warning"}>{t.paymentStatus[b.payment_status as keyof typeof t.paymentStatus]}</Badge></span>
              </Link></li>))}</ul> : <p className="px-5 py-6 text-center text-sm text-muted">{t.contacts.noBookings}</p>}
          </Card>

          <Thread parent={{ contact_id: id }} items={thread} people={people} userId={profile.id} canModerate={canModerate}
            actions={finance ? <RecordPaymentButton variant="secondary" services={(servicesRes.data ?? []).map((x) => ({ ...x, vat_rate: Number(x.vat_rate) }))} preset={{ contact: preset }} /> : undefined} />
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t.contacts.tags}</h2>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((g) => (
                <form key={g.id} action={removeContactTag.bind(null, id, g.id)}>
                  <Badge tone="brand" className="gap-1">{g.name}<button aria-label={t.common.remove}><X size={12} /></button></Badge>
                </form>
              ))}
            </div>
            <form action={addContactTag.bind(null, id)} className="flex gap-2">
              <Input name="name" list="tag-list" placeholder={t.contacts.addTag} aria-label={t.contacts.addTag} maxLength={40} />
              <datalist id="tag-list">{allTags.data?.map((g) => <option key={g.name} value={g.name} />)}</datalist>
              <SubmitButton variant="secondary">{t.common.add}</SubmitButton>
            </form>
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t.contacts.companiesLinked}</h2>
            {links.length > 0 && (
              <ul className="mb-3 space-y-2">
                {links.map((l) => (
                  <li key={l.company.id} className="flex items-center justify-between text-sm">
                    <span><Link className="font-medium hover:underline" href={`/companies/${l.company.id}`}>{l.company.name}</Link>
                      {l.role && <span className="block text-xs text-muted">{l.role}</span>}</span>
                    <form action={unlinkContactCompany.bind(null, from, id, l.company.id)}>
                      <button aria-label={t.common.remove} className="rounded p-1 text-muted hover:text-brand"><X size={14} /></button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={linkContactCompany.bind(null, from)} className="space-y-2">
              <input type="hidden" name="contact_id" value={id} />
              <CompanyPicker />
              <Input name="role" placeholder={t.contacts.role} aria-label={t.contacts.role} />
              <SubmitButton variant="secondary" size="sm">{t.contacts.linkCompany}</SubmitButton>
            </form>
          </Card>
          <div>
            <h2 className="mb-2 px-1 text-sm font-semibold">{t.contacts.tabs.documents}</h2>
            <DocumentsPanel parent={{ contact_id: id }} docs={docs} signed={signed} canModerate={canModerate} />
          </div>
          <Card className="p-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold">{t.consents.title}</summary>
              <ul className="mb-4 mt-3 space-y-2">
                {currentConsents.map(({ ch, last }) => (
                  <li key={ch} className="flex items-center justify-between text-sm">
                    <span>{t.consents.channels[ch as keyof typeof t.consents.channels]}</span>
                    {last ? <Badge tone={last.status === "granted" ? "success" : "brand"}>{t.consents[last.status]} · {formatDate(last.recorded_at)}</Badge>
                      : <span className="text-muted">{t.consents.never}</span>}
                  </li>
                ))}
              </ul>
              <div className="mb-4 flex items-center justify-between gap-3 rounded-control border border-border p-3">
                <div><p className="text-sm font-medium">{t.consents.doNotContact}</p><p className="text-xs text-muted">{t.consents.doNotContactHint}</p></div>
                <form action={setDoNotContact.bind(null, id, !c.do_not_contact)}>
                  <Button type="submit" size="sm" variant={c.do_not_contact ? "primary" : "secondary"}>{c.do_not_contact ? t.common.yes : t.common.no}</Button>
                </form>
              </div>
              {can(profile.role, "consents.record") ? <ConsentForm contactId={id} /> : <p className="text-sm text-muted">{t.consents.readOnly}</p>}
              <p className="mt-3 text-xs text-muted">{t.consents.note}</p>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
