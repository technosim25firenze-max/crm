import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { NewServiceButton } from "@/components/new-service";
import { setServiceActive, updateService } from "@/lib/actions/config";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.settings.services };
const euro = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export default async function ServicesSettings() {
  await requirePermission("config.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("id,name,category,default_price_cents,vat_rate,duration_minutes,active").order("active", { ascending: false }).order("name");
  return (
    <>
      <PageHeader title={t.settings.title} actions={<NewServiceButton />} />
      <SettingsTabs active="services" />
      <p className="mb-3 text-sm text-muted">{t.config.pricesNote}</p>
      <Card>
        {data?.length ? (
          <ul className="divide-y divide-border">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <form action={updateService.bind(null, s.id)} className="flex flex-1 flex-wrap items-center gap-2">
                  <Input name="name" defaultValue={s.name} className="w-48" aria-label={t.config.serviceName} />
                  <Input name="category" defaultValue={s.category ?? ""} placeholder={t.config.serviceCategory} className="w-36" aria-label={t.config.serviceCategory} />
                  <Input name="price" defaultValue={euro(s.default_price_cents)} placeholder="€" inputMode="decimal" className="w-24" aria-label={t.config.servicePrice} />
                  <Input name="vat_rate" defaultValue={String(Number(s.vat_rate))} inputMode="decimal" className="w-16" aria-label={t.config.serviceVat} />
                  <Input name="duration" defaultValue={s.duration_minutes ?? ""} placeholder="min" inputMode="numeric" className="w-20" aria-label={t.config.serviceDuration} />
                  <Button type="submit" size="sm" variant="secondary">{t.common.save}</Button>
                </form>
                {!s.active && <Badge tone="warning">{t.config.serviceInactive}</Badge>}
                <form action={setServiceActive.bind(null, s.id, !s.active)}><Button type="submit" size="sm" variant="ghost">{s.active ? t.settings.deactivate : t.settings.activate}</Button></form>
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t.config.emptyServices} />}
      </Card>
    </>
  );
}
