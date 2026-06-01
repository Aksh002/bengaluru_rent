import { create } from "zustand";
import type { PublicPin } from "@/lib/types/pins";

type MapState = {
  activePin: PublicPin | null;
  setActivePin: (pin: PublicPin | null) => void;
  isPinPlacementMode: boolean;
  setPinPlacementMode: (enabled: boolean) => void;
  draftPinLocation: { lat: number; lng: number } | null;
  setDraftPinLocation: (location: { lat: number; lng: number } | null) => void;
};

export const useMapStore = create<MapState>((set) => ({
  activePin: null,
  setActivePin: (pin) => set({ activePin: pin }),
  isPinPlacementMode: false,
  setPinPlacementMode: (enabled) => set({ isPinPlacementMode: enabled }),
  draftPinLocation: null,
  setDraftPinLocation: (location) => set({ draftPinLocation: location }),
}));
