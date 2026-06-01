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
    <div className="pointer-events-auto flex w-full min-w-0 items-center gap-2 rounded-lg p-2 map-chrome">
      <Search className="shrink-0 text-[#61584e]" size={18} />
      <input
        ref={inputRef}
        aria-label="Search Bengaluru area"
        className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[#8c8378]"
        placeholder="Search Koramangala, Indiranagar..."
        type="search"
      />
      <button
        className="shrink-0 rounded-md border border-black/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] transition hover:bg-black/5"
        type="button"
        onClick={panHome}
      >
        BLR
      </button>
    </div>
  );
}
