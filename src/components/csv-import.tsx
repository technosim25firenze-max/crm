"use client";
import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Badge, Button, Card, Select } from "@/components/ui";
import { commitImport, previewImport } from "@/lib/actions/import";
import { guessMapping, IMPORT_FIELDS, type ImportField, type ImportRow, type RowResult } from "@/lib/import";
import { t } from "@/lib/i18n/it";

const FIELD_LABEL: Record<ImportField, string> = {
  first_name: t.contacts.firstName, last_name: t.contacts.lastName, email: t.contacts.email,
  phone: t.contacts.phone, city: t.contacts.city, company: t.contacts.company,
};

export function CsvImport() {
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | "">>({});
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rows = (): ImportRow[] => raw.map((r) => {
    const out: ImportRow = {};
    for (const h of headers) { const f = mapping[h]; if (f && r[h]) out[f] = r[h]; }
    return out;
  });
  const mapped = new Set(Object.values(mapping));

  function onFile(file: File) {
    setMessage(null); setResults(null);
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const hs = res.meta.fields ?? [];
        setFilename(file.name); setHeaders(hs); setRaw(res.data); setMapping(guessMapping(hs));
        if (res.data.length > 2000) setMessage(t.settings.tooMany);
      },
    });
  }

  function preview() {
    setMessage(null);
    start(async () => {
      const r = await previewImport(rows());
      if (r.error) setMessage(r.error); else setResults(r.results ?? null);
    });
  }
  function run() {
    start(async () => {
      const r = await commitImport(rows(), filename);
      if (r.error) setMessage(r.error);
      else { setMessage(`${t.settings.imported}: ${r.created} · ${r.skipped} ${t.settings.rowsDuplicate} · ${r.errors} ${t.settings.rowsError}`); setRaw([]); setHeaders([]); setResults(null); }
    });
  }

  const count = (s: RowResult["status"]) => results?.filter((r) => r.status === s).length ?? 0;
  const canPreview = headers.length > 0 && raw.length <= 2000 && (mapped.has("first_name") || mapped.has("last_name"));

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">{t.settings.import}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{t.settings.importHint}</p>
      <input type="file" accept=".csv,text/csv" aria-label={t.settings.chooseFile} className="block text-sm"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

      {headers.length > 0 && (
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="mb-2 text-[13px] font-medium">{t.settings.mapping}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h) => (
                <label key={h} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted">{h}</span>
                  <Select className="w-44" value={mapping[h] ?? ""} onChange={(e) => { setResults(null); setMapping({ ...mapping, [h]: e.target.value as ImportField | "" }); }}>
                    <option value="">{t.settings.skip}</option>
                    {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
                  </Select>
                </label>
              ))}
            </div>
            {!canPreview && raw.length <= 2000 && <p className="mt-2 text-xs text-brand">{t.settings.importNoMapping}</p>}
          </div>

          {results ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{count("ok")} {t.settings.rowsOk}</Badge>
                <Badge tone="warning">{count("duplicate")} {t.settings.rowsDuplicate}</Badge>
                <Badge tone="brand">{count("error")} {t.settings.rowsError}</Badge>
              </div>
              <div className="max-h-64 overflow-auto rounded-control border border-border">
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-border">
                    {rows().slice(0, 50).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                        <td className="px-3 py-1.5 text-muted">{r.email ?? r.phone ?? ""}</td>
                        <td className="px-3 py-1.5 text-right text-muted">{results[i]?.status === "ok" ? "✓" : results[i]?.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={run} disabled={pending || count("ok") === 0}>{t.settings.importRun} ({count("ok")})</Button>
            </div>
          ) : (
            <Button onClick={preview} disabled={pending || !canPreview} variant="secondary">{t.settings.preview}</Button>
          )}
        </div>
      )}
      {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    </Card>
  );
}
