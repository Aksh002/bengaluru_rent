"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicPin } from "@/lib/types/pins";

async function fetchPins() {
  const response = await fetch("/api/pins", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to fetch rent pins");
  }

  const payload = (await response.json()) as { pins: PublicPin[] };
  return payload.pins;
}

export function usePins() {
  return useQuery({
    queryKey: ["pins"],
    queryFn: fetchPins,
  });
}
