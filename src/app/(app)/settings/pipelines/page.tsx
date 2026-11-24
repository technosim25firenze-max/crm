import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { addStage, deleteStage, moveStage, renameStage } from "@/lib/actions/config";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.settings.pipelines };

export default async function PipelinesSettings() {
  await requirePermission("config.manage");
  const supabase = await createClient();
  const [{ data: pipes }, { data: stages }, { data: opps }] = await Promise.all([
    supabase.from("pipelines").select("id,name,kind").order("kind"),
    supabase.from("pipeline_stages").select("id,pipeline_id,name,kind,position").order("position"),
    supabase.from("opportunities").select("stage_id").limit(10000),
  ]);
  const used = new Map<string, number>();
  (opps ?? []).forEach((o) => used.set(o.stage_id, (used.get(o.stage_id) ?? 0) + 1));
  return (
    <>
      <PageHeader title={t.settings.title} />
      <SettingsTabs active="pipelines" />
      <div className="space-y-6">
        {pipes?.map((p) => {
          const list = (stages ?? []).filter((s) => s.pipeline_id === p.id);
          return (
            <Card key={p.id}>
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{p.name}</h2>
              <ul className="divide-y divide-border">
                {list.map((s, i) => {
                  const n = used.get(s.id) ?? 0;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <form action={renameStage.bind(null, s.id)} className="flex flex-1 items-center gap-2">
                        <Input name="name" defaultValue={s.name} className="max-w-xs" aria-label={t.config.stageName} />
                        <Button type="submit" size="sm" variant="secondary">{t.common.save}</Button>
                      </form>
                      <Badge tone={s.kind === "won" ? "success" : s.kind === "lost" ? "brand" : "neutral"}>{t.config.stageKinds[s.kind as keyof typeof t.config.stageKinds]}</Badge>
                      {n > 0 && <span className="text-xs text-muted" title={t.config.stageInUse}>{n}</span>}
                      <form action={moveStage.bind(null, s.id, p.id, -1)}><button disabled={i === 0} aria-label={t.config.up} className="rounded p-1.5 text-muted hover:bg-background disabled:opacity-30"><ArrowUp size={15} /></button></form>
                      <form action={moveStage.bind(null, s.id, p.id, 1)}><button disabled={i === list.length - 1} aria-label={t.config.down} className="rounded p-1.5 text-muted hover:bg-background disabled:opacity-30"><ArrowDown size={15} /></button></form>
                      <form action={deleteStage.bind(null, s.id, p.id)}><button disabled={n > 0} title={n > 0 ? t.config.stageInUse : t.config.deleteStage} aria-label={t.config.deleteStage} className="rounded p-1.5 text-muted hover:bg-background hover:text-brand disabled:opacity-30"><Trash2 size={15} /></button></form>
                    </li>
                  );
                })}
              </ul>
              <form action={addStage.bind(null, p.id)} className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
                <Input name="name" placeholder={t.config.stageName} className="max-w-xs" required aria-label={t.config.stageName} />
                <Select name="kind" defaultValue="open" className="w-36" aria-label={t.config.stageKind}>{Object.entries(t.config.stageKinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                <Button type="submit" size="sm">{t.config.addStage}</Button>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
