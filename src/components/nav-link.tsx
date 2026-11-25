"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useNav } from "@/components/nav-provider";

/** Sostituisce `next/link`: stessa API, ma il clic dà subito feedback (voce attiva, barra di avanzamento). */
export default function NavLink({ onClick, href, ...props }: ComponentProps<typeof Link>) {
  const nav = useNav();
  return (
    <Link href={href} {...props} onClick={(e) => {
      onClick?.(e);
      if (!nav || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || props.target === "_blank") return;
      if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("/api")) return;
      e.preventDefault();
      nav.go(href);
    }} />
  );
}
