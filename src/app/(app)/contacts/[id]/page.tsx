import Link from "@/components/nav-link";
import { notFound } from "next/navigation";
import { Mail, Phone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Card, Input, PageHeader, Select, Tabs, Button } from "@/components/ui";
import { ConfirmButton, ConsentForm, EditContactButton } from "@/components/forms";
import { DocumentsPanel, NotesPanel, Timeline } from "@/components/panels";
import { SubmitButton } from "@/components/submit-button";
import { NewTaskButton } from "@/components/tasks";
import { LinkExistingButton, NewBookingButton } from "@/components/booking-forms";
import { NewOpportunityButton } from "@/components/opportunity-form";
import { loadBookingFormData } from "@/lib/booking-data";
import { RecordPaymentButton } from "@/components/finance-forms";
import { summarizePayments, type PaymentRow } from "@/lib/finance";
import { formatEuro } from "@/lib/format";
import { addContactTag, archiveContact, mergeContacts, removeContactTag, setDoNotContact } from "@/lib/actions/contacts";
import { linkContactCompany, unlinkContactCompany } from "@/lib/actions/companies";
import { findDuplicates } from "@/lib/actions/shared";
import { loadPeople, signDocuments } from "@/lib/people";
import { formatDate, formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n/it";
import type { Activity, Consent, Contact, Doc, Note } from "@/lib/types";

type Tab = "overview" | "opportunities" | "bookings" | "payments" | "notes" | "documents" | "consents" | "activity";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-sm last:border-0">
      <dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await getProfile();
  const finance = can(profile.role, "payments.record");
  const tab: Tab = (["opportunities", "bookings", "payments", "notes", "documents", "consents", "activity"] as const).find((x) => x === sp.tab && (x !== "payments" || finance)) ?? "overview";

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) notFound();
  const c = contact as Contact;
  const canModerate = can(profile.role, "contacts.archive");

  const [tagsRes, linksRes, people, servicesRes] = await Promise.all([
    supabase.from("contact_tags").select("tags(id,name)").eq("contact_id", id),
    supabase.from("company_contacts").select("role,companies(id,name)").eq("contact_id", id),
    loadPeople(supabase),
    finance ? supabase.from("services").select("id,name,vat_rate").eq("active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string; vat_rate: number }[] }),
  ]);
  const tags = (tagsRes.data ?? []).flatMap((x) => (x.tags ? [x.tags as unknown as { id: string; name: string }] : []));
  const links = (linksRes.data ?? []).flatMap((x) => (x.companies ? [{ role: x.role as string | null, company: x.companies as unknown as { id: string; name: string } }] : []));
  const from = `/contacts/${id}`;
  const tabHref = (k: Tab) => (k === "overview" ? from : `${from}?tab=${k}`);

  // Dati caricati solo per la scheda attiva.
  let body: React.ReactNode = null;
  if (tab === "overview") {
    const [dups, companies, allTags] = await Promise.all([
      c.archived_at ? Promise.resolve([]) : findDuplicates(supabase, c.email, c.phone, id),
      supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
      supabase.from("tags").select("name").order("name").limit(200),
    ]);
    body = (
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
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.contacts.summary}</h2>
            <dl>
              <Row label={t.contacts.city}>{[c.city, c.country].filter(Boolean).join(", ")}</Row>
              <Row label={t.contacts.jobTitle}>{c.job_title}</Row>
              <Row label={t.contacts.lifecycle}>{t.lifecycle[c.lifecycle as keyof typeof t.lifecycle]}</Row>
              <Row label={t.contacts.preferredChannel}>{c.preferred_channel ? t.channels[c.preferred_channel as keyof typeof t.channels] : null}</Row>
              <Row label={t.contacts.simPreferences}>{c.sim_preferences}</Row>
              <Row label={t.contacts.created}>{formatDate(c.created_at)}</Row>
            </dl>
          </Card>
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold">{t.contacts.acquisition}</h2>
            <dl>
              <Row label={t.contacts.source}>{t.sources[c.source as keyof typeof t.sources]}</Row>
              <Row label={t.contacts.sourceDetail}>{c.source_detail}</Row>
              <Row label={t.contacts.attribution}>{t.attribution[c.attribution_status as keyof typeof t.attribution]}</Row>
            </dl>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t.contacts.companiesLinked}</h2>
            {links.length ? (
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
            ) : <p className="mb-3 text-sm text-muted">{t.contacts.noCompanies}</p>}
            <form action={linkContactCompany.bind(null, from)} className="space-y-2">
              <input type="hidden" name="contact_id" value={id} />
              <Select name="company_id" required aria-label={t.contacts.company} defaultValue="">
                <option value="" disabled>{t.contacts.company}…</option>
                {companies.data?.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
              </Select>
              <Input name="role" placeholder={t.contacts.role} aria-label={t.contacts.role} />
              <SubmitButton variant="secondary" size="sm">{t.contacts.linkCompany}</SubmitButton>
            </form>
          </Card>
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
        </div>
      </div>
    );
  } else if (tab === "opportunities") {
    const [{ data }, { data: unlinked }, { data: cos }] = await Promise.all([
      supabase.from("opportunities").select("id,name,expected_value_cents,agreed_value_cents,created_at,kind,pipeline_stages(name,kind)").eq("contact_id", id).order("created_at", { ascending: false }),
      supabase.from("opportunities").select("id,name,expected_value_cents").is("contact_id", null).order("created_at", { ascending: false }).limit(30),
      supabase.from("companies").select("id,name").is("archived_at", null).order("name").limit(500),
    ]);
    const preset = { id, name: c.display_name ?? t.contacts.noName };
    body = (
      <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <LinkExistingButton entity="opportunity" contactId={id} items={(unlinked ?? []).map((o) => ({ id: o.id, label: o.name, sub: o.expected_value_cents != null ? formatEuro(o.expected_value_cents) : undefined }))} />
        <NewOpportunityButton kind="individual" companies={cos ?? []} preset={preset} variant="secondary" />
      </div>
      <Card>
        {data?.length ? <ul className="divide-y divide-border">{data.map((o) => {
          const st = o.pipeline_stages as unknown as { name: string; kind: string };
          const v = o.agreed_value_cents ?? o.expected_value_cents;
          return <li key={o.id}><Link href={`/sales/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-background"><span className="font-medium">{o.name}</span><span className="flex items-center gap-3"><Badge>{t.sales.kinds[o.kind as keyof typeof t.sales.kinds]}</Badge><Badge tone={st.kind === "won" ? "success" : st.kind === "lost" ? "brand" : "neutral"}>{st.name}</Badge><span className="text-muted">{v != null ? formatEuro(v) : ""}</span></span></Link></li>;
        })}</ul> : <p className="px-4 py-8 text-center text-sm text-muted">{t.contacts.noOpps}</p>}
      </Card>
      </div>
    );
  } else if (tab === "bookings") {
    const [{ data }, { data: unlinked }, form] = await Promise.all([
      supabase.from("bookings").select("id,starts_at,service_name,resource_name,status,payment_status,total_cents").eq("contact_id", id).order("starts_at", { ascending: false }).limit(100),
      supabase.from("bookings").select("id,starts_at,customer_name,customer_email,service_name").eq("is_test", false).is("contact_id", null).order("starts_at", { ascending: false }).limit(30),
      loadBookingFormData(supabase),
    ]);
    body = (
      <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <LinkExistingButton entity="booking" contactId={id} items={(unlinked ?? []).map((b) => ({ id: b.id, label: `${b.customer_name ?? "—"} · ${formatDateTime(b.starts_at)}`, sub: [b.service_name, b.customer_email].filter(Boolean).join(" · ") }))} />
        {can(profile.role, "bookings.manage") && <NewBookingButton {...form} canPay={finance} preset={{ id, name: c.display_name ?? t.contacts.noName }} variant="secondary" />}
      </div>
      <Card>
        {data?.length ? <ul className="divide-y divide-border">{data.map((b) => (
          <li key={b.id}><Link href={`/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-background">
            <span>{formatDateTime(b.starts_at)}<span className="block text-xs text-muted">{[b.service_name, b.resource_name].filter(Boolean).join(" · ")}</span></span>
            <span className="flex items-center gap-2"><Badge>{t.bookingStatus[b.status as keyof typeof t.bookingStatus]}</Badge><Badge tone={b.payment_status === "paid" ? "success" : "warning"}>{t.paymentStatus[b.payment_status as keyof typeof t.paymentStatus]}</Badge><span className="text-muted">{b.total_cents != null ? formatEuro(b.total_cents) : ""}</span></span>
          </Link></li>))}</ul> : <p className="px-4 py-8 text-center text-sm text-muted">{t.contacts.noBookings}</p>}
      </Card>
      </div>
    );
  } else if (tab === "payments") {
    const [{ data }, { data: unlinkedPays }] = await Promise.all([
      supabase.from("payments").select("id,kind,amount_cents,vat_rate,method,paid_at,reference").eq("contact_id", id).order("paid_at", { ascending: false }).limit(200),
      supabase.from("payments").select("id,amount_cents,method,paid_at,reference").is("contact_id", null).eq("kind", "payment").order("paid_at", { ascending: false }).limit(30),
    ]);
    const rows = (data ?? []) as (PaymentRow & { id: string; reference: string | null })[];
    const sum = summarizePayments(rows);
    body = (
      <div className="space-y-4">
        <div className="flex justify-end"><LinkExistingButton entity="payment" contactId={id} items={(unlinkedPays ?? []).map((p) => ({ id: p.id, label: `${formatEuro(p.amount_cents)} · ${t.finance.methods[p.method as keyof typeof t.finance.methods]}`, sub: `${formatDateTime(p.paid_at)}${p.reference ? ` · ${p.reference}` : ""}` }))} /></div>
        <Card className="grid gap-4 p-4 sm:grid-cols-2"><div><p className="text-[13px] text-muted">{t.contacts.lifetime}</p><p className="text-lg font-semibold">{formatEuro(sum.netCents)}</p></div><div><p className="text-[13px] text-muted">{t.finance.count}</p><p className="text-lg font-semibold">{sum.count}</p></div></Card>
        <Card>
          {rows.length ? <ul className="divide-y divide-border">{rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm"><span>{p.kind === "refund" ? t.finance.kindRefund : t.finance.kindPayment} · {t.finance.methods[p.method as keyof typeof t.finance.methods]}<span className="block text-xs text-muted">{formatDateTime(p.paid_at)}{p.reference ? ` · ${p.reference}` : ""}</span></span>
              <span className={p.kind === "refund" ? "text-brand" : "font-medium"}>{p.kind === "refund" ? "−" : ""}{formatEuro(p.amount_cents)}</span></li>))}</ul>
            : <p className="px-4 py-8 text-center text-sm text-muted">{t.contacts.noPayments}</p>}
        </Card>
      </div>
    );
  } else if (tab === "notes") {
    const { data } = await supabase.from("notes").select("id,body,author_id,created_at").eq("contact_id", id).order("created_at", { ascending: false });
    body = <NotesPanel parent={{ contact_id: id }} notes={(data ?? []) as Note[]} people={people} userId={profile.id} canModerate={canModerate} />;
  } else if (tab === "documents") {
    const { data } = await supabase.from("documents").select("id,title,category,url,storage_path,created_at").eq("contact_id", id).order("created_at", { ascending: false });
    const docs = (data ?? []) as Doc[];
    body = <DocumentsPanel parent={{ contact_id: id }} docs={docs} signed={await signDocuments(supabase, docs)} canModerate={canModerate} />;
  } else if (tab === "consents") {
    const { data } = await supabase.from("marketing_consents").select("id,channel,status,evidence,recorded_at").eq("contact_id", id).order("recorded_at", { ascending: false });
    const history = (data ?? []) as Consent[];
    const current = Object.keys(t.consents.channels).map((ch) => ({ ch, last: history.find((h) => h.channel === ch) }));
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.consents.title}</h2>
          <ul className="mb-4 space-y-2">
            {current.map(({ ch, last }) => (
              <li key={ch} className="flex items-center justify-between text-sm">
                <span>{t.consents.channels[ch as keyof typeof t.consents.channels]}</span>
                {last ? <Badge tone={last.status === "granted" ? "success" : "brand"}>{t.consents[last.status]} · {formatDate(last.recorded_at)}</Badge>
                  : <span className="text-muted">{t.consents.never}</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 rounded-control border border-border p-3">
            <div><p className="text-sm font-medium">{t.consents.doNotContact}</p><p className="text-xs text-muted">{t.consents.doNotContactHint}</p></div>
            <form action={setDoNotContact.bind(null, id, !c.do_not_contact)}>
              <Button type="submit" size="sm" variant={c.do_not_contact ? "primary" : "secondary"}>{c.do_not_contact ? t.common.yes : t.common.no}</Button>
            </form>
          </div>
          <p className="mt-3 text-xs text-muted">{t.consents.note}</p>
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            {can(profile.role, "consents.record") ? <ConsentForm contactId={id} /> : <p className="text-sm text-muted">{t.consents.readOnly}</p>}
          </Card>
          {history.length > 0 && (
            <Card>
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.consents.history}</h3>
              <ul className="divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="px-4 py-2.5 text-sm">
                    {t.consents.channels[h.channel as keyof typeof t.consents.channels]} · {t.consents[h.status]}
                    <span className="block text-xs text-muted">{formatDateTime(h.recorded_at)}{h.evidence ? ` · ${h.evidence}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    );
  } else {
    const { data } = await supabase.from("activities").select("id,type,summary,created_at,actor_id").eq("contact_id", id).order("created_at", { ascending: false }).limit(100);
    body = <Timeline items={(data ?? []) as Activity[]} people={people} />;
  }

  return (
    <>
      <PageHeader
        title={c.display_name ?? t.contacts.noName}
        subtitle={undefined}
        actions={<>
          <NewTaskButton revalidate={from} link={{ contact_id: id }} team={Object.entries(people).map(([pid, name]) => ({ id: pid, name }))} me={profile.id} variant="secondary" label={t.tasks.quick} />
          {finance && <RecordPaymentButton variant="secondary" services={(servicesRes.data ?? []).map((x) => ({ ...x, vat_rate: Number(x.vat_rate) }))} preset={{ contact: { id, name: c.display_name ?? t.contacts.noName } }} />}
          <EditContactButton contact={c} />
          {canModerate && !c.archived_at && <ConfirmButton label={t.common.archive} title={t.contacts.archiveTitle} body={t.contacts.archiveBody} action={archiveContact.bind(null, id)} />}
        </>}
      />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <Badge>{t.kinds[c.kind as keyof typeof t.kinds]}</Badge>
        {c.archived_at && <Badge tone="warning">{t.contacts.archived}</Badge>}
        {c.do_not_contact && <Badge tone="brand">{t.consents.doNotContact}</Badge>}
        {c.email && <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`mailto:${c.email}`}><Mail size={14} />{c.email}</a>}
        {c.phone && <a className="inline-flex items-center gap-1.5 hover:text-foreground" href={`tel:${c.phone}`}><Phone size={14} />{c.phone}</a>}
        {c.merged_into && <Link className="underline" href={`/contacts/${c.merged_into}`}>{t.contacts.mergedNotice}</Link>}
      </div>
      <Tabs items={(["overview", "opportunities", "bookings", ...(finance ? ["payments"] : []), "notes", "documents", "consents", "activity"] as Tab[]).map((k) => ({ href: tabHref(k), label: t.contacts.tabs[k], active: tab === k }))} />
      {body}
    </>
  );
}
