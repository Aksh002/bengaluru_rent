"use client";

import { Layers, TrainFront, TreePine } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useMapStore } from "@/store/map-store";

/**
 * Floating layer toggle panel.
 * Allows users to toggle metro lines and green cover overlays.
 */
export function LayerTogglePanel({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [open, setOpen] = useState(false);

  const showMetroLayer = useMapStore((s) => s.showMetroLayer);
  const setShowMetroLayer = useMapStore((s) => s.setShowMetroLayer);
  const showGreenCover = useMapStore((s) => s.showGreenCover);
  const setShowGreenCover = useMapStore((s) => s.setShowGreenCover);

  const activeCount =
    (showMetroLayer ? 1 : 0) + (showGreenCover ? 1 : 0);

  return (
    <div className="pointer-events-auto relative z-40">
      {/* Toggle button */}
      <button
        aria-label="Toggle map layers"
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-md border shadow-lg transition hover:-translate-y-0.5 sm:h-11 sm:w-11",
          open && "bg-[#f5a524] text-[#15110a]",
          !open &&
            tone === "light" &&
            "border-transparent bg-transparent text-[#1f2937]/76 shadow-none hover:text-[#111827]",
          !open &&
            tone === "dark" &&
            "border-white/10 bg-white/[0.06] text-white/72 hover:bg-white/10 hover:text-white",
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
        <div
          className={cn(
            "absolute right-0 top-14 z-50 w-56 rounded-[1.1rem] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.24)] backdrop-blur-xl",
            tone === "light"
              ? "border border-black/10 bg-white/90 text-[#111827]"
              : "command-panel",
          )}
        >
          <p
            className={cn(
              "mb-3 text-xs font-extrabold uppercase tracking-[0.12em]",
              tone === "light" ? "text-[#334155]/55" : "text-white/48",
            )}
          >
            Map Layers
          </p>

          <LayerRow
            active={showMetroLayer}
            color="#7B2D8B"
            icon={<TrainFront size={16} />}
            label="Metro Lines"
            tone={tone}
            onToggle={() => setShowMetroLayer(!showMetroLayer)}
          />

          <LayerRow
            active={showGreenCover}
            color="#00A651"
            icon={<TreePine size={16} />}
            label="Green Cover"
            tone={tone}
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
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  active: boolean;
  tone: "dark" | "light";
  onToggle: () => void;
}) {
  return (
    <button
      className={cn(
        "mb-1.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition",
        active && tone === "dark" && "bg-white/12 text-white",
        !active &&
          tone === "dark" &&
          "text-white/66 hover:bg-white/[0.07] hover:text-white",
        active && tone === "light" && "bg-[#111827]/8 text-[#111827]",
        !active &&
          tone === "light" &&
          "text-[#334155]/76 hover:bg-[#111827]/5 hover:text-[#111827]",
      )}
      type="button"
      onClick={onToggle}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: active ? color : `${color}33` }}
      >
        <span style={{ color: active ? "white" : color }}>{icon}</span>
      </span>
      {label}
    </button>
  );
}
