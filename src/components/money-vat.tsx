"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { autoVatCents, centsToField, DEFAULT_VAT_RATE } from "@/lib/money";
import { parseEuro } from "@/lib/money";
import { formatEuro } from "@/lib/format";
import { t } from "@/lib/i18n/it";

/**
 * Importo (la nostra parte) + IVA accanto, calcolata in automatico (`rate`%: 22 per gli eventi, 0 per gli individui) e un totale sotto.
 * Modificando o cancellando l'IVA il campo si scollega dal prezzo (vuoto = nessuna IVA); "Ripristina" torna al calcolo automatico.
 * Invia `name` (netto) e `${name}_vat` (IVA): il server somma i due.
 */
export function MoneyVat({ name, label, net: initialNet = "", vat: initialVat, rate = DEFAULT_VAT_RATE, error, required, autoFocus, className }: {
  name: string; label: string; net?: string; vat?: string; rate?: number; error?: string; required?: boolean; autoFocus?: boolean; className?: string;
}) {
  const [net, setNet] = useState(initialNet);
  // `custom` = l'IVA è stata impostata a mano (o proviene da un valore salvato): non si ricalcola più da sola.
  const [custom, setCustom] = useState<string | null>(initialVat ?? null);
  const netCents = parseEuro(net);
  const auto = netCents != null ? centsToField(autoVatCents(netCents, rate)) : "";
  const vat = custom ?? auto;
  const vatCents = parseEuro(vat) ?? 0;
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${label} (${t.money.net})`} error={error}>
          <Input name={name} inputMode="decimal" placeholder="0,00" value={net} onChange={(e) => setNet(e.target.value)} required={required} autoFocus={autoFocus} />
        </Field>
        <Field label={rate > 0 ? `${t.money.vat} ${rate}%` : t.money.vat}>
          <Input name={`${name}_vat`} inputMode="decimal" placeholder="0,00" value={vat} onChange={(e) => setCustom(e.target.value)} />
        </Field>
      </div>
      <p className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{netCents != null ? `${t.money.total}: ${formatEuro(netCents + vatCents)}` : " "}</span>
        {custom !== null && custom !== auto && <button type="button" onClick={() => setCustom(null)} className="underline hover:text-foreground">{t.money.restore}</button>}
      </p>
    </div>
  );
}
