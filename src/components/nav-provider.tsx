"use client";
import { createContext, useContext, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

type Nav = { pending: boolean; target: string | null; go: (href: string) => void };
const NavContext = createContext<Nav | null>(null);

/** Navigazione con feedback immediato: `target` (la destinazione cliccata) è disponibile subito, `pending` finché il server non risponde. */
export function NavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useOptimistic<string | null>(null);
  const go = (href: string) => start(() => { setTarget(href); router.push(href); });
  return <NavContext.Provider value={{ pending, target, go }}>{children}</NavContext.Provider>;
}

/** Fuori dal provider (es. pagina di login) restituisce null e i link si comportano normalmente. */
export const useNav = () => useContext(NavContext);

/** Contenuto pagina: si attenua e mostra una barra di avanzamento mentre i nuovi dati arrivano. */
export function PageContent({ children }: { children: React.ReactNode }) {
  const nav = useNav();
  const busy = !!nav?.pending;
  return (
    <main aria-busy={busy} className="rise-in mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-10 md:py-10">
      {busy && <div className="progress-bar" aria-hidden="true" />}
      <div className={busy ? "pointer-events-none opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"}>{children}</div>
    </main>
  );
}
