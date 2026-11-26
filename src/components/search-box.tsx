"use client";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { SearchCombo } from "@/components/search-combo";
import type { SearchScope } from "@/lib/actions/search";
import { useNav } from "@/components/nav-provider";
import { t } from "@/lib/i18n/it";

export function SearchBox({ action, q, kind, withKind, view, scope = "contacts" }: { scope?: SearchScope; action: string; q?: string; kind?: string; withKind?: boolean; view?: string }) {
  const nav = useNav();
  const router = useRouter();
  return (
    <form action={action} className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => {
      e.preventDefault();
      const params = new URLSearchParams();
      new FormData(e.currentTarget).forEach((v, k) => { if (typeof v === "string" && v.trim()) params.set(k, v.trim()); });
      const href = params.size ? `${action}?${params}` : action;
      if (nav) nav.go(href); else router.push(href);
    }}>
      {view && <input type="hidden" name="view" value={view} />}
      <SearchCombo scope={scope} defaultValue={q} className="w-full max-w-xs" inputClassName="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm placeholder:text-muted/70 focus:border-foreground/30 focus:outline-none focus:ring-4 focus:ring-foreground/5" />
      {withKind && (
        <Select name="kind" defaultValue={kind ?? ""} className="w-44" aria-label={t.contacts.kind}>
          <option value="">{t.contacts.filterAll}</option>
          {Object.entries(t.kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      )}
      <Button type="submit" variant="secondary">{t.common.search.replace("…", "")}</Button>
    </form>
  );
}
