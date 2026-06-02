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
import {
  BarChart3,
  BriefcaseBusiness,
  Home,
  LocateFixed,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";
import GlassSurface from "@/components/GlassSurface";
import { AddListingForm } from "@/components/forms/AddListingForm";
import { DropPinForm } from "@/components/forms/DropPinForm";
import { RegisterSeekerForm } from "@/components/forms/RegisterSeekerForm";
import { WatchlistForm } from "@/components/forms/WatchlistForm";
import { AreaSearch } from "@/components/map/AreaSearch";
import { AreaStatsOverlay } from "@/components/map/AreaStatsOverlay";
import { LayerTogglePanel } from "@/components/map/LayerTogglePanel";
import { LiveStatsPanel } from "@/components/map/LiveStatsPanel";
import { MetroOverlay } from "@/components/map/MetroOverlay";
import { PinInfoPopup } from "@/components/map/PinInfoPopup";
import { PinFilterPanel } from "@/components/map/PinFilterPanel";
import { NdviLegend, SentinelOverlay } from "@/components/map/SentinelOverlay";
import { usePins } from "@/hooks/usePins";
import { defaultPinFilters, type PinFilters, type PublicPin } from "@/lib/types/pins";
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

const CLUSTER_DISABLE_ZOOM = 16;

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

function activeFilterCount(filters: PinFilters) {
  return [
    filters.availableOnly,
    filters.bhk,
    filters.furnishing !== "any",
    filters.gated !== null,
    filters.occupantType !== "all",
    filters.minRent,
    filters.maxRent,
  ].filter(Boolean).length;
}

function RentMarker({ pin }: { pin: PublicPin }) {
  const color = colorForBhk(pin.bhk);
  const hasRating =
    pin.rating_avg !== null &&
    pin.rating_avg !== undefined &&
    (pin.rating_count ?? 0) > 0;

  return (
    <button
      className="relative grid h-[30px] min-w-[78px] grid-cols-[auto_auto] items-center gap-1.5 rounded-md border border-white/28 px-2 text-xs font-extrabold text-white transition hover:-translate-y-0.5"
      style={{
        background: color,
        boxShadow: `0 0 0 1px ${color}55, 0 0 20px ${color}cc, 0 16px 34px rgba(0,0,0,0.36)`,
      }}
      type="button"
    >
      <span>{pin.bhk}BHK</span>
      <span>{formatCompactRent(pin.rent)}</span>
      {pin.has_listing ? (
        <span className="absolute -top-4 left-2 rounded bg-[#26c281] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-[#07140d]">
          avail
        </span>
      ) : null}
      {hasRating ? (
        <span className="absolute -right-2 -top-3 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-amber-200/40 bg-[#16110d] px-1 text-[9px] font-black text-amber-300 shadow-[0_8px_18px_rgba(0,0,0,0.32)]">
          <Star size={9} className="fill-amber-300 text-amber-300" />
          {pin.rating_avg?.toFixed(1)}
        </span>
      ) : null}
      <span
        className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45"
        style={{ background: color }}
      />
    </button>
  );
}

function ClusterMarker({
  availableCount,
  count,
}: {
  availableCount: number;
  count: number;
}) {
  return (
    <button
      aria-label={`${count} rent pins`}
      className="relative grid min-h-[52px] min-w-[86px] place-items-center rounded-xl border border-white/18 bg-[#17182c]/95 px-3 py-2 text-center text-white shadow-[0_15px_34px_rgba(0,0,0,0.38)] backdrop-blur-md transition hover:-translate-y-0.5"
      type="button"
    >
      <span className="text-sm font-black leading-none">
        {count} {count === 1 ? "pin" : "pins"}
      </span>
      <span className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/52">
        AVLB {availableCount}
      </span>
      <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-white/18 bg-[#17182c]" />
    </button>
  );
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

  const clusterRadius = useMemo(() => {
    if (camera.zoom < 11) return 132;
    if (camera.zoom < 12.5) return 108;
    if (camera.zoom < 14) return 82;
    if (camera.zoom < CLUSTER_DISABLE_ZOOM) return 54;
    return 0;
  }, [camera.zoom]);

  const clusterer = useMemo(() => {
    const index = new Supercluster<PinPointProperties>({
      radius: clusterRadius,
      maxZoom: CLUSTER_DISABLE_ZOOM - 1,
      minPoints: 2,
    });
    index.load(points);
    return index;
  }, [clusterRadius, points]);

  const clusters =
    camera.zoom >= CLUSTER_DISABLE_ZOOM
      ? points.filter((point) => {
          const [lng, lat] = point.geometry.coordinates;
          return (
            lng >= camera.bounds.west &&
            lng <= camera.bounds.east &&
            lat >= camera.bounds.south &&
            lat <= camera.bounds.north
          );
        })
      : clusterer.getClusters(
          [
            camera.bounds.west,
            camera.bounds.south,
            camera.bounds.east,
            camera.bounds.north,
          ],
          Math.floor(camera.zoom),
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
          const leaves = clusterer.getLeaves(
            clusterFeature.properties.cluster_id,
            pointCount,
          );
          const availableCount = leaves.filter(
            (leaf) => leaf.properties.pin.has_listing,
          ).length;

          return (
            <AdvancedMarker
              key={`cluster-${clusterFeature.properties.cluster_id}`}
              position={{ lat, lng }}
              onClick={() => {
                const expansionZoom = Math.min(
                  clusterer.getClusterExpansionZoom(
                    clusterFeature.properties.cluster_id,
                  ),
                  CLUSTER_DISABLE_ZOOM,
                );
                map?.panTo({ lat, lng });
                map?.setZoom(expansionZoom);
              }}
            >
              <ClusterMarker count={pointCount} availableCount={availableCount} />
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
            <RentMarker pin={pin} />
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
  const [filters, setFilters] = useState<PinFilters>(defaultPinFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [listAfterNextPin, setListAfterNextPin] = useState(false);

  const { data, isError, isLoading } = usePins(queryBounds, filters);
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
  const filterCount = activeFilterCount(filters);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 3600);
  }

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
      showToast("Great. Fill the short rent form to publish this pin.");
      return;
    }

    if (isSeekerMode) {
      setSeekerTargetLocation(event.detail.latLng);
      setSeekerMode(false);
      showToast("Now add your search details so matches can reach you.");
    }
  }

  return (
    <div
      className={cn(
        "relative h-dvh w-full overflow-hidden bg-[#0f1120]",
        (isPinPlacementMode || isSeekerMode) && "map-target-mode",
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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:gap-3">
          <GlassSurface
            width="100%"
            height="auto"
            borderRadius={28}
            borderWidth={0.09}
            backgroundOpacity={0.56}
            brightness={100}
            opacity={0.64}
            blur={10}
            saturation={1.28}
            className="pointer-events-auto min-h-[72px] px-1 py-1 sm:min-h-[86px]"
            style={{
              background: "rgba(255, 255, 255, 0.66)",
              border: "1px solid rgba(255, 255, 255, 0.42)",
            }}
          >
            <div className="grid w-full gap-2 px-1.5 py-1.5 sm:gap-3 sm:px-2 sm:py-2 lg:grid-cols-[220px_1fr_auto] lg:items-center">
              <div>
                <h1 className="font-[var(--font-display)] text-xl font-bold leading-none text-[#111827] sm:text-3xl sm:font-extrabold">
                  bengaluru.rent
                </h1>
                <p className="mt-1 hidden text-[11px] font-semibold uppercase tracking-[0.16em] text-[#334155]/65 sm:block">
                  Anonymous rent radar
                </p>
              </div>
              <AreaSearch />
              <div className="flex items-center justify-between gap-2 lg:justify-end">
                <button
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition sm:h-11 sm:gap-2 sm:px-3 sm:text-xs",
                    filters.availableOnly
                      ? "font-bold text-[#047857] sm:font-extrabold"
                      : "text-[#1f2937]/78 hover:text-[#111827]",
                  )}
                  type="button"
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      availableOnly: !current.availableOnly,
                    }))
                  }
                >
                  <Home size={15} />
                  Avlb flats
                </button>
                <button
                  className={cn(
                    "relative inline-flex h-9 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1f2937]/78 transition hover:text-[#111827] sm:h-11 sm:gap-2 sm:px-3 sm:text-xs",
                    showFilters && "text-[#111827]",
                  )}
                  type="button"
                  onClick={() => setShowFilters((open) => !open)}
                >
                  <SlidersHorizontal size={15} />
                  Filter
                  {filterCount ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#f5a524] px-1 text-[10px] text-[#15110a]">
                      {filterCount}
                    </span>
                  ) : null}
                </button>
                <LayerTogglePanel tone="light" />
              </div>
            </div>
          </GlassSurface>

          <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-wrap justify-center gap-2">
            <CommandButton
              icon={<Search size={16} />}
              label="Find a flat"
              onClick={() => {
                setActivePin(null);
                setDraftPinLocation(null);
                setListAfterNextPin(false);
                setSeekerMode(true);
                setPinPlacementMode(false);
                showToast("Click the map where you want to live.");
              }}
            />
            <CommandButton
              icon={<BriefcaseBusiness size={16} />}
              label="List my flat"
              onClick={() => {
                setActivePin(null);
                setDraftPinLocation(null);
                setListAfterNextPin(true);
                setSeekerMode(false);
                setPinPlacementMode(true);
                showToast(
                  "Click your flat location. After the rent pin, listing details open automatically.",
                );
              }}
            />
            <CommandButton
              icon={<BarChart3 size={16} />}
              label="Live stats"
              active={showStats}
              onClick={() => setShowStats((open) => !open)}
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-2 p-2 sm:gap-3 sm:p-5">
        <div className="flex flex-col gap-3">
          <NdviLegend visible={showGreenCover} />
          <div className="hidden sm:block">
            <AreaStatsOverlay
              pins={pins}
              bounds={camera.bounds}
              serverStats={areaStats}
            />
          </div>
          <div className="light-glass-panel max-w-[58vw] rounded-lg px-3 py-2 text-xs font-medium text-[#334155]/78 sm:max-w-[78vw] sm:px-4 sm:py-3 sm:text-sm sm:font-semibold">
            {isLoading
              ? "Loading community rent pins..."
              : isError
                ? "Pins could not load. Check Supabase env vars."
                : isPinPlacementMode
                  ? listAfterNextPin
                    ? "Click your flat location"
                    : "Click the map where the home is"
                  : isSeekerMode
                    ? "Click where you want to live"
                    : `${pins.length.toLocaleString("en-IN")} rent pins visible`}
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            aria-label="Recenter Bengaluru"
            className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#16110d] shadow-lg transition hover:scale-105 sm:h-12 sm:w-12"
            type="button"
            onClick={locateBengaluru}
          >
            <LocateFixed className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            className="flex h-10 items-center rounded-full bg-[#16110d] px-3 text-xs font-semibold text-white shadow-lg transition hover:scale-105 sm:h-12 sm:px-4 sm:text-sm sm:font-bold"
            type="button"
            onClick={() => {
              setActivePin(null);
              setDraftPinLocation(null);
              setListAfterNextPin(false);
              setSeekerMode(false);
              setPinPlacementMode(true);
              showToast("Click the home location to drop an anonymous rent pin.");
            }}
          >
            <Plus className="mr-1.5 h-4 w-4 sm:mr-2 sm:h-[18px] sm:w-[18px]" />
            Drop a Pin
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-white/15 bg-[#101320]/82 px-4 py-2 text-xs font-medium text-white/62 shadow-[0_16px_34px_rgba(0,0,0,0.24)] backdrop-blur md:block">
        Made by: Akshit Gangwar
      </div>

      {toast ? (
        <div className="rent-toast pointer-events-none absolute left-1/2 top-[8.4rem] z-30 max-w-[min(92vw,540px)] -translate-x-1/2 rounded-full border border-[#f5a524]/45 bg-[#151827]/95 px-5 py-3 text-center text-sm font-black text-white shadow-[0_18px_40px_rgba(0,0,0,0.38)] backdrop-blur">
          {toast}
        </div>
      ) : null}

      {showFilters ? (
        <PinFilterPanel
          filters={filters}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      ) : null}

      {showStats ? (
        <LiveStatsPanel pins={pins} onClose={() => setShowStats(false)} />
      ) : null}

      {/* Drop Pin Form — new pin mode */}
      {draftPinLocation ? (
        <DropPinForm
          location={draftPinLocation}
          nearbyPins={pins}
          onClose={() => {
            setDraftPinLocation(null);
            setPinPlacementMode(false);
            setListAfterNextPin(false);
          }}
          onCreated={(pin) => {
            setDraftPinLocation(null);
            if (listAfterNextPin) {
              setListingForPin(pin);
              setListAfterNextPin(false);
            } else {
              setActivePin(pin);
            }
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

function CommandButton({
  active,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(0,0,0,0.26)] backdrop-blur transition hover:-translate-y-0.5 sm:h-11 sm:gap-2 sm:px-4 sm:text-sm sm:font-black",
        active
          ? "border-[#f5a524] bg-[#f5a524] text-[#15110a]"
          : "border-white/12 bg-[#101320]/88 hover:bg-[#181b2e]",
      )}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
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
