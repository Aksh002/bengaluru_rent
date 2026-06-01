"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, IndianRupee, Loader2, MapPin, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { PublicPin } from "@/lib/types/pins";
import { cn } from "@/lib/utils/cn";

type DropPinPayload = {
  lat: number;
  lng: number;
  rent: number;
  bhk: number;
  furnished: boolean;
  gated: boolean;
  society_name: string;
  occupant_type: "family" | "bachelor" | "any";
  deposit_months: number | null;
  comment: string;
};

type DropPinResponse = {
  pin: PublicPin;
  error?: string;
};

async function submitPin(payload: DropPinPayload) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const activeSession =
    session ?? (await supabase.auth.signInAnonymously()).data.session;

  if (!activeSession?.access_token) {
    throw new Error("Anonymous session could not be created");
  }

  const response = await fetch("/api/pins", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${activeSession.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as DropPinResponse;
  if (!response.ok) {
    throw new Error(body.error || "Could not drop pin");
  }

  return body.pin;
}

export function DropPinForm({
  location,
  onClose,
  onCreated,
}: {
  location: { lat: number; lng: number };
  onClose: () => void;
  onCreated: (pin: PublicPin) => void;
}) {
  const queryClient = useQueryClient();
  const [rent, setRent] = useState("");
  const [bhk, setBhk] = useState(2);
  const [furnished, setFurnished] = useState(false);
  const [gated, setGated] = useState(false);
  const [societyName, setSocietyName] = useState("");
  const [occupantType, setOccupantType] =
    useState<DropPinPayload["occupant_type"]>("any");
  const [depositMonths, setDepositMonths] = useState("");
  const [comment, setComment] = useState("");

  const mutation = useMutation({
    mutationFn: submitPin,
    onSuccess: async (pin) => {
      await queryClient.invalidateQueries({ queryKey: ["pins"] });
      onCreated(pin);
    },
  });

  const rentValue = Number(rent);
  const depositValue = depositMonths === "" ? null : Number(depositMonths);
  const canSubmit = useMemo(
    () =>
      Number.isInteger(rentValue) &&
      rentValue > 0 &&
      rentValue < 1_000_000 &&
      Number.isInteger(bhk) &&
      bhk >= 1 &&
      bhk <= 6 &&
      (depositValue === null ||
        (Number.isInteger(depositValue) &&
          depositValue >= 0 &&
          depositValue <= 24)),
    [bhk, depositValue, rentValue],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;

    mutation.mutate({
      lat: location.lat,
      lng: location.lng,
      rent: rentValue,
      bhk,
      furnished,
      gated,
      society_name: societyName,
      occupant_type: occupantType,
      deposit_months: depositValue,
      comment,
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/25 px-3 pb-3 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button
        aria-label="Close drop pin form"
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
              Drop a rent pin
            </p>
            <p className="mt-1 text-sm text-[#61584e]">
              Anonymous, approximate, and useful to the next renter.
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
          <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-[#fff8ec] p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[#16110d] text-white">
              <MapPin size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">Selected map point</p>
              <p className="font-mono text-xs text-[#61584e]">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
            </div>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Rent per month</span>
            <span className="flex items-center rounded-md border border-black/10 bg-white px-3 focus-within:border-[#16110d]">
              <IndianRupee size={16} className="text-[#61584e]" />
              <input
                className="h-12 min-w-0 flex-1 bg-transparent px-2 text-lg font-bold outline-none"
                inputMode="numeric"
                min={1}
                max={999999}
                placeholder="35000"
                required
                type="number"
                value={rent}
                onChange={(event) => setRent(event.target.value)}
              />
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-bold">BHK</span>
              <span className="relative">
                <select
                  className="h-12 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-9 font-bold outline-none focus:border-[#16110d]"
                  value={bhk}
                  onChange={(event) => setBhk(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <option key={value} value={value}>
                      {value}BHK
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#61584e]"
                  size={16}
                />
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold">Deposit</span>
              <input
                className="h-12 rounded-md border border-black/10 bg-white px-3 font-bold outline-none focus:border-[#16110d]"
                inputMode="numeric"
                max={24}
                min={0}
                placeholder="months"
                type="number"
                value={depositMonths}
                onChange={(event) => setDepositMonths(event.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToggleButton pressed={furnished} onPressedChange={setFurnished}>
              Furnished
            </ToggleButton>
            <ToggleButton pressed={gated} onPressedChange={setGated}>
              Gated society
            </ToggleButton>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Tenant preference</span>
            <span className="relative">
              <select
                className="h-12 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-9 font-bold outline-none focus:border-[#16110d]"
                value={occupantType}
                onChange={(event) =>
                  setOccupantType(event.target.value as DropPinPayload["occupant_type"])
                }
              >
                <option value="any">Anyone</option>
                <option value="family">Family</option>
                <option value="bachelor">Bachelor</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#61584e]"
                size={16}
              />
            </span>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Society or building</span>
            <input
              className="h-12 rounded-md border border-black/10 bg-white px-3 outline-none focus:border-[#16110d]"
              maxLength={120}
              placeholder="Optional"
              value={societyName}
              onChange={(event) => setSocietyName(event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Comment</span>
            <textarea
              className="min-h-24 resize-none rounded-md border border-black/10 bg-white p-3 outline-none focus:border-[#16110d]"
              maxLength={500}
              placeholder="Optional: maintenance, water, noise, broker story..."
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
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
            Submit pin
          </button>
        </footer>
      </form>
    </div>
  );
}

function ToggleButton({
  children,
  pressed,
  onPressedChange,
}: {
  children: React.ReactNode;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <button
      className={cn(
        "h-12 rounded-md border px-3 text-sm font-bold transition",
        pressed
          ? "border-[#16110d] bg-[#16110d] text-white"
          : "border-black/10 bg-white text-[#16110d] hover:bg-black/5",
      )}
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
    >
      {children}
    </button>
  );
}
