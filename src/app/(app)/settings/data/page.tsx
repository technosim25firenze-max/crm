import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { CsvImport } from "@/components/csv-import";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.settings.data };

export default async function DataPage() {
  const me = await requirePermission("settings.view");
  const supabase = await createClient();
  const { data: jobs } = await supabase.from("import_jobs").select("id,filename,created_rows,skipped_rows,error_rows,created_at").order("created_at", { ascending: false }).limit(10);
  return (
    <>
      <PageHeader title={t.settings.title} />
      <SettingsTabs active="data" />
      <div className="space-y-4">
        {can(me.role, "contacts.import") && <CsvImport />}
        {can(me.role, "contacts.export") && (
          <Card className="flex items-center justify-between gap-4 p-5">
            <div><h2 className="text-sm font-semibold">{t.settings.exportTitle}</h2><p className="mt-1 text-sm text-muted">{t.settings.exportHint}</p></div>
            <LinkButton href="/api/contacts/export" variant="secondary" prefetch={false}>{t.contacts.exportCsv}</LinkButton>
          </Card>
        )}
        {!!jobs?.length && (
          <Card>
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.settings.history}</h2>
            <ul className="divide-y divide-border">
              {jobs.map((j) => (
                <li key={j.id} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                  <span>{j.filename}</span>
                  <span className="text-muted">{j.created_rows} · {j.skipped_rows} · {j.error_rows} — {formatDateTime(j.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
