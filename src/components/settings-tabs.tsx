import { Tabs } from "@/components/ui";
import { t } from "@/lib/i18n/it";

export const SettingsTabs = ({ active }: { active: "users" | "pipelines" | "services" | "categories" | "integrations" | "data" }) => (
  <Tabs items={(["users", "pipelines", "services", "categories", "integrations", "data"] as const).map((k) => ({ href: `/settings/${k}`, label: t.settings[k], active: active === k }))} />
);
