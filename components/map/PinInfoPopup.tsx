"use client";

import { InfoWindow } from "@vis.gl/react-google-maps";
import { Flag, Home, Pencil, Star, X } from "lucide-react";
import type { PublicPin } from "@/lib/types/pins";
import { pinAgeLabel } from "@/lib/utils/geo";

const formatRent = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function PinInfoPopup({
  pin,
  onClose,
}: {
  pin: PublicPin;
  onClose: () => void;
}) {
  return (
    <InfoWindow position={{ lat: pin.lat, lng: pin.lng }} onClose={onClose}>
      <article className="w-[280px] max-w-[80vw] px-1 py-1 text-[#16110d]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-[var(--font-display)] text-3xl font-semibold leading-none">
              {formatRent.format(pin.rent)}
            </p>
            <p className="mt-1 text-sm text-[#61584e]">
              {pin.bhk}BHK · {pin.furnished ? "Furnished" : "Unfurnished"} ·{" "}
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

        <div className="mt-4 space-y-2 text-sm">
          {pin.society_name ? (
            <p className="font-medium">{pin.society_name}</p>
          ) : null}
          <p className="text-[#61584e]">
            {pin.neighbourhood || "Bengaluru"} · posted {pinAgeLabel(pin.created_at)}
          </p>
          <p className="inline-flex rounded-full border border-black/10 bg-[#f7f2e8] px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[#61584e]">
            {pin.occupant_type === "any"
              ? "Any tenant"
              : `${pin.occupant_type} preferred`}
          </p>
        </div>

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

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            className="flex items-center justify-center rounded-md border border-black/10 px-2 py-2 text-xs font-semibold transition hover:bg-black/5"
            type="button"
          >
            <Flag className="mr-1" size={14} />
            Report
          </button>
          <button
            className="flex items-center justify-center rounded-md border border-black/10 px-2 py-2 text-xs font-semibold transition hover:bg-black/5"
            type="button"
          >
            <Star className="mr-1" size={14} />
            Rate
          </button>
          <button
            className="flex items-center justify-center rounded-md border border-black/10 px-2 py-2 text-xs font-semibold transition hover:bg-black/5"
            type="button"
          >
            <Pencil className="mr-1" size={14} />
            Edit
          </button>
        </div>

        <button
          className="mt-3 flex w-full items-center justify-center rounded-md bg-[#16110d] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2d241d]"
          type="button"
        >
          <Home className="mr-2" size={16} />
          I&apos;m looking
        </button>
      </article>
    </InfoWindow>
  );
}
