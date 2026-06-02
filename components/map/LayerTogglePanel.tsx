"use client";

import { Layers, TrainFront, TreePine } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useMapStore } from "@/store/map-store";

/**
 * Floating layer toggle panel.
 * Allows users to toggle metro lines and green cover overlays.
 */
export function LayerTogglePanel() {
  const [open, setOpen] = useState(false);

  const showMetroLayer = useMapStore((s) => s.showMetroLayer);
  const setShowMetroLayer = useMapStore((s) => s.setShowMetroLayer);
  const showGreenCover = useMapStore((s) => s.showGreenCover);
  const setShowGreenCover = useMapStore((s) => s.setShowGreenCover);

  const activeCount =
    (showMetroLayer ? 1 : 0) + (showGreenCover ? 1 : 0);

  return (
    <div className="pointer-events-auto relative">
      {/* Toggle button */}
      <button
        aria-label="Toggle map layers"
        className={cn(
          "relative grid h-12 w-12 place-items-center rounded-full shadow-lg transition hover:scale-105",
          open
            ? "bg-[#16110d] text-white"
            : "bg-white text-[#16110d]",
        )}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Layers size={20} />
        {activeCount > 0 && !open ? (
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#7B2D8B] text-[10px] font-bold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>

      {/* Panel */}
      {open ? (
        <div className="map-chrome absolute right-0 top-14 w-56 rounded-lg p-3 shadow-xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#61584e]">
            Map Layers
          </p>

          <LayerRow
            active={showMetroLayer}
            color="#7B2D8B"
            icon={<TrainFront size={16} />}
            label="Metro Lines"
            onToggle={() => setShowMetroLayer(!showMetroLayer)}
          />

          <LayerRow
            active={showGreenCover}
            color="#00A651"
            icon={<TreePine size={16} />}
            label="Green Cover"
            onToggle={() => setShowGreenCover(!showGreenCover)}
          />
        </div>
      ) : null}
    </div>
  );
}

function LayerRow({
  label,
  icon,
  color,
  active,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={cn(
        "mb-1.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition",
        active
          ? "bg-[#16110d] text-white"
          : "text-[#16110d] hover:bg-black/5",
      )}
      type="button"
      onClick={onToggle}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: active ? color : `${color}22` }}
      >
        <span style={{ color: active ? "white" : color }}>{icon}</span>
      </span>
      {label}
    </button>
  );
}
