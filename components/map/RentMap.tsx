"use client";

import {
  AdvancedMarker,
  APIProvider,
  Map,
  MapCameraChangedEvent,
  MapMouseEvent,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";
import Supercluster, {
  ClusterFeature,
  PointFeature,
} from "supercluster";
import { LocateFixed, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DropPinForm } from "@/components/forms/DropPinForm";
import { AreaSearch } from "@/components/map/AreaSearch";
import { PinInfoPopup } from "@/components/map/PinInfoPopup";
import { usePins } from "@/hooks/usePins";
import type { PublicPin } from "@/lib/types/pins";
import { cn } from "@/lib/utils/cn";
import { BENGALURU_CENTER } from "@/lib/utils/geo";
import { useMapStore } from "@/store/map-store";

type PinPointProperties = {
  pin: PublicPin;
};

type CameraState = {
  bounds: { west: number; south: number; east: number; north: number };
  zoom: number;
};

const defaultBounds = {
  west: 77.38,
  south: 12.74,
  east: 77.86,
  north: 13.18,
};

const pinPalette = {
  one: "#246bfe",
  two: "#008f5a",
  three: "#d58400",
  four: "#e55336",
};

function colorForBhk(bhk: number) {
  if (bhk <= 1) return pinPalette.one;
  if (bhk === 2) return pinPalette.two;
  if (bhk === 3) return pinPalette.three;
  return pinPalette.four;
}

function formatCompactRent(rent: number) {
  if (rent >= 100000) return `${Math.round(rent / 100000)}L`;
  return `${Math.round(rent / 1000)}k`;
}

function PinLayer({ pins, camera }: { pins: PublicPin[]; camera: CameraState }) {
  const map = useMap("rent-map");
  const activePin = useMapStore((state) => state.activePin);
  const setActivePin = useMapStore((state) => state.setActivePin);

  const points = useMemo<PointFeature<PinPointProperties>[]>(
    () =>
      pins.map((pin) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [pin.lng, pin.lat],
        },
        properties: { pin },
      })),
    [pins],
  );

  const clusterer = useMemo(() => {
    const index = new Supercluster<PinPointProperties>({
      radius: 68,
      maxZoom: 18,
      minPoints: 3,
    });
    index.load(points);
    return index;
  }, [points]);

  const clusters = clusterer.getClusters(
    [camera.bounds.west, camera.bounds.south, camera.bounds.east, camera.bounds.north],
    Math.round(camera.zoom),
  );

  return (
    <>
      {clusters.map((cluster) => {
        const [lng, lat] = cluster.geometry.coordinates;
        const properties = cluster.properties;
        const isCluster = "cluster" in properties && properties.cluster;

        if (isCluster) {
          const clusterFeature = cluster as ClusterFeature<PinPointProperties>;
          const pointCount = clusterFeature.properties.point_count;

          return (
            <AdvancedMarker
              key={`cluster-${clusterFeature.properties.cluster_id}`}
              position={{ lat, lng }}
              onClick={() => {
                const expansionZoom = Math.min(
                  clusterer.getClusterExpansionZoom(
                    clusterFeature.properties.cluster_id,
                  ),
                  19,
                );
                map?.panTo({ lat, lng });
                map?.setZoom(expansionZoom);
              }}
            >
              <button
                aria-label={`${pointCount} rent pins`}
                className="grid h-12 min-w-12 place-items-center rounded-full border-2 border-white bg-[#16110d] px-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
                type="button"
              >
                {pointCount}
              </button>
            </AdvancedMarker>
          );
        }

        const pin = (cluster as PointFeature<PinPointProperties>).properties.pin;

        return (
          <AdvancedMarker
            key={pin.id}
            position={{ lat: pin.lat, lng: pin.lng }}
            onClick={() => setActivePin(pin)}
          >
            <Pin
              background={colorForBhk(pin.bhk)}
              borderColor="#ffffff"
              glyph={formatCompactRent(pin.rent)}
              glyphColor="#ffffff"
              scale={1.08}
            />
          </AdvancedMarker>
        );
      })}

      {activePin ? (
        <PinInfoPopup pin={activePin} onClose={() => setActivePin(null)} />
      ) : null}
    </>
  );
}

