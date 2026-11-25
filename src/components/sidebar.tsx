"use client";
import { useState } from "react";
import NavLink from "@/components/nav-link";
import { useNav } from "@/components/nav-provider";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, ChevronsLeft, ChevronsRight, LayoutDashboard, Settings, TrendingUp, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n/it";

const ICONS = { dashboard: LayoutDashboard, contacts: Users, sales: TrendingUp, bookings: CalendarDays, finance: Wallet, analytics: BarChart3, settings: Settings };
export type NavKey = keyof typeof ICONS;
export interface NavItem { key: NavKey; href: string; match: string[] }

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const target = useNav()?.target;
  const current = target ? target.split("?")[0] : pathname;
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-white transition-[width] duration-200 ease-out md:flex", collapsed ? "w-[72px]" : "w-60")}>
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Image src="/logo.png" alt={t.app.name} width={28} height={28} />
        {!collapsed && <span className="text-sm font-semibold tracking-wide">{t.app.name}</span>}
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Principale">
        {items.map(({ key, href, match }) => {
          const Icon = ICONS[key];
          const active = match.some((m) => current === m || current.startsWith(m + "/"));
          return (
            <NavLink key={key} href={href} title={t.nav[key]} aria-current={active ? "page" : undefined}
              className={cn("flex h-10 items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150",
                active ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]" : "text-white/55 hover:bg-white/[0.04] hover:text-white")}>
              <Icon size={18} className={active ? "text-brand" : ""} />
              {!collapsed && <span>{t.nav[key]}</span>}
            </NavLink>
          );
        })}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Espandi menu" : "Comprimi menu"}
        className="m-3 flex h-9 items-center justify-center rounded-control text-white/50 hover:bg-white/5 hover:text-white">
        {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
      </button>
    </aside>
  );
}
