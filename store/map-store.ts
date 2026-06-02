import { create } from "zustand";
import type { PublicPin } from "@/lib/types/pins";

type MapState = {
  // Active pin popup
  activePin: PublicPin | null;
  setActivePin: (pin: PublicPin | null) => void;

  // Pin placement mode (new pin)
  isPinPlacementMode: boolean;
  setPinPlacementMode: (enabled: boolean) => void;
  draftPinLocation: { lat: number; lng: number } | null;
  setDraftPinLocation: (location: { lat: number; lng: number } | null) => void;

  // Pin editing
  editingPin: PublicPin | null;
  setEditingPin: (pin: PublicPin | null) => void;

  // Seeker registration
  isSeekerMode: boolean;
  setSeekerMode: (enabled: boolean) => void;
  seekerTargetLocation: { lat: number; lng: number } | null;
  setSeekerTargetLocation: (location: { lat: number; lng: number } | null) => void;

  // Listing form
  listingForPin: PublicPin | null;
  setListingForPin: (pin: PublicPin | null) => void;

  // Watchlist
  isWatchlistMode: boolean;
  setWatchlistMode: (enabled: boolean) => void;
  watchlistTargetLocation: { lat: number; lng: number } | null;
  setWatchlistTargetLocation: (location: { lat: number; lng: number } | null) => void;

  // Map layers
  showMetroLayer: boolean;
  setShowMetroLayer: (show: boolean) => void;
  showGreenCover: boolean;
  setShowGreenCover: (show: boolean) => void;
};

export const useMapStore = create<MapState>((set) => ({
  activePin: null,
  setActivePin: (pin) => set({ activePin: pin }),
  isPinPlacementMode: false,
  setPinPlacementMode: (enabled) => set({ isPinPlacementMode: enabled }),
  draftPinLocation: null,
  setDraftPinLocation: (location) => set({ draftPinLocation: location }),
  editingPin: null,
  setEditingPin: (pin) => set({ editingPin: pin }),
  isSeekerMode: false,
  setSeekerMode: (enabled) => set({ isSeekerMode: enabled }),
  seekerTargetLocation: null,
  setSeekerTargetLocation: (location) => set({ seekerTargetLocation: location }),
  listingForPin: null,
  setListingForPin: (pin) => set({ listingForPin: pin }),
  isWatchlistMode: false,
  setWatchlistMode: (enabled) => set({ isWatchlistMode: enabled }),
  watchlistTargetLocation: null,
  setWatchlistTargetLocation: (location) => set({ watchlistTargetLocation: location }),
  showMetroLayer: false,
  setShowMetroLayer: (show) => set({ showMetroLayer: show }),
  showGreenCover: false,
  setShowGreenCover: (show) => set({ showGreenCover: show }),
}));
