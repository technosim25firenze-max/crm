"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { t } from "@/lib/i18n/it";

/**
 * Menu "⋯" per le azioni di un record. Il pannello è montato su document.body (non lo taglia né lo sposta nessun contenitore)
 * e si apre subito sotto il pulsante, o sopra se sotto non c'è spazio. I figli restano montati anche a menu chiuso,
 * così le finestre aperte da qui non si chiudono.
 */
export function ActionMenu({ children, size = "md" }: { children: React.ReactNode; size?: "sm" | "md" }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const open = anchor !== null;

  useLayoutEffect(() => {
    if (!anchor || !panel.current) return;
    const h = panel.current.offsetHeight, w = panel.current.offsetWidth;
    const below = anchor.bottom + 4, above = anchor.top - h - 4;
    const top = below + h > window.innerHeight - 8 && above > 8 ? above : below;
    const left = Math.min(Math.max(8, anchor.right - w), window.innerWidth - w - 8);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    const away = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!btn.current?.contains(n) && !panel.current?.contains(n)) close();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const menu = (
    <div ref={panel} role="menu" hidden={!open} onClick={() => setAnchor(null)}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: open && pos ? "visible" : "hidden" }}
      className={`fixed z-50 w-56 flex-col gap-0.5 rounded-card border border-border bg-surface p-1.5 shadow-pop ${open ? "flex" : "hidden"}`}>
      {children}
    </div>
  );
  return (
    <>
      <button ref={btn} type="button" aria-label={t.common.actions} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setAnchor(open ? null : e.currentTarget.getBoundingClientRect()); }}
        className={`${dim} inline-flex shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-background hover:text-foreground ${size === "md" ? "border border-border bg-surface shadow-card" : ""}`}>
        <MoreHorizontal size={18} />
      </button>
      {mounted ? createPortal(menu, document.body) : null}
    </>
  );
}

/** Voce di menu per azioni semplici (dentro un <form action>). */
export const menuItemClass = "inline-flex h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-foreground hover:bg-background disabled:opacity-50";
