"use client";
import { useRouter } from "next/navigation";
import { useNav } from "@/components/nav-provider";

/** Riga di tabella cliccabile ovunque; link e pulsanti al suo interno continuano a funzionare da soli. */
export function ClickRow({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const nav = useNav();
  return (
    <tr className={`cursor-pointer hover:bg-background ${className}`}
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        if ((e.target as HTMLElement).closest("a,button,input,select,textarea,[role=dialog]")) return;
        if (window.getSelection()?.toString()) return;
        if (nav) nav.go(href); else router.push(href);
      }}>
      {children}
    </tr>
  );
}
