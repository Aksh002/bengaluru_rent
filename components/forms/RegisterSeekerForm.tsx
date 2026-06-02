"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  IndianRupee,
  Loader2,
  Mail,
  MapPin,
  Phone,
  SearchCheck,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

type SeekerPayload = {
  lat: number;
  lng: number;
  looking_for: "whole_flat" | "room" | "any";
  budget_min: number;
  budget_max: number;
  bhk_pref: number | null;
  radius_km: number;
  email: string;
  phone: string;
  gender: "male" | "female" | "other" | null;
  lifestyle_note: string;
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

async function submitSeeker(payload: SeekerPayload) {
  const token = await getAccessToken();

  const response = await fetch("/api/seekers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Could not register");
  }

  return body;
}

export function RegisterSeekerForm({
  location,
  onClose,
}: {
  location: { lat: number; lng: number };
  onClose: () => void;
}) {
  const [lookingFor, setLookingFor] = useState<
    "whole_flat" | "room" | "any"
  >("any");
  const [budgetMin, setBudgetMin] = useState("5000");
  const [budgetMax, setBudgetMax] = useState("30000");
  const [bhkPref, setBhkPref] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState(2.5);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<string>("");
  const [lifestyleNote, setLifestyleNote] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: submitSeeker,
    onSuccess: () => {
      setShowSuccess(true);
    },
  });
  const activeSearchExists =
    mutation.error instanceof Error &&
    mutation.error.message.toLowerCase().includes("active flat search");

  const canSubmit =
    email.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    Number(budgetMax) > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;

    mutation.mutate({
      lat: location.lat,
      lng: location.lng,
      looking_for: lookingFor,
      budget_min: Number(budgetMin) || 0,
      budget_max: Number(budgetMax),
      bhk_pref: bhkPref ? Number(bhkPref) : null,
      radius_km: radiusKm,
      email: email.trim(),
      phone: phone.trim(),
      gender: gender ? (gender as "male" | "female" | "other") : null,
      lifestyle_note: lifestyleNote.trim(),
    });
  }

  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/25 px-3 pb-3 backdrop-blur-[2px] sm:items-center sm:p-6">
        <div className="map-chrome relative w-full max-w-md rounded-lg p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50">
            <SearchCheck className="text-emerald-600" size={28} />
          </div>
          <p className="mt-4 font-[var(--font-display)] text-2xl font-semibold">
            You&apos;re on the list!
          </p>
          <p className="mt-2 text-sm text-[#61584e]">
            Claude checks for matches every night and will email you when
            something fits. Your search expires in 30 days.
          </p>
          <button
            className="mt-6 inline-flex items-center rounded-md bg-[#16110d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#2d241d]"
            type="button"
            onClick={onClose}
          >
            Back to map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/25 px-3 pb-3 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button
        aria-label="Close seeker form"
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
              🔍 Find a flat
            </p>
            <p className="mt-1 text-sm text-[#61584e]">
              Get matched with available flats nightly by Claude.
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
          {/* Target location */}
          <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-[#fff8ec] p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[#16110d] text-white">
              <MapPin size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">Target area</p>
              <p className="font-mono text-xs text-[#61584e]">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
            </div>
          </div>

          {/* Looking for */}
          <div>
            <p className="mb-2 text-sm font-bold">Looking for</p>
            <div className="grid grid-cols-3 gap-3">
              <ToggleOption
                selected={lookingFor === "any"}
                onClick={() => setLookingFor("any")}
              >
                Either
              </ToggleOption>
              <ToggleOption
                selected={lookingFor === "whole_flat"}
                onClick={() => setLookingFor("whole_flat")}
              >
                Whole flat
              </ToggleOption>
              <ToggleOption
                selected={lookingFor === "room"}
                onClick={() => setLookingFor("room")}
              >
                Room
              </ToggleOption>
            </div>
          </div>

          {/* Budget range */}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-bold">Budget min (₹)</span>
              <span className="flex items-center rounded-md border border-black/10 bg-white px-3 focus-within:border-[#16110d]">
                <IndianRupee size={14} className="text-[#61584e]" />
                <input
                  className="h-12 min-w-0 flex-1 bg-transparent px-2 font-bold outline-none"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="5000"
                  type="text"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                />
              </span>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Budget max (₹)</span>
              <span className="flex items-center rounded-md border border-black/10 bg-white px-3 focus-within:border-[#16110d]">
                <IndianRupee size={14} className="text-[#61584e]" />
                <input
                  className="h-12 min-w-0 flex-1 bg-transparent px-2 font-bold outline-none"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="30000"
                  required
                  type="text"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                />
              </span>
            </label>
          </div>

          {/* BHK + Radius */}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-bold">BHK preference</span>
              <span className="relative">
                <select
                  className="h-12 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-9 font-bold outline-none focus:border-[#16110d]"
                  value={bhkPref}
                  onChange={(e) => setBhkPref(e.target.value)}
                >
                  <option value="">Any</option>
                  {[1, 2, 3, 4, 5, 6].map((v) => (
                    <option key={v} value={v}>
                      {v}BHK
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
              <span className="text-sm font-bold">Search radius</span>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2.5, 5].map((r) => (
                  <ToggleOption
                    key={r}
                    selected={radiusKm === r}
                    onClick={() => setRadiusKm(r)}
                  >
                    {r}km
                  </ToggleOption>
                ))}
              </div>
            </label>
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </span>
            <p className="text-xs text-[#61584e]">
              Encrypted. Only shared when a match is found.
            </p>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Phone (optional)</span>
            <span className="flex items-center rounded-md border border-black/10 bg-white px-3 focus-within:border-[#16110d]">
              <Phone size={16} className="text-[#61584e]" />
              <input
                className="h-12 min-w-0 flex-1 bg-transparent px-2 outline-none"
                placeholder="+91 98765 43210"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </span>
          </label>

          {/* Gender + lifestyle */}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-bold">Gender</span>
              <span className="relative">
                <select
                  className="h-12 w-full appearance-none rounded-md border border-black/10 bg-white px-3 pr-9 font-bold outline-none focus:border-[#16110d]"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#61584e]"
                  size={16}
                />
              </span>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Lifestyle note (optional)</span>
            <textarea
              className="min-h-20 resize-none rounded-md border border-black/10 bg-white p-3 outline-none focus:border-[#16110d]"
              maxLength={200}
              placeholder="Working professional, non-smoker, vegetarian..."
              value={lifestyleNote}
              onChange={(e) => setLifestyleNote(e.target.value)}
            />
          </label>

          {mutation.error ? (
            <p className="rounded-md border border-[#d43c2f]/20 bg-[#fff1ee] px-3 py-2 text-sm font-semibold text-[#9d2b22]">
              {activeSearchExists
                ? "You already have an active search from this device. For testing, use another browser/session or deactivate the existing seeker row in Supabase."
                : mutation.error.message}
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
            Start matching
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
