import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";
import type { AreaRentStat, PublicPin } from "@/lib/types/pins";
import { roundCoord } from "@/lib/utils/geo";
import { getPgBoss, QUEUES, type ModerateCommentPayload } from "@/lib/queue/pg-boss";
import { moderateComment } from "@/lib/agents/moderation-agent";

type PinSelectRow = {
  id: string;
  lat: number;
  lng: number;
  bhk: number;
  rent: number;
  furnished: boolean;
  furnishing: PublicPin["furnishing"] | null;
  gated: boolean;
  society_name: string | null;
  occupant_type: PublicPin["occupant_type"];
  deposit_months: number | null;
  neighbourhood: string | null;
  created_at: string;
  report_count: number;
  comment: string | null;
  comment_approved: boolean | null;
  rating_avg: number | null;
  rating_count: number | null;
  has_listing: boolean | null;
};

const selectColumns = `
  id,
  lat,
  lng,
  bhk,
  rent,
  furnished,
  furnishing,
  gated,
  society_name,
  occupant_type,
  deposit_months,
  neighbourhood,
  created_at,
  report_count,
  comment,
  comment_approved,
  rating_avg,
  rating_count,
  has_listing
`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bengaluruBounds = {
  minLat: 12.74,
  maxLat: 13.18,
  minLng: 77.38,
  maxLng: 77.86,
};

function toPublicPin(
  pin: PinSelectRow,
  options?: { isOwner?: boolean },
): PublicPin {
  return {
    id: pin.id,
    lat: roundCoord(pin.lat),
    lng: roundCoord(pin.lng),
    bhk: pin.bhk,
    report_count: pin.report_count,
    rating_avg: pin.rating_avg,
    rating_count: pin.rating_count ?? 0,
    has_listing: pin.has_listing === true,
    is_owner: options?.isOwner ?? false,
    rent: pin.rent,
    furnished: pin.furnished,
    furnishing: pin.furnishing ?? (pin.furnished ? "furnished" : "unfurnished"),
    gated: pin.gated,
    society_name: pin.society_name,
    occupant_type: pin.occupant_type,
    deposit_months: pin.deposit_months ?? null,
    neighbourhood: pin.neighbourhood,
    created_at: pin.created_at,
    comment: pin.comment,
    comment_approved: pin.comment_approved,
  };
}

