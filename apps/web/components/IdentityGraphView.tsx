"use client";

import { useMemo, useState } from "react";
import type { IdentityGraph, IdentityNode } from "@dfi/core";

const TYPE_COLOR: Record<string, string> = {
  person: "#22d3ee",
  name: "#a78bfa",
  email: "#60a5fa",
  phone: "#34d399",
  address: "#f87171",
  username: "#fbbf24",
  employer: "#f472b6",
  university: "#f472b6",
  social_profile: "#38bdf8",
  website: "#94a3b8",
  document: "#fb923c",
  domain: "#c084fc",
};

interface LaidOutNode extends IdentityNode {
  x: number;
  y: number;
  depth: number;
}

function layout(graph: IdentityGraph, width: number, height: number): LaidOutNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const adjacency = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source)!.push(e.target);
  }

  const depth = new Map<string, number>();
  const root = graph.nodes.find((n) => n.type === "person") ?? graph.nodes[0];
  if (!root) return [];
  depth.set(root.id, 0);
  const queue = [root.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, (depth.get(cur) ?? 0) + 1);
        queue.push(next);
      }
    }
  }

  const byDepth = new Map<number, IdentityNode[]>();
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? 3;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n);
  }

  const maxDepth = Math.max(...byDepth.keys(), 1);
  const ringStep = Math.min(width, height) / 2 / (maxDepth + 1);

  const laidOut: LaidOutNode[] = [];
  for (const [d, nodes] of byDepth) {
    const r = d * ringStep;
    nodes.forEach((n, i) => {
      if (d === 0) {
        laidOut.push({ ...n, x: cx, y: cy, depth: d });
        return;
      }
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      laidOut.push({ ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), depth: d });
    });
  }
  return laidOut;
}

export default function IdentityGraphView({ graph }: { graph: IdentityGraph }) {
  const width = 900;
  const height = 620;
  const nodes = useMemo(() => layout(graph, width, height), [graph]);
  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [selected, setSelected] = useState<LaidOutNode | null>(null);

  if (graph.nodes.length <= 1) {
    return <p className="text-sm text-slate-500">No correlated entities yet — run a scan to populate the identity graph.</p>;
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-3 mb-3 text-xs text-slate-400">
        {Object.entries(TYPE_COLOR).map(([type, color]) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ background: color }} />
            {type.replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-slate-950 rounded-lg border border-slate-900">
          {graph.edges.map((e, i) => {
            const a = posById.get(e.source);
            const b = posById.get(e.target);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#334155"
                strokeWidth={Math.max(0.5, e.weight * 2)}
                opacity={Math.max(0.2, e.weight)}
              />
            );
          })}
          {nodes.map((n) => (
            <g key={n.id} onClick={() => setSelected(n)} className="cursor-pointer">
              <circle cx={n.x} cy={n.y} r={n.type === "person" ? 14 : 6 + n.weight * 6} fill={TYPE_COLOR[n.type] ?? "#94a3b8"} opacity={0.5 + n.weight * 0.5} stroke="#0f172a" strokeWidth={1.5} />
              <text x={n.x} y={n.y + (n.type === "person" ? 26 : 18)} textAnchor="middle" fontSize={10} fill="#cbd5e1" className="select-none">
                {n.label.length > 22 ? `${n.label.slice(0, 20)}…` : n.label}
              </text>
            </g>
          ))}
        </svg>
        <div className="card p-4 text-sm">
          {selected ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">{selected.type.replace(/_/g, " ")}</div>
              <div className="font-medium break-words">{selected.label}</div>
              <div className="text-xs text-slate-400">Confidence: {selected.confidence}</div>
              <div className="text-xs text-slate-500">Weight: {(selected.weight * 100).toFixed(0)}%</div>
            </div>
          ) : (
            <p className="text-slate-500">Click a node to see details. Node size/opacity reflects confidence; edge thickness reflects correlation strength.</p>
          )}
        </div>
      </div>
    </div>
  );
}
