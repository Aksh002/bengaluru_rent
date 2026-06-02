"use client";

import { useQuery } from "@tanstack/react-query";
import type { AreaRentStat, PublicPin } from "@/lib/types/pins";
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

async function fetchPins(bounds?: Bounds) {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  if (bounds) {
    params.set(
      "bounds",
      `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`,
    );
  }

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

export function usePins(bounds?: Bounds) {
  return useQuery({
    queryKey: ["pins", bounds],
    queryFn: () => fetchPins(bounds),
  });
}
