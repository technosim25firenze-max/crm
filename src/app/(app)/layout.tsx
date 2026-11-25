import { getProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { NavProvider, PageContent } from "@/components/nav-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const items: (NavItem & { show: boolean })[] = [
    { key: "dashboard", href: "/dashboard", match: ["/dashboard"], show: true },
    { key: "contacts", href: "/contacts", match: ["/contacts", "/companies", "/leads"], show: true },
    { key: "sales", href: "/sales", match: ["/sales"], show: true },
    { key: "bookings", href: "/bookings", match: ["/bookings"], show: true },
    { key: "finance", href: "/finance", match: ["/finance"], show: can(profile.role, "finance.view") },
    { key: "analytics", href: "/analytics", match: ["/analytics"], show: can(profile.role, "analytics.view") },
    { key: "settings", href: "/settings", match: ["/settings"], show: can(profile.role, "settings.view") },
  ];
  return (
    <NavProvider>
    <div className="flex min-h-screen">
      <Sidebar items={items.filter((i) => i.show)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={profile.full_name || profile.email} role={profile.role} />
        <PageContent>{children}</PageContent>
      </div>
    </div>
    </NavProvider>
  );
}
