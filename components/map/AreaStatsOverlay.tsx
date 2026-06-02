"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { AreaRentStat, PublicPin } from "@/lib/types/pins";
import { useMapStore } from "@/store/map-store";

type NeighbourhoodStat = {
  name: string;
  count: number;
  medianByBhk: Map<number, number>;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

const formatCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  notation: "compact",
});

function computeAreaStats(
  pins: PublicPin[],
  bounds: { west: number; south: number; east: number; north: number },
): NeighbourhoodStat[] {
  // Filter to pins in viewport
  const inView = pins.filter(
    (p) =>
      p.lat >= bounds.south &&
      p.lat <= bounds.north &&
      p.lng >= bounds.west &&
      p.lng <= bounds.east &&
      p.neighbourhood,
  );

  if (inView.length < 5) return [];

  // Group by neighbourhood
  const grouped = new Map<string, PublicPin[]>();
  for (const pin of inView) {
    const name = pin.neighbourhood!;
    const arr = grouped.get(name) || [];
    arr.push(pin);
    grouped.set(name, arr);
  }

  // Compute stats
  const stats: NeighbourhoodStat[] = [];
  for (const [name, groupPins] of grouped) {
    if (groupPins.length < 2) continue;

    const medianByBhk = new Map<number, number>();
    const bhkGroups = new Map<number, number[]>();

    for (const pin of groupPins) {
      const arr = bhkGroups.get(pin.bhk) || [];
      arr.push(pin.rent);
      bhkGroups.set(pin.bhk, arr);
    }

    for (const [bhk, rents] of bhkGroups) {
      medianByBhk.set(bhk, median(rents));
    }

    stats.push({ name, count: groupPins.length, medianByBhk });
  }

  // Sort by pin count descending, take top 3
  return stats.sort((a, b) => b.count - a.count).slice(0, 3);
}

export function AreaStatsOverlay({
  pins,
  bounds,
  serverStats,
}: {
  pins: PublicPin[];
  bounds: { west: number; south: number; east: number; north: number };
  serverStats?: AreaRentStat[];
}) {
  const fallbackStats = useMemo(() => computeAreaStats(pins, bounds), [pins, bounds]);
  const stats = serverStats?.length
    ? serverStats.map((stat) => ({
        name: stat.name,
        count: stat.count,
        medianByBhk: new Map(
          stat.median_by_bhk.map((row) => [row.bhk, row.median_rent]),
        ),
      }))
    : fallbackStats;

  if (stats.length === 0) return null;

  return (
    <div className="light-glass-panel pointer-events-auto max-w-xs rounded-[18px] p-3 text-[#111827]">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#334155]/66">
        <BarChart3 size={14} />
        Area rents
      </div>
      <div className="space-y-3">
        {stats.map((stat) => (
          <div key={stat.name}>
            <p className="text-sm font-semibold leading-tight text-[#111827]">
              {stat.name}
              <span className="ml-2 text-xs font-medium text-[#334155]/58">
                {stat.count} pin{stat.count !== 1 ? "s" : ""}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {Array.from(stat.medianByBhk.entries())
                .sort(([a], [b]) => a - b)
                .map(([bhk, med]) => (
                  <span
                    key={bhk}
                    className="text-xs font-medium text-[#334155]/72"
                  >
                    <span className="font-bold text-[#9a5b00]">
                      {bhk}BHK
                    </span>{" "}
                    {formatCompact.format(med)}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
      <button
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#111827]/10 bg-white/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#1f2937]/74 transition hover:bg-white/50 hover:text-[#111827]"
        type="button"
        onClick={() => {
          // Open watchlist form at map center
          const center = {
            lat: (bounds.south + bounds.north) / 2,
            lng: (bounds.west + bounds.east) / 2,
          };
          useMapStore.getState().setWatchlistTargetLocation(center);
        }}
      >
        <span>🔔</span> Alert me for this area
      </button>
    </div>
  );
}
