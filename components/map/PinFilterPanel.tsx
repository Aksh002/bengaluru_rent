"use client";

import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { PinFilters } from "@/lib/types/pins";
import { defaultPinFilters } from "@/lib/types/pins";
import { cn } from "@/lib/utils/cn";

type PinFilterPanelProps = {
  filters: PinFilters;
  onChange: (filters: PinFilters) => void;
  onClose: () => void;
};

export function PinFilterPanel({
  filters,
  onChange,
  onClose,
}: PinFilterPanelProps) {
  const set = (next: Partial<PinFilters>) => onChange({ ...filters, ...next });
  const activeCount = [
    filters.availableOnly,
    filters.bhk,
    filters.furnishing !== "any",
    filters.gated !== null,
    filters.occupantType !== "all",
    filters.minRent,
    filters.maxRent,
  ].filter(Boolean).length;

  return (
    <section className="command-panel absolute right-3 top-[10.5rem] z-20 w-[min(360px,calc(100vw-24px))] p-4 sm:right-5 sm:top-[7.2rem]">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white">
            <SlidersHorizontal size={15} />
            Filters
          </p>
          <p className="mt-1 text-xs font-semibold text-white/52">
            {activeCount ? `${activeCount} active` : "Showing all verified pins"}
          </p>
        </div>
        <button
          aria-label="Close filters"
          className="control-icon"
          type="button"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      <div className="grid gap-4">
        <button
          className={cn(
            "filter-switch",
            filters.availableOnly && "filter-switch-active",
          )}
          type="button"
          onClick={() => set({ availableOnly: !filters.availableOnly })}
        >
          <span>Available flats only</span>
          {filters.availableOnly ? <Check size={16} /> : null}
        </button>

        <FilterGroup label="BHK">
          {[1, 2, 3, 4].map((bhk) => (
            <Chip
              key={bhk}
              active={filters.bhk === bhk}
              onClick={() => set({ bhk: filters.bhk === bhk ? null : bhk })}
            >
              {bhk}BHK
            </Chip>
          ))}
          <Chip active={filters.bhk === null} onClick={() => set({ bhk: null })}>
            Any
          </Chip>
        </FilterGroup>

        <FilterGroup label="Furnishing">
          {[
            ["any", "Any"],
            ["furnished", "Furnished"],
            ["semi", "Semi"],
            ["unfurnished", "Unfurnished"],
          ].map(([value, label]) => (
            <Chip
              key={value}
              active={filters.furnishing === value}
              onClick={() =>
                set({ furnishing: value as PinFilters["furnishing"] })
              }
            >
              {label}
            </Chip>
          ))}
        </FilterGroup>

        <FilterGroup label="Building">
          <Chip active={filters.gated === null} onClick={() => set({ gated: null })}>
            Any
          </Chip>
          <Chip active={filters.gated === true} onClick={() => set({ gated: true })}>
            Gated
          </Chip>
          <Chip active={filters.gated === false} onClick={() => set({ gated: false })}>
            Open
          </Chip>
        </FilterGroup>

        <FilterGroup label="Tenant preference">
          {[
            ["all", "Any"],
            ["family", "Family"],
            ["bachelor", "Bachelor"],
          ].map(([value, label]) => (
            <Chip
              key={value}
              active={filters.occupantType === value}
              onClick={() =>
                set({ occupantType: value as PinFilters["occupantType"] })
              }
            >
              {label}
            </Chip>
          ))}
        </FilterGroup>

        <div className="grid grid-cols-2 gap-3">
          <RentInput
            label="Min rent"
            value={filters.minRent}
            onChange={(value) => set({ minRent: value })}
          />
          <RentInput
            label="Max rent"
            value={filters.maxRent}
            onChange={(value) => set({ maxRent: value })}
          />
        </div>

        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm font-black text-white/72 transition hover:bg-white/10 hover:text-white"
          type="button"
          onClick={() => onChange(defaultPinFilters)}
        >
          <RotateCcw size={15} />
          Reset filters
        </button>
      </div>
    </section>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-9 rounded-md border px-3 text-xs font-black transition",
        active
          ? "border-[#f5a524] bg-[#f5a524] text-[#16110d]"
          : "border-white/10 bg-white/[0.06] text-white/68 hover:bg-white/10 hover:text-white",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/45">
        {label}
      </span>
      <input
        className="h-10 min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm font-black text-white outline-none placeholder:text-white/24 focus:border-[#f5a524]"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="₹"
        type="text"
        value={value ?? ""}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) && next > 0 ? next : null);
        }}
      />
    </label>
  );
}
