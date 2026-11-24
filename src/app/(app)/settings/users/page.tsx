import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { can, ROLES } from "@/lib/permissions";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui";
import { SettingsTabs } from "@/components/settings-tabs";
import { InviteUser } from "@/components/invite-user";
import { setUserActive, setUserRole } from "@/lib/actions/settings";
import { t } from "@/lib/i18n/it";

export const metadata = { title: t.settings.users };

export default async function UsersPage() {
  const me = await requirePermission("settings.view");
  const supabase = await createClient();
  const { data: users } = await supabase.from("profiles").select("id,email,full_name,role,active").order("created_at");
  const manage = can(me.role, "users.manage");

  return (
    <>
      <PageHeader title={t.settings.title} actions={manage ? <InviteUser /> : undefined} />
      <SettingsTabs active="users" />
      {!manage && <p className="mb-3 text-sm text-muted">{t.settings.onlyOwner}</p>}
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-[13px] text-muted">
            <tr><th className="px-4 py-2.5 font-medium">{t.settings.name}</th><th className="px-4 py-2.5 font-medium">{t.settings.role}</th><th className="px-4 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3"><p className="font-medium">{u.full_name ?? u.email}</p><p className="text-xs text-muted">{u.email}</p></td>
                <td className="px-4 py-3">
                  {manage ? (
                    <form action={setUserRole.bind(null, u.id)} className="flex items-center gap-2">
                      <Select name="role" defaultValue={u.role} className="w-40" aria-label={t.settings.role}>
                        {ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                      </Select>
                      <Button type="submit" size="sm" variant="secondary">{t.common.save}</Button>
                    </form>
                  ) : <Badge>{t.roles[u.role as keyof typeof t.roles]}</Badge>}
                </td>
                <td className="px-4 py-3 text-right">
                  {!u.active && <Badge tone="warning" className="mr-2">{t.settings.deactivated}</Badge>}
                  {manage && u.id !== me.id && (
                    <form action={setUserActive.bind(null, u.id, !u.active)} className="inline">
                      <Button type="submit" size="sm" variant="ghost">{u.active ? t.settings.deactivate : t.settings.activate}</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
