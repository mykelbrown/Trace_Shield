function colorFor(value: number): string {
  if (value >= 70) return "var(--risk-critical)";
  if (value >= 40) return "var(--risk-high)";
  if (value >= 15) return "var(--risk-medium)";
  return "var(--risk-low)";
}

export default function ScoreGauge({ label, value, size = "md" }: { label: string; value: number; size?: "sm" | "md" }) {
  const color = colorFor(value);
  const radius = size === "sm" ? 26 : 40;
  const stroke = size === "sm" ? 5 : 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const dim = radius * 2 + stroke * 2;

  return (
    <div className="flex items-center gap-3">
      <svg width={dim} height={dim} className="-rotate-90 shrink-0">
        <circle cx={dim / 2} cy={dim / 2} r={radius} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth={stroke} />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <div className={size === "sm" ? "text-lg font-semibold" : "text-2xl font-bold"} style={{ color }}>
          {value}
          <span className="text-xs text-slate-500 font-normal">/100</span>
        </div>
        <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}
