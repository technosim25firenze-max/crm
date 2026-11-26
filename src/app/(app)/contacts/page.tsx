import { ClickRow } from "@/components/click-row";
import Link from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionMenu } from "@/components/action-menu";
import { archiveContact } from "@/lib/actions/contacts";
import type { Contact } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts-tabs";
import { SearchBox } from "@/components/search-box";
import { Pager } from "@/components/pager";
import { ContactBoard } from "@/components/contact-board";
import { staleness } from "@/lib/staleness";
import { ConfirmButton, EditContactButton, NewContactButton } from "@/components/forms";
import { cleanSearch } from "@/lib/search";
import { normalizePhone } from "@/lib/phone";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.contacts.title };
const PAGE_SIZE = 25;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string; view?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = cleanSearch(sp.q);
  const board = sp.view === "board";
  const supabase = await createClient();
  const canArchive = can((await getProfile()).role, "contacts.archive");

  let query = supabase
    .from("contacts")
    .select("*,contact_tags(tags(id,name)),company_contacts(companies(id,name))", { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  query = board ? query.limit(500) : query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    const digits = normalizePhone(q);
    const parts = [`display_name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits && digits.length >= 3) parts.push(`phone_norm.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  if (sp.kind && sp.kind in t.kinds) query = query.eq("kind", sp.kind);
  const { data, count } = await query;

  return (
    <>
      <PageHeader title={t.contacts.title} actions={<NewContactButton />} />
      <ContactsTabs active="people" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SearchBox action="/contacts" q={sp.q} kind={sp.kind} withKind view={board ? "board" : undefined} />
        <div className="mb-4 flex gap-1 text-sm">
          {([["list", t.contacts.list], ["board", t.contacts.board]] as const).map(([v, label]) => (
            <Link key={v} href={`/contacts?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.kind ? { kind: sp.kind } : {}), ...(v === "board" ? { view: "board" } : {}) })}`}
              className={`rounded-control px-3 py-1.5 ${(v === "board") === board ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>{label}</Link>
          ))}
        </div>
      </div>
      {board ? (
        data?.length ? <ContactBoard initial={data.map((c) => ({ id: c.id, name: c.display_name ?? t.contacts.noName, sub: c.email ?? c.phone, lifecycle: c.lifecycle, stale: c.lifecycle === "inactive" ? null : staleness(c.last_contact_at) }))} />
          : <Card><EmptyState title={t.contacts.empty} hint={q ? undefined : t.contacts.emptyHint} /></Card>
      ) : (
      <Card>
        {data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[13px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t.contacts.title}</th>
                  <th className="px-4 py-2.5 font-medium">{t.contacts.phone}</th>
                  <th className="px-4 py-2.5 font-medium">{t.contacts.kind}</th>
                  <th className="px-4 py-2.5 font-medium">{t.contacts.tags}</th>
                  <th className="px-4 py-2.5 font-medium">{t.contacts.created}</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((c) => {
                  const tags = (c.contact_tags as unknown as { tags: { id: string; name: string } | null }[]).flatMap((x) => (x.tags ? [x.tags] : []));
                  const companies = (c.company_contacts as unknown as { companies: { id: string; name: string } | null }[]).flatMap((x) => (x.companies ? [x.companies] : []));
                  return (
                    <ClickRow key={c.id} href={`/contacts/${c.id}`}>
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">{c.display_name}</Link>
                        <div className="text-xs text-muted">
                          {companies.map((co, i) => <span key={co.id}>{i > 0 && ", "}<Link href={`/companies/${co.id}`} className="hover:underline">{co.name}</Link></span>)}
                          {companies.length > 0 && c.email && " · "}{c.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                      <td className="px-4 py-3"><Badge>{t.kinds[c.kind as keyof typeof t.kinds]}</Badge></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{tags.map((g) => <Badge key={g.id} tone="brand">{g.name}</Badge>)}</div></td>
                      <td className="px-4 py-3 text-muted">{formatDate(c.created_at)}</td>
                      <td className="px-2 py-2 text-right">
                        <ActionMenu size="sm">
                          <EditContactButton menu contact={c as unknown as Contact} />
                          {canArchive && <ConfirmButton menu label={t.common.archive} title={t.contacts.archiveTitle} body={t.contacts.archiveBody} action={archiveContact.bind(null, c.id)} />}
                        </ActionMenu>
                      </td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t.contacts.empty} hint={q ? undefined : t.contacts.emptyHint} />}
        <Pager base="/contacts" page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ q: sp.q, kind: sp.kind }} />
      </Card>
      )}
    </>
  );
}
