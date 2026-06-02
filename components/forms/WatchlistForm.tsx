"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, X, Bell } from "lucide-react";
import { useState } from "react";

export function WatchlistForm({
  location,
  onClose,
}: {
  location: { lat: number; lng: number };
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [radius, setRadius] = useState("2.5");
  const [bhk, setBhk] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          radius_km: Number(radius),
          bhk_pref: bhk ? Number(bhk) : null,
          max_rent: maxRent ? Number(maxRent) : null,
          email,
          phone,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create alert");
      }

      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
    },
  });

  if (success) {
    return (
      <div className="command-panel pointer-events-auto absolute bottom-4 left-4 right-4 z-50 p-6 sm:bottom-8 sm:left-auto sm:right-8 sm:w-[400px]">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <Bell size={24} />
          </div>
          <h3 className="mt-4 font-[var(--font-display)] text-xl font-bold text-white">
            Alert Created
          </h3>
          <p className="mt-2 text-sm text-white/56">
            We&apos;ll email you as soon as a matching listing is added in this area.
          </p>
          <button
            className="mt-6 w-full rounded-lg bg-[#16110d] py-3 text-sm font-bold text-white transition hover:bg-black/80"
            type="button"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="command-panel map-modal-panel pointer-events-auto absolute bottom-0 left-0 right-0 z-50 sm:bottom-8 sm:left-auto sm:right-8 sm:w-[420px]">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-white">
          Set Area Alert
        </h2>
        <button
          className="rounded-full p-2 text-white/58 transition hover:bg-white/10 hover:text-white"
          type="button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <form
        className="max-h-[80vh] overflow-y-auto p-6"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-white/45">
                Radius (km)
              </label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              >
                <option value="1">1 km</option>
                <option value="2.5">2.5 km</option>
                <option value="5">5 km</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-white/45">
                BHK (Optional)
              </label>
              <select
                className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none"
                value={bhk}
                onChange={(e) => setBhk(e.target.value)}
              >
                <option value="">Any</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} BHK
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-white/45">
              Max Rent (Optional)
            </label>
            <input
              className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 40000"
              type="text"
              value={maxRent}
              onChange={(e) => setMaxRent(e.target.value)}
            />
          </div>

          <div className="pt-2">
              <h3 className="mb-3 text-sm font-bold text-white">
              Where should we send alerts?
            </h3>
            <div className="space-y-3">
              <input
                required
                className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="w-full rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                placeholder="Phone number (optional)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-white/42">
              Your contact info is encrypted and never shared. Alerts expire automatically after 30 days.
            </p>
          </div>

          {mutation.error ? (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Failed to set alert"}
            </p>
          ) : null}

          <button
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-[#16110d] py-3 text-sm font-bold text-white transition hover:bg-black/80 disabled:opacity-50"
            disabled={mutation.isPending || !email}
            type="submit"
          >
            {mutation.isPending ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              "Create Alert"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
