"use client";

import { InfoWindow } from "@vis.gl/react-google-maps";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Flag,
  Home,
  Loader2,
  Pencil,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { PublicPin } from "@/lib/types/pins";
import { pinAgeLabel } from "@/lib/utils/geo";
import { useMapStore } from "@/store/map-store";

const formatRent = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function furnishingLabel(pin: PublicPin) {
  if (pin.furnishing === "semi") return "Semi-furnished";
  if (pin.furnishing === "furnished" || pin.furnished) return "Furnished";
  return "Unfurnished";
}

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

async function reportPin(pinId: string) {
  const response = await fetch(`/api/pins/${pinId}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Could not report pin");
  }
  return body;
}

async function deletePin(pinId: string) {
  const token = await getAccessToken();

  const response = await fetch(`/api/pins/${pinId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Could not delete pin");
  }
  return body;
}

export function PinInfoPopup({
  pin,
  onClose,
}: {
  pin: PublicPin;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [localityScore, setLocalityScore] = useState(0);
  const [buildQuality, setBuildQuality] = useState(0);

  const ratingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin_id: pin.id,
          locality_score: localityScore,
          build_quality: buildQuality,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to submit rating");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowRatingForm(false);
      // Optimistic cache invalidation could go here
    },
  });

  const isOwner = pin.is_owner === true;

  const setEditingPin = useMapStore((state) => state.setEditingPin);
  const setActivePin = useMapStore((state) => state.setActivePin);
  const setListingForPin = useMapStore((state) => state.setListingForPin);
  const setSeekerMode = useMapStore((state) => state.setSeekerMode);

  const [reportStatus, setReportStatus] = useState<
    "idle" | "loading" | "done" | "error" | "duplicate"
  >("idle");

  const deleteMutation = useMutation({
    mutationFn: () => deletePin(pin.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pins"] });
      onClose();
    },
  });

  async function handleReport() {
    if (reportStatus !== "idle") return;
    setReportStatus("loading");

    try {
      await reportPin(pin.id);
      setReportStatus("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("already reported")) {
        setReportStatus("duplicate");
      } else {
        setReportStatus("error");
      }
    }
  }

  function handleDelete() {
    if (!confirm("Delete this pin? This cannot be undone.")) return;
    deleteMutation.mutate();
  }

  function handleMarkAvailable() {
    setListingForPin(pin);
    setActivePin(null);
  }

  function handleImLooking() {
    setSeekerMode(true);
    setActivePin(null);
  }

  return (
    <InfoWindow position={{ lat: pin.lat, lng: pin.lng }} onClose={onClose}>
      <article className="w-[280px] max-w-[80vw] px-1 py-1 text-[#16110d]">
        {/* Header: Rent + BHK details */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-[var(--font-display)] text-3xl font-semibold leading-none">
              {formatRent.format(pin.rent)}
            </p>
            <p className="mt-1 text-sm text-[#61584e]">
              {pin.bhk}BHK · {furnishingLabel(pin)} ·{" "}
              {pin.gated ? "Gated" : "Open"}
            </p>
          </div>
          <button
            aria-label="Close pin details"
            className="rounded-full border border-black/10 p-1 text-[#61584e] transition hover:bg-black/5"
            type="button"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Pin metadata */}
        <div className="mt-4 space-y-2 text-sm">
          {pin.society_name ? (
            <p className="font-medium">{pin.society_name}</p>
          ) : null}
          <p className="flex items-center gap-2 text-[#61584e]">
            <span>
              {pin.neighbourhood || "Bengaluru"} · posted{" "}
              {pinAgeLabel(pin.created_at)}
            </span>
            {pin.rating_count !== undefined &&
            pin.rating_avg !== undefined &&
            pin.rating_avg !== null &&
            pin.rating_count >= 3 ? (
              <span className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                <Star size={10} className="fill-amber-500 text-amber-500" />
                {pin.rating_avg.toFixed(1)}
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-black/10 bg-[#f7f2e8] px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[#61584e]">
              {pin.occupant_type === "any"
                ? "Any tenant"
                : `${pin.occupant_type} preferred`}
            </span>
            {pin.deposit_months !== null && pin.deposit_months !== undefined ? (
              <span className="inline-flex rounded-full border border-black/10 bg-[#f7f2e8] px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[#61584e]">
                {pin.deposit_months}mo deposit
              </span>
            ) : null}
            {pin.has_listing ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                🏠 Flat available
              </span>
            ) : null}
          </div>
        </div>

        {/* Comment */}
        {pin.comment && pin.comment_approved !== false ? (
          <div className="mt-4 rounded-lg border border-black/10 bg-[#fff9ee] p-3 text-sm">
            <p>{pin.comment}</p>
            {pin.comment_approved === null ? (
              <p className="mt-2 text-xs font-medium text-[#8a6d20]">
                Pending review
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Action row: Report / Rate / Edit / Delete */}
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Report — shown to non-owners */}
          {!isOwner ? (
            <button
              className="flex items-center justify-center rounded-md border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-black/5 disabled:opacity-50"
              type="button"
              disabled={reportStatus !== "idle"}
              onClick={handleReport}
            >
              {reportStatus === "loading" ? (
                <Loader2 className="mr-1 animate-spin" size={14} />
              ) : (
                <Flag className="mr-1" size={14} />
              )}
              {reportStatus === "idle" && "Report"}
              {reportStatus === "loading" && "Reporting…"}
              {reportStatus === "done" && "Reported ✓"}
              {reportStatus === "duplicate" && "Already reported"}
              {reportStatus === "error" && "Try again"}
            </button>
          ) : null}

          {/* Rate — visible to all */}
          <button
            className="flex items-center justify-center rounded-md border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-black/5"
            type="button"
            onClick={() => setShowRatingForm(!showRatingForm)}
          >
            <Star className="mr-1" size={14} />
            Rate
          </button>

          {/* Owner-only actions */}
          {isOwner ? (
            <>
              <button
                className="flex items-center justify-center rounded-md border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-black/5"
                type="button"
                onClick={() => {
                  setEditingPin(pin);
                  setActivePin(null);
                  onClose();
                }}
              >
                <Pencil className="mr-1" size={14} />
                Edit
              </button>
              <button
                className="flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={handleDelete}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-1 animate-spin" size={14} />
                ) : (
                  <Trash2 className="mr-1" size={14} />
                )}
                Delete
              </button>
            </>
          ) : null}
        </div>

        {/* Rating Form Dropdown */}
        {showRatingForm ? (
          <div className="mt-3 rounded-lg border border-black/10 bg-[#fbf9f6] p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-[#16110d]">Locality Quality</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setLocalityScore(s)}
                    className={s <= localityScore ? "text-amber-500" : "text-gray-300"}
                  >
                    <Star size={16} fill={s <= localityScore ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold text-[#16110d]">Building Quality</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBuildQuality(s)}
                    className={s <= buildQuality ? "text-amber-500" : "text-gray-300"}
                  >
                    <Star size={16} fill={s <= buildQuality ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
            {ratingMutation.error ? (
              <p className="mb-2 text-xs text-red-600">
                {ratingMutation.error instanceof Error ? ratingMutation.error.message : "Error"}
              </p>
            ) : null}
            <button
              type="button"
              disabled={localityScore === 0 || buildQuality === 0 || ratingMutation.isPending}
              onClick={() => ratingMutation.mutate()}
              className="w-full rounded bg-[#16110d] py-1.5 text-xs font-bold text-white transition hover:bg-black/80 disabled:opacity-50"
            >
              {ratingMutation.isPending ? "Submitting..." : "Submit Rating"}
            </button>
          </div>
        ) : null}

        {/* Listing/Seeker CTAs */}
        <div className="mt-3 flex gap-2">
          {isOwner && !pin.has_listing ? (
            <button
              className="flex flex-1 items-center justify-center rounded-md border border-black/10 bg-[#f7f2e8] px-3 py-2 text-sm font-semibold transition hover:bg-[#eee7d8]"
              type="button"
              onClick={handleMarkAvailable}
            >
              <ClipboardList className="mr-2" size={16} />
              Mark as available
            </button>
          ) : null}
          <button
            className="flex flex-1 items-center justify-center rounded-md bg-[#16110d] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2d241d]"
            type="button"
            onClick={handleImLooking}
          >
            <Home className="mr-2" size={16} />
            I&apos;m looking
          </button>
        </div>

        {/* Delete error */}
        {deleteMutation.error ? (
          <p className="mt-2 rounded-md border border-[#d43c2f]/20 bg-[#fff1ee] px-2 py-1 text-xs font-semibold text-[#9d2b22]">
            {deleteMutation.error.message}
          </p>
        ) : null}
      </article>
    </InfoWindow>
  );
}