function MapShell() {
  const { data: pins = [], isError, isLoading } = usePins();
  const isPinPlacementMode = useMapStore((state) => state.isPinPlacementMode);
  const setPinPlacementMode = useMapStore((state) => state.setPinPlacementMode);
  const draftPinLocation = useMapStore((state) => state.draftPinLocation);
  const setDraftPinLocation = useMapStore((state) => state.setDraftPinLocation);
  const setActivePin = useMapStore((state) => state.setActivePin);
  const [camera, setCamera] = useState<CameraState>({
    bounds: defaultBounds,
    zoom: 12,
  });
  const map = useMap("rent-map");

  function handleCameraChanged(event: MapCameraChangedEvent) {
    setCamera({
      bounds: event.detail.bounds || defaultBounds,
      zoom: event.detail.zoom,
    });
  }

  function locateBengaluru() {
    map?.panTo(BENGALURU_CENTER);
    map?.setZoom(12);
  }

  function handleMapClick(event: MapMouseEvent) {
    if (!isPinPlacementMode || !event.detail.latLng) return;
    setDraftPinLocation(event.detail.latLng);
    setPinPlacementMode(false);
  }

  return (
    <div
      className={cn(
        "relative h-dvh w-full overflow-hidden bg-[#d8cfc1]",
        isPinPlacementMode && "cursor-crosshair",
      )}
    >
      <Map
        id="rent-map"
        defaultCenter={BENGALURU_CENTER}
        defaultZoom={12}
        gestureHandling="greedy"
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        clickableIcons={false}
        reuseMaps
        className="h-full w-full"
        onCameraChanged={handleCameraChanged}
        onClick={handleMapClick}
      >
        <PinLayer pins={pins} camera={camera} />
        {draftPinLocation ? (
          <AdvancedMarker position={draftPinLocation}>
            <Pin
              background="#16110d"
              borderColor="#ffffff"
              glyphColor="#ffffff"
              glyph="new"
            />
          </AdvancedMarker>
        ) : null}
      </Map>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start">
          <div className="map-chrome rounded-lg px-4 py-3">
            <h1 className="font-[var(--font-display)] text-2xl font-semibold leading-none sm:text-3xl">
              bengaluru.rent
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#61584e]">
              Anonymous rent map
            </p>
          </div>
          <AreaSearch />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-3 p-3 sm:p-5">
        <div className="map-chrome max-w-[72vw] rounded-lg px-4 py-3 text-sm font-medium text-[#61584e]">
          {isLoading
            ? "Loading community rent pins..."
            : isError
              ? "Pins could not load. Check Supabase env vars."
              : isPinPlacementMode
                ? "Tap the map where the home is"
                : `${pins.length.toLocaleString("en-IN")} rent pins visible`}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            aria-label="Recenter Bengaluru"
            className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#16110d] shadow-lg transition hover:scale-105"
            type="button"
            onClick={locateBengaluru}
          >
            <LocateFixed size={20} />
          </button>
          <button
            className="flex h-12 items-center rounded-full bg-[#16110d] px-4 text-sm font-bold text-white shadow-lg transition hover:scale-105"
            type="button"
            onClick={() => {
              setActivePin(null);
              setDraftPinLocation(null);
              setPinPlacementMode(true);
            }}
          >
            <Plus className="mr-2" size={18} />
            Drop a Pin
          </button>
        </div>
      </div>

      {draftPinLocation ? (
        <DropPinForm
          location={draftPinLocation}
          onClose={() => {
            setDraftPinLocation(null);
            setPinPlacementMode(false);
          }}
          onCreated={(pin) => {
            setDraftPinLocation(null);
            setActivePin(pin);
            map?.panTo({ lat: pin.lat, lng: pin.lng });
            map?.setZoom(16);
          }}
        />
      ) : null}
    </div>
  );
}

export function RentMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f7f2e8] px-6 text-center">
        <div className="max-w-lg">
          <p className="font-[var(--font-display)] text-4xl font-semibold">
            bengaluru.rent
          </p>
          <p className="mt-4 text-lg text-[#61584e]">
            Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local` to load the
            Stage 1 map.
          </p>
        </div>
      </main>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <MapShell />
    </APIProvider>
  );
}
