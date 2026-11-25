import { createClient } from "@/lib/supabase/server";
import { getProfile, requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { setPlatformPayments } from "@/lib/actions/config";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.settings.integrations };

export default async function IntegrationsPage() {
  await requirePermission("settings.view");
  const me = await getProfile();
  const supabase = await createClient();
  const [{ data: settings }, { data: last }, { data: lastStripe }, { data: lastLead }] = await Promise.all([
    supabase.from("organization_settings").select("import_platform_payments").single(),
    supabase.from("webhook_events").select("received_at,status").eq("provider", "bookings").order("received_at", { ascending: false }).limit(1),
    supabase.from("webhook_events").select("received_at,status").eq("provider", "stripe").order("received_at", { ascending: false }).limit(1),
    supabase.from("webhook_events").select("received_at,status").eq("provider", "meta_leads").order("received_at", { ascending: false }).limit(1),
  ]);

  const stripeOn = !!process.env.STRIPE_WEBHOOK_SECRET;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const secret = process.env.BOOKINGS_WEBHOOK_SECRET;
  const leadSecret = process.env.LEADS_WEBHOOK_SECRET || secret;
  const leadsBase = `${site}/api/webhooks/leads`;
  const base = `${site}/api/webhooks/bookings`;
  const owner = can(me.role, "users.manage");
  const local = /localhost|127\.0\.0\.1/.test(site);
  const platformOn = settings?.import_platform_payments ?? true;
  const rows = [
    { name: "Supabase", ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL, note: process.env.SUPABASE_SERVICE_ROLE_KEY ? undefined : t.settings.adminKeyMissing },
    { name: t.settings.stripe, ok: stripeOn, note: stripeOn ? `${t.settings.stripeUrl}: ${site}/api/webhooks/stripe${lastStripe?.length ? ` · ${t.bookingsPage.lastEvent}: ${formatDateTime(lastStripe[0].received_at)}` : ` · ${t.bookingsPage.waiting}`}` : t.settings.stripeNeeds },
    { name: t.settings.meta, ok: false, note: t.settings.metaNeeds },
  ];
  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.integrationsIntro} />
      <SettingsTabs active="integrations" />
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-sm font-semibold">{t.settings.webhookTitle}</h2><p className="mt-1 text-sm text-muted">{t.settings.webhookHint}</p></div>
            <Badge tone={secret && last?.length ? "success" : "neutral"}>{last?.length ? `${t.bookingsPage.lastEvent}: ${formatDateTime(last[0].received_at)}` : t.bookingsPage.waiting}</Badge>
          </div>
          <p className="mt-3 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{base}</p>
          {local && <p className="mt-2 text-sm text-brand">{t.settings.webhookLocal}</p>}
          {!secret && <p className="mt-2 text-sm text-brand">{t.settings.webhookSecretOff}</p>}
          {secret && (owner ? (
            <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">{t.settings.webhookReveal}</summary>
              <p className="mt-2 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{base}?token={secret}</p></details>
          ) : <p className="mt-2 text-xs text-muted">{t.settings.webhookOnlyOwner}</p>)}
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
            <div><p className="text-sm font-medium">{t.settings.platformPayments}</p><p className="text-xs text-muted">{t.settings.platformPaymentsHint}</p></div>
            <form action={setPlatformPayments.bind(null, !platformOn)} className="flex items-center gap-2">
              <Badge tone={platformOn ? "success" : "neutral"}>{platformOn ? t.settings.on : t.settings.off}</Badge>
              {can(me.role, "config.manage") && <Button type="submit" size="sm" variant="secondary">{platformOn ? t.settings.turnOff : t.settings.turnOn}</Button>}
            </form>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-sm font-semibold">{t.settings.leadsTitle}</h2><p className="mt-1 text-sm text-muted">{t.settings.leadsHint}</p></div>
            <Badge tone={lastLead?.length ? "success" : "neutral"}>{lastLead?.length ? `${t.bookingsPage.lastEvent}: ${formatDateTime(lastLead[0].received_at)}` : t.bookingsPage.waiting}</Badge>
          </div>
          <p className="mt-3 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{leadsBase}</p>
          {!leadSecret && <p className="mt-2 text-sm text-brand">{t.settings.webhookSecretOff}</p>}
          {leadSecret && (owner ? (
            <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">{t.settings.webhookReveal}</summary>
              <p className="mt-2 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs">{leadsBase}?token={leadSecret}</p></details>
          ) : <p className="mt-2 text-xs text-muted">{t.settings.webhookOnlyOwner}</p>)}
        </Card>
        <Card className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div><p className="text-sm font-medium">{r.name}</p>{r.note && <p className="text-xs text-muted">{!r.ok && `${t.settings.needs}: `}{r.note}</p>}</div>
              <Badge tone={r.ok ? "success" : "neutral"}>{r.ok ? "Collegato" : t.settings.notConnected}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
