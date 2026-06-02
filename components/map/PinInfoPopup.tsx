"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ClipboardList,
  Flag,
  Home,
  Loader2,
  Map,
  MessageCircle,
  Navigation,
  Pencil,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { PinComment, PublicPin } from "@/lib/types/pins";
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

function pluralizeRating(count: number) {
  return `${count} ${count === 1 ? "rating" : "ratings"}`;
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

async function fetchComments(pinId: string) {
  const response = await fetch(`/api/pins/${pinId}/comments`);
  const body = (await response.json()) as {
    comments?: PinComment[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || "Could not load comments");
  }

  return body.comments ?? [];
}

async function createComment(pinId: string, comment: string) {
  const token = await getAccessToken();
  const response = await fetch(`/api/pins/${pinId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ comment }),
  });

  const body = (await response.json()) as {
    comment?: PinComment;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || "Could not add comment");
  }

  return body.comment;
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
  const [commentText, setCommentText] = useState("");

  const isOwner = pin.is_owner === true;
  const ratingCount = pin.rating_count ?? 0;
  const hasRating =
    pin.rating_avg !== null && pin.rating_avg !== undefined && ratingCount > 0;

  const setEditingPin = useMapStore((state) => state.setEditingPin);
  const setActivePin = useMapStore((state) => state.setActivePin);
  const setListingForPin = useMapStore((state) => state.setListingForPin);
  const setSeekerMode = useMapStore((state) => state.setSeekerMode);
  const setSeekerTargetLocation = useMapStore(
    (state) => state.setSeekerTargetLocation,
  );
  const setWatchlistTargetLocation = useMapStore(
    (state) => state.setWatchlistTargetLocation,
  );

  const commentsQuery = useQuery({
    queryKey: ["pin-comments", pin.id],
    queryFn: () => fetchComments(pin.id),
  });

  const ratingMutation = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
    onSuccess: async () => {
      setShowRatingForm(false);
      setLocalityScore(0);
      setBuildQuality(0);
      await queryClient.invalidateQueries({ queryKey: ["pins"] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => createComment(pin.id, commentText),
    onSuccess: async () => {
      setCommentText("");
      await queryClient.invalidateQueries({ queryKey: ["pin-comments", pin.id] });
    },
  });

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

  function handleFindNearThis() {
    setSeekerTargetLocation({ lat: pin.lat, lng: pin.lng });
    setSeekerMode(false);
    setActivePin(null);
  }

  function handleWatchArea() {
    setWatchlistTargetLocation({ lat: pin.lat, lng: pin.lng });
    setActivePin(null);
  }

  function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commentText.trim().length < 3 || commentMutation.isPending) return;
    commentMutation.mutate();
  }

  async function handleShare() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/?pin=${pin.id}`,
    );
  }

  const comments = commentsQuery.data ?? [];

  return (
    <div
      className="pin-dossier-backdrop fixed inset-0 z-40 grid place-items-center bg-[#050712]/62 px-3 py-5 backdrop-blur-[8px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <article className="pin-dossier relative max-h-[min(88dvh,760px)] w-[min(500px,calc(100vw-24px))] overflow-y-auto rounded-[1.25rem] border border-white/12 bg-[#151626]/96 p-5 text-white shadow-[0_28px_90px_rgba(0,0,0,0.56)] sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/44">
              Monthly rent
            </p>
            <p className="mt-1 font-[var(--font-display)] text-5xl font-black leading-none text-white">
              {formatRent.format(pin.rent)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton label="Share pin" onClick={handleShare}>
              <Share2 size={16} />
            </IconButton>
            {!isOwner ? (
              <IconButton
                label="Report pin"
                disabled={reportStatus !== "idle"}
                onClick={handleReport}
              >
                {reportStatus === "loading" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Flag size={16} />
                )}
              </IconButton>
            ) : null}
            <IconButton label="Close pin details" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap gap-2">
          <DataChip tone="violet">{pin.bhk} BHK</DataChip>
          <DataChip tone="amber">{furnishingLabel(pin)}</DataChip>
          <DataChip tone="emerald">
            {pin.gated ? "Gated society" : "Open building"}
          </DataChip>
          <DataChip tone="neutral">
            {pin.occupant_type === "any"
              ? "Any tenant"
              : `${pin.occupant_type} preferred`}
          </DataChip>
          {pin.deposit_months !== null && pin.deposit_months !== undefined ? (
            <DataChip tone="neutral">{pin.deposit_months} mo deposit</DataChip>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 border-y border-white/8 py-4 text-sm text-white/68 sm:grid-cols-3">
          <MetaItem icon={<Map size={15} />}>
            {pin.society_name || pin.neighbourhood || "Bengaluru"}
          </MetaItem>
          <MetaItem icon={<Navigation size={15} />}>
            {pin.neighbourhood || "Nearby area"}
          </MetaItem>
          <MetaItem icon={<Star size={15} className="fill-amber-300 text-amber-300" />}>
            {hasRating
              ? `${pin.rating_avg?.toFixed(1)} · ${pluralizeRating(ratingCount)}`
              : "No ratings yet"}
          </MetaItem>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold">
          <span className="text-white/48">Pinned {pinAgeLabel(pin.created_at)}</span>
          {pin.has_listing ? (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/14 px-3 py-1 text-emerald-200">
              Flat available
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-white/58">
              Not currently listed
            </span>
          )}
          {reportStatus === "done" ? (
            <span className="text-white/48">Reported</span>
          ) : null}
          {reportStatus === "duplicate" ? (
            <span className="text-white/48">Already reported</span>
          ) : null}
        </div>

        <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-500/18 text-pink-200">
              <Home size={17} />
            </div>
            <div className="min-w-0">
              <p className="font-black text-white">
                {pin.has_listing ? "Available flat attached" : "Not for rent"}
              </p>
              <p className="mt-1 text-sm leading-6 text-white/60">
                {pin.has_listing
                  ? "This rent pin has an active availability listing."
                  : "This person pinned rent for transparency. You can still search or set an alert nearby."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center rounded-md bg-[#f5a524] px-3 py-2 text-xs font-black text-[#16110d] transition hover:brightness-110"
                  type="button"
                  onClick={handleFindNearThis}
                >
                  <Home className="mr-2" size={14} />
                  Find near this
                </button>
                <button
                  className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/82 transition hover:bg-white/10"
                  type="button"
                  onClick={handleWatchArea}
                >
                  <Bell className="mr-2" size={14} />
                  Notify me here
                </button>
                {isOwner && !pin.has_listing ? (
                  <button
                    className="inline-flex items-center rounded-md border border-emerald-300/30 bg-emerald-400/14 px-3 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-400/20"
                    type="button"
                    onClick={handleMarkAvailable}
                  >
                    <ClipboardList className="mr-2" size={14} />
                    List my flat
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 border-b border-white/8 pb-5">
          <button
            className="flex w-full items-center justify-between text-left"
            type="button"
            onClick={() => setShowRatingForm((show) => !show)}
          >
            <span>
              <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white/42">
                Community rating
              </span>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-black text-amber-300">
                <Star size={15} className="fill-amber-300 text-amber-300" />
                {hasRating
                  ? `${pin.rating_avg?.toFixed(1)} · ${pluralizeRating(ratingCount)}`
                  : "No ratings yet"}
              </span>
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/62">
              Rate
            </span>
          </button>

          {showRatingForm ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm">
              <RatingRow
                label="Locality quality"
                value={localityScore}
                onChange={setLocalityScore}
              />
              <RatingRow
                label="Building quality"
                value={buildQuality}
                onChange={setBuildQuality}
              />
              {ratingMutation.error ? (
                <p className="mt-3 rounded-md border border-red-300/20 bg-red-500/12 px-3 py-2 text-xs font-bold text-red-200">
                  {ratingMutation.error instanceof Error
                    ? ratingMutation.error.message
                    : "Could not submit rating"}
                </p>
              ) : null}
              <button
                className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-white px-4 py-3 text-xs font-black text-[#151626] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
                type="button"
                disabled={
                  localityScore === 0 ||
                  buildQuality === 0 ||
                  ratingMutation.isPending
                }
                onClick={() => ratingMutation.mutate()}
              >
                {ratingMutation.isPending ? (
                  <Loader2 className="mr-2 animate-spin" size={15} />
                ) : null}
                Submit rating
              </button>
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">
              Comments
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] font-black text-white/48">
              <MessageCircle size={12} />
              {comments.length + (pin.comment && pin.comment_approved !== false ? 1 : 0)}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {pin.comment && pin.comment_approved !== false ? (
              <CommentCard
                body={pin.comment}
                meta={
                  pin.comment_approved === null
                    ? "Original pin note - pending review"
                    : "Original pin note"
                }
              />
            ) : null}

            {commentsQuery.isLoading ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/52">
                Loading comments...
              </p>
            ) : null}

            {comments.map((comment) => (
              <CommentCard
                key={comment.id}
                body={comment.body}
                meta={pinAgeLabel(comment.created_at)}
              />
            ))}

            {!commentsQuery.isLoading &&
            comments.length === 0 &&
            (!pin.comment || pin.comment_approved === false) ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/52">
                No comments yet.
              </p>
            ) : null}
          </div>

          <form className="mt-4 grid gap-3" onSubmit={handleCommentSubmit}>
            <textarea
              className="min-h-24 resize-none rounded-xl border border-white/10 bg-white/[0.07] p-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#f5a524]/70"
              maxLength={240}
              placeholder="Add a local note about this building or area"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
            {commentMutation.error ? (
              <p className="rounded-md border border-red-300/20 bg-red-500/12 px-3 py-2 text-xs font-bold text-red-200">
                {commentMutation.error instanceof Error
                  ? commentMutation.error.message
                  : "Could not add comment"}
              </p>
            ) : null}
            <button
              className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.08] px-4 py-3 text-xs font-black text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
              type="submit"
              disabled={commentText.trim().length < 3 || commentMutation.isPending}
            >
              {commentMutation.isPending ? (
                <Loader2 className="mr-2 animate-spin" size={15} />
              ) : (
                <MessageCircle className="mr-2" size={15} />
              )}
              Add comment
            </button>
          </form>
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          {isOwner ? (
            <>
              <button
                className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-white/76 transition hover:bg-white/10"
                type="button"
                onClick={() => {
                  setEditingPin(pin);
                  setActivePin(null);
                  onClose();
                }}
              >
                <Pencil className="mr-2" size={14} />
                Edit
              </button>
              <button
                className="inline-flex items-center rounded-md border border-red-300/25 bg-red-500/14 px-3 py-2 text-xs font-black text-red-200 transition hover:bg-red-500/22 disabled:opacity-50"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={handleDelete}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-2 animate-spin" size={14} />
                ) : (
                  <Trash2 className="mr-2" size={14} />
                )}
                Delete
              </button>
            </>
          ) : null}
        </div>

        {deleteMutation.error ? (
          <p className="mt-3 rounded-md border border-red-300/20 bg-red-500/12 px-3 py-2 text-xs font-bold text-red-200">
            {deleteMutation.error.message}
          </p>
        ) : null}
      </article>
    </div>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/[0.13] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DataChip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "amber" | "emerald" | "neutral" | "violet";
}) {
  const classes = {
    amber: "border-amber-300/28 bg-amber-400/12 text-amber-200",
    emerald: "border-emerald-300/28 bg-emerald-400/12 text-emerald-200",
    neutral: "border-white/10 bg-white/[0.06] text-white/62",
    violet: "border-violet-300/28 bg-violet-400/14 text-violet-200",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-sm font-black ${classes[tone]}`}>
      {children}
    </span>
  );
}

function MetaItem({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-[#f5a524]">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

function RatingRow({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <span className="text-sm font-bold text-white/72">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            aria-label={`${label} ${score}`}
            className={score <= value ? "text-amber-300" : "text-white/22"}
            type="button"
            onClick={() => onChange(score)}
          >
            <Star
              size={18}
              fill={score <= value ? "currentColor" : "none"}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CommentCard({ body, meta }: { body: string; meta: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <p className="text-sm leading-6 text-white/86">{body}</p>
      <p className="mt-2 text-xs font-bold text-white/36">{meta}</p>
    </div>
  );
}
