import Link from "next/link";
import { computeRiskScore } from "@dfi/core";
import { getServerConfig, getServerDb } from "@/lib/server/db";
import NewInvestigationForm from "@/components/NewInvestigationForm";
import ScoreGauge from "@/components/ScoreGauge";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const db = getServerDb();
  const config = getServerConfig();
  const investigations = db.listInvestigations().map((inv) => {
    const findings = db.listFindings(inv.id);
    const risk = computeRiskScore(findings, config);
    return { inv, findingCount: findings.length, risk };
  });

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Start a Digital Footprint Investigation</h1>
        <p className="mt-1 text-slate-400 max-w-2xl text-sm">
          Enter identifiers that belong to <em>you</em>. Each one becomes an investigation seed — DFI correlates
          what it finds across search engines, breach databases, code repositories, DNS/certificate transparency,
          web archives, and public social/developer platforms, then scores your exposure.
        </p>
        <div className="mt-6">
          <NewInvestigationForm />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Investigations</h2>
        {investigations.length === 0 ? (
          <div className="card p-8 text-center text-slate-500 text-sm">
            No investigations yet. Start one above — try the bundled fictional demo identity "Alex Morgan" from{" "}
            <code>fixtures/alex-morgan.json</code> if you want to see the platform work end-to-end first.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {investigations.map(({ inv, findingCount, risk }) => (
              <Link
                key={inv.id}
                href={`/investigations/${inv.id}`}
                className="card p-5 hover:border-cyan-500/50 transition-colors flex flex-col gap-4"
              >
                <div>
                  <div className="font-medium">{inv.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {inv.seeds.length} seed{inv.seeds.length !== 1 ? "s" : ""} · {findingCount} finding{findingCount !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-slate-600">Updated {new Date(inv.updatedAt).toLocaleString()}</div>
                </div>
                <ScoreGauge label="Exposure" value={risk.exposureScore} size="sm" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
