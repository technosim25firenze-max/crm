"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Point { label: string; value: number }

/** Grafico a barre semplice, a una serie. `euro` formatta i valori in centesimi come EUR. */
export function BarsChart({ data, euro = false, height = 220 }: { data: Point[]; euro?: boolean; height?: number }) {
  const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const full = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
  const num = new Intl.NumberFormat("it-IT");
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${euro ? full.format(d.value / 100) : num.format(d.value)}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e5e9" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#6b6b76" />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#6b6b76" width={euro ? 64 : 36} allowDecimals={false}
            tickFormatter={(v: number) => (euro ? eur.format(v / 100) : num.format(v))} />
          <Tooltip cursor={{ fill: "#f7f7f8" }} formatter={(v) => [euro ? full.format(Number(v) / 100) : num.format(Number(v)), ""]} separator="" />
          <Bar dataKey="value" fill="#e01f25" radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
