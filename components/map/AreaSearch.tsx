"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { BENGALURU_CENTER } from "@/lib/utils/geo";

export function AreaSearch() {
  const map = useMap("rent-map");
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!places || !map || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ["geometry", "name"],
      componentRestrictions: { country: "in" },
      bounds: {
        north: 13.18,
        south: 12.74,
        east: 77.86,
        west: 77.38,
      },
      strictBounds: false,
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const location = place.geometry?.location;

      if (!location) return;

      map.panTo(location);
      map.setZoom(15);
    });

    return () => {
      listener.remove();
    };
  }, [map, places]);

  function panHome() {
    if (!map) return;
    map.panTo(BENGALURU_CENTER);
    map.setZoom(12);
  }

  return (
    <div className="pointer-events-auto flex w-full min-w-0 items-center gap-1.5 rounded-xl p-1 sm:gap-2 sm:p-2">
      <Search className="h-4 w-4 shrink-0 text-[#334155]/55 sm:h-[18px] sm:w-[18px]" />
      <input
        ref={inputRef}
        aria-label="Search Bengaluru area"
        className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#111827] outline-none placeholder:text-[#64748b]/70 sm:text-sm"
        placeholder="Search Koramangala, Indiranagar..."
        type="search"
      />
      <button
        className="shrink-0 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#334155] transition hover:text-[#111827] sm:px-3 sm:py-2 sm:text-xs"
        type="button"
        onClick={panHome}
      >
        BLR
      </button>
    </div>
  );
}
