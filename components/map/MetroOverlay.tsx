"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

type MetroFeature = {
  type: "Feature";
  properties: {
    line: "purple" | "green";
    name: string;
    type?: "station";
  };
  geometry: {
    type: "LineString" | "Point";
    coordinates: number[] | number[][];
  };
};

type MetroGeoJSON = {
  type: "FeatureCollection";
  features: MetroFeature[];
};

const LINE_COLORS = {
  purple: "#7B2D8B",
  green: "#00A651",
};

export function MetroOverlay({ visible }: { visible: boolean }) {
  const map = useMap("rent-map");
  const [data, setData] = useState<MetroGeoJSON | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  // Load GeoJSON once
  useEffect(() => {
    fetch("/data/namma-metro.geojson")
      .then((res) => res.json())
      .then((json: MetroGeoJSON) => setData(json))
      .catch(() => console.warn("Could not load metro data"));
  }, []);

  // Render/hide polylines and markers
  useEffect(() => {
    if (!map || !data) return;

    // Clean up existing
    polylinesRef.current.forEach((p) => p.setMap(null));
    markersRef.current.forEach((m) => (m.map = null));
    polylinesRef.current = [];
    markersRef.current = [];

    if (!visible) return;

    for (const feature of data.features) {
      if (feature.geometry.type === "LineString") {
        const coords = (feature.geometry.coordinates as number[][]).map(
          ([lng, lat]) => ({ lat, lng }),
        );

        const polyline = new google.maps.Polyline({
          path: coords,
          strokeColor: LINE_COLORS[feature.properties.line] || "#999",
          strokeOpacity: 0.85,
          strokeWeight: 4,
          map,
        });

        polylinesRef.current.push(polyline);
      }

      if (
        feature.geometry.type === "Point" &&
        feature.properties.type === "station"
      ) {
        const [lng, lat] = feature.geometry.coordinates as number[];
        const color = LINE_COLORS[feature.properties.line] || "#999";

        const el = document.createElement("div");
        el.style.cssText = `
          width: 10px; height: 10px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        `;
        el.title = feature.properties.name;

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: { lat, lng },
          map,
          content: el,
          title: feature.properties.name,
        });

        markersRef.current.push(marker);
      }
    }

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      markersRef.current.forEach((m) => (m.map = null));
    };
  }, [map, data, visible]);

  return null;
}
