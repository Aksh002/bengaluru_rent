"use client";

import { BarChart3, Crown, Home } from "lucide-react";
import type { PublicPin } from "@/lib/types/pins";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  notation: "compact",
});

export function LiveStatsPanel({
  pins,
  onClose,
}: {
  pins: PublicPin[];
  onClose: () => void;
}) {
  const available = pins.filter((pin) => pin.has_listing).length;
  const topRents = [...pins].sort((a, b) => b.rent - a.rent).slice(0, 5);
  const byBhk = groupAverage(pins, (pin) => `${pin.bhk}BHK`);
  const byFurnishing = groupAverage(pins, (pin) =>
    pin.furnishing === "semi"
      ? "Semi"
      : pin.furnishing === "furnished"
        ? "Furnished"
        : "Unfurnished",
  );

  return (
    <section className="command-panel absolute bottom-[7.2rem] left-3 z-20 w-[min(390px,calc(100vw-24px))] p-4 sm:bottom-5 sm:left-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white">
            <BarChart3 size={15} />
            Live stats
          </p>
          <p className="mt-1 text-xs font-semibold text-white/52">
            Current map query, {pins.length.toLocaleString("en-IN")} pins
          </p>
        </div>
        <button className="control-icon" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Pins" value={pins.length.toLocaleString("en-IN")} />
        <StatTile label="Available" value={available.toLocaleString("en-IN")} />
        <StatTile
          label="Avg rent"
          value={pins.length ? money.format(avg(pins.map((p) => p.rent))) : "—"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
            <Crown size={13} />
            Highest rents
          </p>
          <div className="space-y-2">
            {topRents.map((pin) => (
              <div
                key={pin.id}
                className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs font-bold text-white/72">
                  {pin.neighbourhood || pin.society_name || "Bengaluru"} · {pin.bhk}BHK
                </span>
                <span className="shrink-0 text-xs font-black text-[#f5a524]">
                  {money.format(pin.rent)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <AverageBlock title="Average by BHK" rows={byBhk} />
          <AverageBlock title="Average by furnishing" rows={byFurnishing} />
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-white/42">
        <Home size={13} />
        Filters and visible map area affect this view.
      </p>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.06] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function AverageBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; average: number; count: number }>;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
        {title}
      </p>
      <div className="space-y-1.5">
        {rows.slice(0, 4).map((row) => (
          <div
            key={row.name}
            className="grid grid-cols-[1fr_auto] gap-2 rounded-md bg-white/[0.04] px-3 py-2 text-xs"
          >
            <span className="font-bold text-white/68">
              {row.name} <span className="text-white/30">({row.count})</span>
            </span>
            <span className="font-black text-white">{money.format(row.average)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupAverage(
  pins: PublicPin[],
  getKey: (pin: PublicPin) => string,
) {
  const groups = new Map<string, number[]>();
  for (const pin of pins) {
    const key = getKey(pin);
    groups.set(key, [...(groups.get(key) ?? []), pin.rent]);
  }
  return Array.from(groups.entries())
    .map(([name, rents]) => ({
      name,
      average: avg(rents),
      count: rents.length,
    }))
    .sort((a, b) => b.count - a.count);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
