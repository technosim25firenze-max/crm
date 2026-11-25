import { Tabs } from "@/components/ui";
import { t } from "@/lib/i18n/it";

export const ContactsTabs = ({ active }: { active: "people" | "companies" | "leads" }) => (
  <Tabs items={[
    { href: "/contacts", label: t.contacts.people, active: active === "people" },
    { href: "/companies", label: t.contacts.companies, active: active === "companies" },
    { href: "/leads", label: t.leads.tab, active: active === "leads" },
  ]} />
);
