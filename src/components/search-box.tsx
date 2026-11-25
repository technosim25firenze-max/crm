"use client";
import { useRouter } from "next/navigation";
import { Input, Button, Select } from "@/components/ui";
import { useNav } from "@/components/nav-provider";
import { t } from "@/lib/i18n/it";

export function SearchBox({ action, q, kind, withKind }: { action: string; q?: string; kind?: string; withKind?: boolean }) {
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
      <Input name="q" defaultValue={q} placeholder={t.common.search} className="max-w-xs" aria-label={t.common.search} />
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
