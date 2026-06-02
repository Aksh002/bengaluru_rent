"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Mail, Phone, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { PublicPin } from "@/lib/types/pins";
import { cn } from "@/lib/utils/cn";

type ListingPayload = {
  pin_id: string;
  listing_type: "whole_flat" | "room";
  rent_per_room: number | null;
  available_from: "asap" | "next_month" | "flex";
  gender_pref: "male" | "female" | "any";
  smoking_ok: boolean | null;
  food_pref: "veg" | "nonveg" | "any";
  parking_spots: number;
  owner_email: string;
  owner_phone: string;
};

async function getAccessToken() {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const activeSession =
    session ?? (await supabase.auth.signInAnonymously()).data.session;

  if (!activeSession?.access_token) {
    throw new Error("Anonymous session could not be created");
  }

  return activeSession.access_token;
}

async function submitListing(payload: ListingPayload) {
  const token = await getAccessToken();

  const response = await fetch("/api/listings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Could not create listing");
  }

  return body;
}

export function AddListingForm({
  pin,
  onClose,
  onCreated,
}: {
  pin: PublicPin;
  onClose: () => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();

  const [listingType, setListingType] = useState<"whole_flat" | "room">(
    "whole_flat",
  );
  const [rentPerRoom, setRentPerRoom] = useState("");
  const [availableFrom, setAvailableFrom] = useState<
    "asap" | "next_month" | "flex"
  >("asap");
  const [genderPref, setGenderPref] = useState<"male" | "female" | "any">(
    "any",
  );
  const [smokingOk, setSmokingOk] = useState<boolean | null>(null);
  const [foodPref, setFoodPref] = useState<"veg" | "nonveg" | "any">("any");
  const [parkingSpots, setParkingSpots] = useState(0);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  const mutation = useMutation({
    mutationFn: submitListing,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pins"] });
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      onCreated();
    },
  });

  const canSubmit =
    ownerEmail.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim()) &&
    (listingType !== "room" ||
      (Number(rentPerRoom) > 0 && Number(rentPerRoom) < 1_000_000));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;

    mutation.mutate({
      pin_id: pin.id,
      listing_type: listingType,
      rent_per_room: listingType === "room" ? Number(rentPerRoom) : null,
      available_from: availableFrom,
      gender_pref: genderPref,
      smoking_ok: smokingOk,
      food_pref: foodPref,
      parking_spots: parkingSpots,
      owner_email: ownerEmail.trim(),
      owner_phone: ownerPhone.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/25 px-3 pb-3 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button
        aria-label="Close listing form"
        className="absolute inset-0 cursor-default"
        type="button"
        onClick={onClose}
      />

      <form
        className="map-chrome relative grid max-h-[94dvh] w-full max-w-xl overflow-hidden rounded-lg"
        onSubmit={handleSubmit}
      >
        <header className="flex items-start justify-between gap-4 border-b border-black/10 p-4 sm:p-5">
          <div>
            <p className="font-[var(--font-display)] text-2xl font-semibold leading-none">
              📋 Mark as available
            </p>
            <p className="mt-1 text-sm text-[#61584e]">
              {pin.bhk}BHK · ₹{pin.rent.toLocaleString("en-IN")}/mo ·{" "}
              {pin.neighbourhood || "Bengaluru"}
            </p>
          </div>
          <button
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/10 transition hover:bg-black/5"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="grid gap-4 overflow-y-auto p-4 sm:p-5">
          {/* Listing Type */}
          <div className="grid grid-cols-2 gap-3">
            <ToggleOption
              selected={listingType === "whole_flat"}
              onClick={() => setListingType("whole_flat")}
            >
              Whole flat
            </ToggleOption>
            <ToggleOption
              selected={listingType === "room"}
              onClick={() => setListingType("room")}
            >
              Single room
            </ToggleOption>
          </div>

          {/* Rent per room — only for room type */}
          {listingType === "room" ? (
            <label className="grid gap-2">
              <span className="text-sm font-bold">Rent per room (₹/mo)</span>
              <input
                className="h-12 rounded-md border border-black/10 bg-white px-3 font-bold outline-none focus:border-[#16110d]"
                inputMode="numeric"
                placeholder="15000"
                required
                type="number"
                value={rentPerRoom}
                onChange={(e) => setRentPerRoom(e.target.value)}
              />
            </label>
          ) : null}

          {/* Available From */}
          <label className="grid gap-2">
            <span className="text-sm font-bold">Available from</span>
            <span className="relative">
              <select
                className="h-12 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-9 font-bold outline-none focus:border-[#16110d]"
                value={availableFrom}
                onChange={(e) =>
                  setAvailableFrom(
                    e.target.value as typeof availableFrom,
                  )
                }
              >
                <option value="asap">ASAP</option>
                <option value="next_month">Next month</option>
                <option value="flex">Flexible</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#61584e]"
                size={16}
              />
            </span>
          </label>

          {/* Preferences */}
          <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-bold">Gender pref</span>
              <span className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-2 pr-7 text-sm font-bold outline-none"
                  value={genderPref}
                  onChange={(e) =>
                    setGenderPref(e.target.value as typeof genderPref)
                  }
                >
                  <option value="any">Any</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#61584e]"
                  size={14}
                />
              </span>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold">Food</span>
              <span className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-2 pr-7 text-sm font-bold outline-none"
                  value={foodPref}
                  onChange={(e) =>
                    setFoodPref(e.target.value as typeof foodPref)
                  }
                >
                  <option value="any">Any</option>
                  <option value="veg">Veg</option>
                  <option value="nonveg">Non-veg</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#61584e]"
                  size={14}
                />
              </span>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold">Parking</span>
              <span className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-md border border-black/10 bg-white px-2 pr-7 text-sm font-bold outline-none"
                  value={parkingSpots}
                  onChange={(e) => setParkingSpots(Number(e.target.value))}
                >
                  <option value={0}>None</option>
                  <option value={1}>1 spot</option>
                  <option value={2}>2+ spots</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#61584e]"
                  size={14}
                />
              </span>
            </label>
          </div>

          {/* Smoking OK */}
          <div className="grid grid-cols-3 gap-3">
            <ToggleOption
              selected={smokingOk === true}
              onClick={() => setSmokingOk(true)}
            >
              Smoking OK
            </ToggleOption>
            <ToggleOption
              selected={smokingOk === false}
              onClick={() => setSmokingOk(false)}
            >
              No smoking
            </ToggleOption>
            <ToggleOption
              selected={smokingOk === null}
              onClick={() => setSmokingOk(null)}
            >
              No pref
            </ToggleOption>
          </div>

          {/* Contact */}
          <label className="grid gap-2">
            <span className="text-sm font-bold">Your email</span>
            <span className="flex items-center rounded-md border border-black/10 bg-white px-3 focus-within:border-[#16110d]">
              <Mail size={16} className="text-[#61584e]" />
              <input
                className="h-12 min-w-0 flex-1 bg-transparent px-2 outline-none"
                placeholder="you@email.com"
                required
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
              />
            </span>
            <p className="text-xs text-[#61584e]">
              Encrypted. Only shared with matched seekers.
            </p>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Your phone (optional)</span>
            <span className="flex items-center rounded-md border border-black/10 bg-white px-3 focus-within:border-[#16110d]">
              <Phone size={16} className="text-[#61584e]" />
              <input
                className="h-12 min-w-0 flex-1 bg-transparent px-2 outline-none"
                placeholder="+91 98765 43210"
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
              />
            </span>
          </label>

          {mutation.error ? (
            <p className="rounded-md border border-[#d43c2f]/20 bg-[#fff1ee] px-3 py-2 text-sm font-semibold text-[#9d2b22]">
              {mutation.error.message}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-black/10 p-4 sm:p-5">
          <button
            className="rounded-md border border-black/10 px-4 py-3 text-sm font-bold transition hover:bg-black/5"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center rounded-md bg-[#16110d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2d241d] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSubmit || mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 animate-spin" size={16} />
            ) : (
              <Check className="mr-2" size={16} />
            )}
            Mark available
          </button>
        </footer>
      </form>
    </div>
  );
}

function ToggleOption({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-12 rounded-md border px-3 text-sm font-bold transition",
        selected
          ? "border-[#16110d] bg-[#16110d] text-white"
          : "border-black/10 bg-white text-[#16110d] hover:bg-black/5",
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