function parseBounds(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[\[\]]/g, "");
  const parts = cleaned.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = parts;
  return { south, west, north, east };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function computeAreaStats(rows: PinSelectRow[]): AreaRentStat[] {
  const grouped = new Map<string, PinSelectRow[]>();

  for (const row of rows) {
    const name = row.neighbourhood || "Selected area";
    const bucket = grouped.get(name) ?? [];
    bucket.push(row);
    grouped.set(name, bucket);
  }

  return Array.from(grouped.entries())
    .filter(([, pins]) => pins.length >= 2)
    .map(([name, pins]) => {
      const byBhk = new Map<number, number[]>();
      for (const pin of pins) {
        const rents = byBhk.get(pin.bhk) ?? [];
        rents.push(pin.rent);
        byBhk.set(pin.bhk, rents);
      }

      return {
        name,
        count: pins.length,
        median_by_bhk: Array.from(byBhk.entries())
          .sort(([a], [b]) => a - b)
          .map(([bhk, rents]) => ({
            bhk,
            median_rent: median(rents),
          })),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

async function getUserIdFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return null;

  const userSupabase = createUserSupabaseClient(accessToken);
  if (!userSupabase) return null;

  const {
    data: { user },
  } = await userSupabase.auth.getUser(accessToken);

  return user?.id ?? null;
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function hashIp(ip: string) {
  const pepper =
    process.env.IP_HASH_PEPPER ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "development-pepper";

  return createHash("sha256").update(`${pepper}:${ip}`).digest("hex");
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = stripHtml(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

function parseFurnishing(value: unknown): PublicPin["furnishing"] | null {
  if (value === "furnished" || value === "semi" || value === "unfurnished") {
    return value;
  }
  return null;
}

async function reverseGeocodeNeighbourhood(lat: number, lng: number) {
  const apiKey =
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) return null;

  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: apiKey,
    result_type: "neighborhood|sublocality|sublocality_level_1|locality",
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      results?: Array<{
        address_components?: Array<{
          long_name: string;
          types: string[];
        }>;
      }>;
    };

    const components = payload.results?.flatMap(
      (result) => result.address_components ?? [],
    );

    return (
      components?.find((component) =>
        component.types.some((type) =>
          [
            "neighborhood",
            "sublocality",
            "sublocality_level_1",
            "sublocality_level_2",
          ].includes(type),
        ),
      )?.long_name ??
      components?.find((component) => component.types.includes("locality"))
        ?.long_name ??
      null
    );
  } catch {
    return null;
  }
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ pins: [] satisfies PublicPin[] });
  }

  const bounds = parseBounds(req.nextUrl.searchParams.get("bounds"));

  let query = supabase
    .from("public_pins")
    .select(selectColumns)
    .eq("is_hidden", false);

  if (bounds) {
    query = query
      .gte("lat", bounds.south)
      .lte("lat", bounds.north)
      .gte("lng", bounds.west)
      .lte("lng", bounds.east);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json(
      { error: "Unable to fetch rent pins", pins: [] },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as PinSelectRow[];

  const userId = await getUserIdFromRequest(req);
  let ownedPins = new Set<string>();

  if (userId) {
    const { data: owned } = await supabase
      .from("pins")
      .select("id")
      .eq("session_id", userId)
      .eq("is_hidden", false);

    ownedPins = new Set((owned ?? []).map((row) => row.id));
  }

  const pins: PublicPin[] = rows.map((row) =>
    toPublicPin(row, { isOwner: ownedPins.has(row.id) }),
  );

  return NextResponse.json({
    pins,
    area_stats: bounds ? computeAreaStats(rows) : [],
  });
}

export async function POST(req: NextRequest) {
  const serviceSupabase = createServiceSupabaseClient();

  if (!serviceSupabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return NextResponse.json(
      { error: "Anonymous session is required" },
      { status: 401 },
    );
  }

  const userSupabase = createUserSupabaseClient(accessToken);
  if (!userSupabase) {
    return NextResponse.json(
      { error: "Supabase auth is not configured" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await userSupabase.auth.getUser(accessToken);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid anonymous session" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return validationError("Invalid JSON body");
  }

  const payload = body as Record<string, unknown>;
  const lat = Number(payload.lat);
  const lng = Number(payload.lng);
  const rent = Number(payload.rent);
  const bhk = Number(payload.bhk);
  const depositMonths =
    payload.deposit_months === null || payload.deposit_months === ""
      ? null
      : Number(payload.deposit_months);
  const occupantType = payload.occupant_type;
  const furnishing =
    parseFurnishing(payload.furnishing) ??
    (parseBoolean(payload.furnished) ? "furnished" : "unfurnished");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return validationError("A map location is required");
  }

  if (
    lat < bengaluruBounds.minLat ||
    lat > bengaluruBounds.maxLat ||
    lng < bengaluruBounds.minLng ||
    lng > bengaluruBounds.maxLng
  ) {
    return validationError("Pins must be within Bengaluru");
  }

  if (!Number.isInteger(bhk) || bhk < 1 || bhk > 6) {
    return validationError("BHK must be between 1 and 6");
  }

  if (!Number.isInteger(rent) || rent < 1000 || rent >= 1_000_000) {
    return validationError("Rent must be between Rs. 1,000 and Rs. 9,99,999");
  }

  if (
    depositMonths !== null &&
    (!Number.isInteger(depositMonths) || depositMonths < 0 || depositMonths > 24)
  ) {
    return validationError("Deposit must be between 0 and 24 months");
  }

  if (
    occupantType !== "family" &&
    occupantType !== "bachelor" &&
    occupantType !== "any"
  ) {
    return validationError("Invalid tenant preference");
  }

  const societyName = normalizeString(payload.society_name, 120);
  const comment = normalizeString(payload.comment, 200);
  const ipHash = hashIp(getClientIp(req));
  const neighbourhood = await reverseGeocodeNeighbourhood(lat, lng);

  const { data: ban } = await serviceSupabase
    .from("ip_bans")
    .select("ip_hash")
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (ban) {
    return NextResponse.json(
      { error: "Pin submissions are blocked from this network" },
      { status: 403 },
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await serviceSupabase
    .from("pins")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if (rateLimitError) {
    return NextResponse.json(
      { error: "Unable to verify rate limit" },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "You can add up to 3 pins in 24 hours" },
      { status: 429 },
    );
  }

  const { data: createdPin, error: insertError } = await serviceSupabase.rpc(
    "create_pin",
    {
      p_lat: lat,
      p_lng: lng,
      p_bhk: bhk,
      p_rent: rent,
      p_furnished: furnishing !== "unfurnished",
      p_gated: parseBoolean(payload.gated),
      p_society_name: societyName,
      p_occupant_type: occupantType,
      p_deposit_months: depositMonths,
      p_comment: comment,
      p_session_id: user.id,
      p_ip_hash: ipHash,
      p_furnishing: furnishing,
      p_neighbourhood: neighbourhood,
    },
  );

  if (insertError || !createdPin) {
    return NextResponse.json(
      { error: "Unable to create pin" },
      { status: 500 },
    );
  }

  const publicPin = toPublicPin(createdPin as unknown as PinSelectRow, {
    isOwner: true,
  });

  // Enqueue comment moderation (non-blocking)
  if (comment) {
    enqueueModeration(publicPin.id, comment).catch((err) => {
      console.error("Failed to enqueue moderation:", err);
    });
  }

  return NextResponse.json({ pin: publicPin }, { status: 201 });
}

/**
 * Enqueue a comment for moderation.
 * Tries pg-boss first, falls back to direct (fire-and-forget) moderation.
 */
async function enqueueModeration(pinId: string, comment: string) {
  if (process.env.ENABLE_PGBOSS_QUEUE === "true") {
    try {
      const boss = await getPgBoss();
      if (boss) {
        const payload: ModerateCommentPayload = { pin_id: pinId, comment };
        await boss.send(QUEUES.MODERATE_COMMENT, payload);
        return;
      }
    } catch {
      // pg-boss not available — fall through
    }
  }

  // Serverless-safe fallback: run moderation out of band for this invocation.
  moderateComment(pinId, comment).catch((err) => {
    console.error("Direct moderation failed:", err);
  });
}
