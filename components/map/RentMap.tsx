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
import { LocateFixed, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AddListingForm } from "@/components/forms/AddListingForm";
import { DropPinForm } from "@/components/forms/DropPinForm";
import { RegisterSeekerForm } from "@/components/forms/RegisterSeekerForm";
import { WatchlistForm } from "@/components/forms/WatchlistForm";
import { AreaSearch } from "@/components/map/AreaSearch";
import { AreaStatsOverlay } from "@/components/map/AreaStatsOverlay";
import { LayerTogglePanel } from "@/components/map/LayerTogglePanel";
import { MetroOverlay } from "@/components/map/MetroOverlay";
import { PinInfoPopup } from "@/components/map/PinInfoPopup";
import { NdviLegend, SentinelOverlay } from "@/components/map/SentinelOverlay";
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

type Bounds = CameraState["bounds"];

function roundBounds(bounds: Bounds): Bounds {
  return {
    south: Number(bounds.south.toFixed(3)),
    west: Number(bounds.west.toFixed(3)),
    north: Number(bounds.north.toFixed(3)),
    east: Number(bounds.east.toFixed(3)),
  };
}

function expandBounds(bounds: Bounds, paddingRatio = 0.45): Bounds {
  const latPadding = (bounds.north - bounds.south) * paddingRatio;
  const lngPadding = (bounds.east - bounds.west) * paddingRatio;

  return roundBounds({
    south: bounds.south - latPadding,
    west: bounds.west - lngPadding,
    north: bounds.north + latPadding,
    east: bounds.east + lngPadding,
  });
}

function containsBounds(outer: Bounds, inner: Bounds) {
  return (
    outer.south <= inner.south &&
    outer.north >= inner.north &&
    outer.west <= inner.west &&
    outer.east >= inner.east
  );
}

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
  const [camera, setCamera] = useState<CameraState>({
    bounds: defaultBounds,
    zoom: 12,
  });
  const [queryBounds, setQueryBounds] = useState<Bounds>(() =>
    expandBounds(defaultBounds),
  );

  const { data, isError, isLoading } = usePins(queryBounds);
  const pins = data?.pins ?? [];
  const areaStats = data?.areaStats ?? [];
  const isPinPlacementMode = useMapStore((state) => state.isPinPlacementMode);
  const setPinPlacementMode = useMapStore((state) => state.setPinPlacementMode);
  const draftPinLocation = useMapStore((state) => state.draftPinLocation);
  const setDraftPinLocation = useMapStore((state) => state.setDraftPinLocation);
  const setActivePin = useMapStore((state) => state.setActivePin);

  const editingPin = useMapStore((state) => state.editingPin);
  const setEditingPin = useMapStore((state) => state.setEditingPin);

  const isSeekerMode = useMapStore((state) => state.isSeekerMode);
  const setSeekerMode = useMapStore((state) => state.setSeekerMode);
  const seekerTargetLocation = useMapStore((state) => state.seekerTargetLocation);
  const setSeekerTargetLocation = useMapStore((state) => state.setSeekerTargetLocation);
  const listingForPin = useMapStore((state) => state.listingForPin);
  const setListingForPin = useMapStore((state) => state.setListingForPin);

  const showMetroLayer = useMapStore((state) => state.showMetroLayer);
  const showGreenCover = useMapStore((state) => state.showGreenCover);

  const watchlistTargetLocation = useMapStore((state) => state.watchlistTargetLocation);
  const setWatchlistTargetLocation = useMapStore((state) => state.setWatchlistTargetLocation);

  const map = useMap("rent-map");

  function handleCameraChanged(event: MapCameraChangedEvent) {
    const nextBounds = event.detail.bounds || defaultBounds;
    setCamera({
      bounds: nextBounds,
      zoom: event.detail.zoom,
    });

    if (!containsBounds(queryBounds, nextBounds)) {
      setQueryBounds(expandBounds(nextBounds));
    }
  }

  function locateBengaluru() {
    map?.panTo(BENGALURU_CENTER);
    map?.setZoom(12);
  }

  function handleMapClick(event: MapMouseEvent) {
    if (!event.detail.latLng) return;

    if (isPinPlacementMode) {
      setDraftPinLocation(event.detail.latLng);
      setPinPlacementMode(false);
      return;
    }

    if (isSeekerMode) {
      setSeekerTargetLocation(event.detail.latLng);
      setSeekerMode(false);
    }
  }

  return (
    <div
      className={cn(
        "relative h-dvh w-full overflow-hidden bg-[#d8cfc1]",
        (isPinPlacementMode || isSeekerMode) && "cursor-crosshair",
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
        <MetroOverlay visible={showMetroLayer} />
        <SentinelOverlay visible={showGreenCover} />
      </Map>

      {/* Top bar: logo + search */}
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
          <div className="pointer-events-auto ml-auto">
            <LayerTogglePanel />
          </div>
        </div>
      </div>

      {/* Bottom bar: status + action buttons */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-3 p-3 sm:p-5">
        {/* Left side: area stats + status */}
        <div className="flex flex-col gap-3">
          <NdviLegend visible={showGreenCover} />
          <AreaStatsOverlay
            pins={pins}
            bounds={camera.bounds}
            serverStats={areaStats}
          />
          <div className="map-chrome max-w-[72vw] rounded-lg px-4 py-3 text-sm font-medium text-[#61584e]">
            {isLoading
              ? "Loading community rent pins..."
              : isError
                ? "Pins could not load. Check Supabase env vars."
                : isPinPlacementMode
                  ? "Tap the map where the home is"
                  : isSeekerMode
                    ? "Tap where you want to live"
                    : `${pins.length.toLocaleString("en-IN")} rent pins visible`}
          </div>
        </div>

        {/* Right side: action buttons */}
        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            aria-label="Recenter Bengaluru"
            className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#16110d] shadow-lg transition hover:scale-105"
            type="button"
            onClick={locateBengaluru}
          >
            <LocateFixed size={20} />
          </button>
          <button
            className="flex h-12 items-center rounded-full bg-white px-4 text-sm font-bold text-[#16110d] shadow-lg transition hover:scale-105"
            type="button"
            onClick={() => {
              setActivePin(null);
              setSeekerMode(true);
            }}
          >
            <Search className="mr-2" size={18} />
            Find a flat
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

      {/* Drop Pin Form — new pin mode */}
      {draftPinLocation ? (
        <DropPinForm
          location={draftPinLocation}
          nearbyPins={pins}
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

      {/* Drop Pin Form — edit mode */}
      {editingPin ? (
        <DropPinForm
          editPin={editingPin}
          nearbyPins={pins}
          onClose={() => setEditingPin(null)}
          onCreated={(pin) => {
            setEditingPin(null);
            setActivePin(pin);
          }}
        />
      ) : null}

      {/* Add Listing Form */}
      {listingForPin ? (
        <AddListingForm
          pin={listingForPin}
          onClose={() => setListingForPin(null)}
          onCreated={() => {
            setListingForPin(null);
          }}
        />
      ) : null}

      {/* Watchlist Form */}
      {watchlistTargetLocation ? (
        <WatchlistForm
          location={watchlistTargetLocation}
          onClose={() => setWatchlistTargetLocation(null)}
        />
      ) : null}

      {/* Register Seeker Form */}
      {seekerTargetLocation ? (
        <RegisterSeekerForm
          location={seekerTargetLocation}
          onClose={() => {
            setSeekerTargetLocation(null);
            setSeekerMode(false);
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
