"use client";

import { useQuery } from "@tanstack/react-query";
import type { AreaRentStat, PinFilters, PublicPin } from "@/lib/types/pins";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Bounds = { south: number; west: number; north: number; east: number };

async function getAccessToken() {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const activeSession =
    session ?? (await supabase.auth.signInAnonymously()).data.session;

  return activeSession?.access_token ?? null;
}

async function fetchPins(bounds?: Bounds, filters?: PinFilters) {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  if (bounds) {
    params.set(
      "bounds",
      `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`,
    );
  }
  if (filters?.availableOnly) params.set("available", "true");
  if (filters?.bhk) params.set("bhk", String(filters.bhk));
  if (filters?.furnishing && filters.furnishing !== "any") {
    params.set("furnishing", filters.furnishing);
  }
  if (filters?.gated !== null && filters?.gated !== undefined) {
    params.set("gated", String(filters.gated));
  }
  if (filters?.occupantType && filters.occupantType !== "all") {
    params.set("occupant_type", filters.occupantType);
  }
  if (filters?.minRent) params.set("min_rent", String(filters.minRent));
  if (filters?.maxRent) params.set("max_rent", String(filters.maxRent));

  const response = await fetch(`/api/pins?${params.toString()}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error("Unable to fetch rent pins");
  }

  const payload = (await response.json()) as {
    pins: PublicPin[];
    area_stats?: AreaRentStat[];
  };
  return {
    pins: payload.pins,
    areaStats: payload.area_stats ?? [],
  };
}

export function usePins(bounds?: Bounds, filters?: PinFilters) {
  return useQuery({
    queryKey: ["pins", bounds, filters],
    queryFn: () => fetchPins(bounds, filters),
  });
}
