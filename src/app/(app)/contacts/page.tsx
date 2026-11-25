import Link from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts-tabs";
import { SearchBox } from "@/components/search-box";
import { Pager } from "@/components/pager";
import { NewContactButton } from "@/components/forms";
import { cleanSearch } from "@/lib/search";
import { normalizePhone } from "@/lib/phone";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.contacts.title };
const PAGE_SIZE = 25;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = cleanSearch(sp.q);
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id,display_name,email,phone,kind,lifecycle,city,created_at,contact_tags(tags(id,name)),company_contacts(companies(id,name))", { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
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
      <SearchBox action="/contacts" q={sp.q} kind={sp.kind} withKind />
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((c) => {
                  const tags = (c.contact_tags as unknown as { tags: { id: string; name: string } | null }[]).flatMap((x) => (x.tags ? [x.tags] : []));
                  const companies = (c.company_contacts as unknown as { companies: { id: string; name: string } | null }[]).flatMap((x) => (x.companies ? [x.companies] : []));
                  return (
                    <tr key={c.id} className="hover:bg-background">
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t.contacts.empty} hint={q ? undefined : t.contacts.emptyHint} />}
        <Pager base="/contacts" page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ q: sp.q, kind: sp.kind }} />
      </Card>
    </>
  );
}
