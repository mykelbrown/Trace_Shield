"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeedType = "name" | "email" | "phone" | "address" | "username" | "domain" | "social_profile" | "employer" | "university" | "certification" | "other";

const TYPE_OPTIONS: { value: SeedType; label: string }[] = [
  { value: "name", label: "Full name" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "address", label: "Address" },
  { value: "username", label: "Username" },
  { value: "domain", label: "Domain" },
  { value: "social_profile", label: "Social profile URL" },
  { value: "employer", label: "Employer / business name" },
  { value: "university", label: "University" },
  { value: "certification", label: "Certification" },
  { value: "other", label: "Other identifier" },
];

interface Row {
  id: number;
  type: SeedType;
  value: string;
  label: string;
}

let nextId = 1;

export default function NewInvestigationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { id: nextId++, type: "name", value: "", label: "" },
    { id: nextId++, type: "email", value: "", label: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: nextId++, type: "other", value: "", label: "" }]);
  }
  function removeRow(id: number) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const seeds = rows.filter((r) => r.value.trim().length > 0).map((r) => ({ type: r.type, value: r.value.trim(), label: r.label.trim() || undefined }));
    if (seeds.length === 0) {
      setError("Add at least one identifier.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || `Investigation ${new Date().toLocaleDateString()}`, seeds, runNow: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create investigation");
      router.push(`/investigations/${json.investigation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Investigation name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Personal exposure audit — 2026"
          className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wide text-slate-500">Identifiers</label>
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap gap-2">
            <select
              value={row.type}
              onChange={(e) => updateRow(row.id, { type: e.target.value as SeedType })}
              className="rounded-md bg-slate-950 border border-slate-800 px-2 py-2 text-sm w-40"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              placeholder="Value"
              className="flex-1 min-w-[180px] rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <input
              value={row.label}
              onChange={(e) => updateRow(row.id, { label: e.target.value })}
              placeholder="Label (optional, e.g. current/previous)"
              className="w-56 rounded-md bg-slate-950 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <button type="button" onClick={() => removeRow(row.id)} className="px-2 text-slate-500 hover:text-red-400 text-sm">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addRow} className="text-sm text-cyan-400 hover:text-cyan-300">
          + Add another identifier
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold px-4 py-2 text-sm transition-colors"
        >
          {submitting ? "Running investigation…" : "Start Digital Footprint Investigation"}
        </button>
        <span className="text-xs text-slate-500">Only identifiers you enter here are investigated.</span>
      </div>
    </form>
  );
}
