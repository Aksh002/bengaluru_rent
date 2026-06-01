import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";
import type { PublicPin } from "@/lib/types/pins";
import { roundCoord } from "@/lib/utils/geo";

type PinSelectRow = Omit<PublicPin, "lat" | "lng"> & {
  lat: number;
  lng: number;
};

const selectColumns = `
  id,
  lat,
  lng,
  bhk,
  rent,
  furnished,
  gated,
  society_name,
  occupant_type,
  neighbourhood,
  created_at,
  report_count,
  comment,
  comment_approved
`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bengaluruBounds = {
  minLat: 12.74,
  maxLat: 13.18,
  minLng: 77.38,
  maxLng: 77.86,
};

function toPublicPin(pin: PinSelectRow): PublicPin {
  return {
    id: pin.id,
    lat: roundCoord(pin.lat),
    lng: roundCoord(pin.lng),
    bhk: pin.bhk,
    rent: pin.rent,
    furnished: pin.furnished,
    gated: pin.gated,
    society_name: pin.society_name,
    occupant_type: pin.occupant_type,
    neighbourhood: pin.neighbourhood,
    created_at: pin.created_at,
    report_count: pin.report_count,
    comment: pin.comment,
    comment_approved: pin.comment_approved,
  };
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
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ pins: [] satisfies PublicPin[] });
  }

  const { data, error } = await supabase
    .from("pins")
    .select(selectColumns)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json(
      { error: "Unable to fetch rent pins", pins: [] },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as PinSelectRow[];

  const pins: PublicPin[] = rows.map(toPublicPin);

  return NextResponse.json({ pins });
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

  if (!Number.isInteger(rent) || rent <= 0 || rent >= 1_000_000) {
    return validationError("Rent must be below Rs. 10,00,000");
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
  const comment = normalizeString(payload.comment, 500);
  const ipHash = hashIp(getClientIp(req));

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
      p_furnished: parseBoolean(payload.furnished),
      p_gated: parseBoolean(payload.gated),
      p_society_name: societyName,
      p_occupant_type: occupantType,
      p_deposit_months: depositMonths,
      p_comment: comment,
      p_session_id: user.id,
      p_ip_hash: ipHash,
    },
  );

  if (insertError || !createdPin) {
    return NextResponse.json(
      { error: "Unable to create pin" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { pin: toPublicPin(createdPin as PinSelectRow) },
    { status: 201 },
  );
}
