"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";

/**
 * Sentinel-2 NDVI Green Cover overlay.
 * Renders a pre-processed NDVI PNG tile over greater Bengaluru using GroundOverlay.
 *
 * The PNG should be hosted in Supabase Storage (satellite-tiles bucket)
 * or at /data/ndvi-bengaluru.png in the public folder.
 */

const BENGALURU_NDVI_BOUNDS = {
  north: 13.15,
  south: 12.80,
  east: 77.80,
  west: 77.40,
};

function getNdviUrl(): string {
  return process.env.NEXT_PUBLIC_NDVI_TILE_URL || "";
}

export function SentinelOverlay({ visible }: { visible: boolean }) {
  const map = useMap("rent-map");
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null);

  useEffect(() => {
    if (!map) return;

    // Clean up existing
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }

    const tileUrl = getNdviUrl();
    if (!visible || !tileUrl) return;

    const bounds = new google.maps.LatLngBounds(
      { lat: BENGALURU_NDVI_BOUNDS.south, lng: BENGALURU_NDVI_BOUNDS.west },
      { lat: BENGALURU_NDVI_BOUNDS.north, lng: BENGALURU_NDVI_BOUNDS.east },
    );

    const overlay = new google.maps.GroundOverlay(tileUrl, bounds, {
      opacity: 0.45,
      clickable: false,
    });

    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
    };
  }, [map, visible]);

  return null;
}

/**
 * NDVI legend card for the green cover overlay.
 */
export function NdviLegend({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="map-chrome rounded-lg px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#61584e]">
        🌿 Green Cover (NDVI)
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span
          className="h-3 w-6 rounded-sm"
          style={{ background: "#9e9e9e" }}
        />
        <span
          className="h-3 w-6 rounded-sm"
          style={{ background: "#c6e48b" }}
        />
        <span
          className="h-3 w-6 rounded-sm"
          style={{ background: "#7bc96f" }}
        />
        <span
          className="h-3 w-6 rounded-sm"
          style={{ background: "#239a3b" }}
        />
        <span
          className="h-3 w-6 rounded-sm"
          style={{ background: "#196127" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[#8c8378]">
        <span>Urban</span>
        <span>Dense</span>
      </div>
      <p className="mt-1 text-[10px] text-[#8c8378]">Data: Mar 2026</p>
      {!getNdviUrl() ? (
        <p className="mt-1 text-[10px] font-semibold text-[#9d2b22]">
          Tile URL not configured
        </p>
      ) : null}
    </div>
  );
}
