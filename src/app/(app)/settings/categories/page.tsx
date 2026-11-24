import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { createExpenseCategory, deleteExpenseCategory, deleteTag, renameTag } from "@/lib/actions/config";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.settings.categories };

export default async function CategoriesSettings() {
  await requirePermission("config.manage");
  const supabase = await createClient();
  const [{ data: cats }, { data: tags }] = await Promise.all([
    supabase.from("expense_categories").select("id,name,kind").order("name"),
    supabase.from("tags").select("id,name").order("name"),
  ]);
  return (
    <>
      <PageHeader title={t.settings.title} />
      <SettingsTabs active="categories" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.config.expenseCategories}</h2>
          <ul className="divide-y divide-border">
            {cats?.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{c.name} <Badge className="ml-1">{c.kind === "fixed" ? t.finance.fixed : t.finance.variable}</Badge></span>
                <form action={deleteExpenseCategory.bind(null, c.id)}><button aria-label={t.common.delete} className="rounded p-1.5 text-muted hover:text-brand"><Trash2 size={15} /></button></form>
              </li>
            ))}
          </ul>
          <form action={createExpenseCategory} className="flex gap-2 border-t border-border px-4 py-3">
            <Input name="name" placeholder={t.config.newCategory} required aria-label={t.config.newCategory} />
            <Select name="kind" className="w-32" aria-label={t.config.categoryKind}><option value="fixed">{t.finance.fixed}</option><option value="variable">{t.finance.variable}</option></Select>
            <Button type="submit" size="sm">{t.common.add}</Button>
          </form>
        </Card>
        <Card>
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{t.config.tagsTitle}</h2>
          {tags?.length ? (
            <ul className="divide-y divide-border">
              {tags.map((g) => (
                <li key={g.id} className="flex items-center gap-2 px-4 py-2.5">
                  <form action={renameTag.bind(null, g.id)} className="flex flex-1 gap-2">
                    <Input name="name" defaultValue={g.name} aria-label={t.config.rename} /><Button type="submit" size="sm" variant="secondary">{t.common.save}</Button>
                  </form>
                  <form action={deleteTag.bind(null, g.id)}><button aria-label={t.common.delete} className="rounded p-1.5 text-muted hover:text-brand"><Trash2 size={15} /></button></form>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-sm text-muted">{t.notes.empty}</p>}
        </Card>
      </div>
    </>
  );
}
