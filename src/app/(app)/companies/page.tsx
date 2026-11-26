import { ClickRow } from "@/components/click-row";
import Link from "@/components/nav-link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionMenu } from "@/components/action-menu";
import { archiveCompany } from "@/lib/actions/companies";
import type { Company } from "@/lib/types";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ContactsTabs } from "@/components/contacts-tabs";
import { SearchBox } from "@/components/search-box";
import { Pager } from "@/components/pager";
import { ConfirmButton, EditCompanyButton, NewCompanyButton } from "@/components/forms";
import { cleanSearch } from "@/lib/search";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.contacts.companies };
const PAGE_SIZE = 25;

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = cleanSearch(sp.q);
  const supabase = await createClient();
  const canArchive = can((await getProfile()).role, "contacts.archive");
  let query = supabase.from("companies").select("*,company_contacts(count)", { count: "exact" })
    .is("archived_at", null).order("name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, count } = await query;

  return (
    <>
      <PageHeader title={t.contacts.title} actions={<NewCompanyButton />} />
      <ContactsTabs active="companies" />
      <SearchBox scope="companies" action="/companies" q={sp.q} />
      <Card>
        {data?.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-[13px] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t.company.name}</th>
                <th className="px-4 py-2.5 font-medium">{t.company.industry}</th>
                <th className="px-4 py-2.5 font-medium">{t.company.city}</th>
                <th className="px-4 py-2.5 font-medium">{t.company.contacts}</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((c) => (
                <ClickRow key={c.id} href={`/companies/${c.id}`}>
                  <td className="px-4 py-3"><Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                  <td className="px-4 py-3 text-muted">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.city ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{(c.company_contacts as unknown as { count: number }[])[0]?.count ?? 0}</td>
                  <td className="px-2 py-2 text-right">
                    <ActionMenu size="sm">
                      <EditCompanyButton menu company={c as unknown as Company} />
                      {canArchive && <ConfirmButton menu label={t.common.archive} title={t.company.archiveTitle} body={t.company.archiveBody} action={archiveCompany.bind(null, c.id)} />}
                    </ActionMenu>
                  </td>
                </ClickRow>
              ))}
            </tbody>
          </table>
        ) : <EmptyState title={t.company.empty} hint={q ? undefined : t.company.emptyHint} />}
        <Pager base="/companies" page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ q: sp.q }} />
      </Card>
    </>
  );
}
