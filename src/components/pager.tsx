import { LinkButton } from "@/components/ui";
import { t } from "@/lib/i18n/it";

export function Pager({ base, page, pageSize, total, params }: { base: string; page: number; pageSize: number; total: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${base}?${sp}`;
  };
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
      <span>{page} / {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <LinkButton href={href(page - 1)} variant="secondary" size="sm">{t.common.previous}</LinkButton>}
        {page < pages && <LinkButton href={href(page + 1)} variant="secondary" size="sm">{t.common.next}</LinkButton>}
      </div>
    </div>
  );
}
