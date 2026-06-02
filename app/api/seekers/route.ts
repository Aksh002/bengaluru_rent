import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_LOOKING_FOR = ["whole_flat", "room", "any"] as const;
const VALID_GENDER = ["male", "female", "other"] as const;

const bengaluruBounds = {
  minLat: 12.74,
  maxLat: 13.18,
  minLng: 77.38,
  maxLng: 77.86,
};

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * POST /api/seekers — Register as a flat/room seeker.
 * Encrypts contact info, creates PostGIS geometry for spatial matching.
 */
export async function POST(req: NextRequest) {
  const serviceSupabase = createServiceSupabaseClient();
  if (!serviceSupabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  // Authenticate user
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

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return validationError("Invalid JSON body");
  }

  // Validate location
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return validationError("A target location is required");
  }
  if (
    lat < bengaluruBounds.minLat ||
    lat > bengaluruBounds.maxLat ||
    lng < bengaluruBounds.minLng ||
    lng > bengaluruBounds.maxLng
  ) {
    return validationError("Location must be within Bengaluru");
  }

  // Validate looking_for
  const lookingFor = body.looking_for;
  if (!VALID_LOOKING_FOR.includes(lookingFor as typeof VALID_LOOKING_FOR[number])) {
    return validationError("Looking for must be whole_flat, room, or any");
  }

  // Validate budget
  const budgetMin = Number(body.budget_min ?? 0);
  const budgetMax = Number(body.budget_max);
  if (
    !Number.isInteger(budgetMin) ||
    budgetMin < 0 ||
    !Number.isInteger(budgetMax) ||
    budgetMax <= 0 ||
    budgetMax >= 1_000_000
  ) {
    return validationError("Budget max must be between ₹1 and ₹9,99,999");
  }
  if (budgetMin > budgetMax) {
    return validationError("Budget min cannot exceed budget max");
  }

  // BHK preference (optional)
  const bhkPref =
    body.bhk_pref === null || body.bhk_pref === undefined
      ? null
      : Number(body.bhk_pref);
  if (bhkPref !== null && (!Number.isInteger(bhkPref) || bhkPref < 1 || bhkPref > 6)) {
    return validationError("BHK preference must be between 1 and 6");
  }

  // Radius
  const radiusKm = Number(body.radius_km ?? 2.5);
  if (![1, 2.5, 5].includes(radiusKm)) {
    return validationError("Radius must be 1, 2.5, or 5 km");
  }

  // Email required
  const email =
    typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return validationError("A valid email is required");
  }

  // Junk email check
  const junkEmails = [
    "test@test.com",
    "a@a.com",
    "abc@abc.com",
    "admin@admin.com",
  ];
  if (junkEmails.includes(email.toLowerCase())) {
    return validationError("Please use a real email address");
  }

  // Phone (optional)
  const phone =
    typeof body.phone === "string"
      ? body.phone.replace(/\s/g, "").slice(0, 15)
      : null;

  // Gender (optional)
  const gender = body.gender ?? null;
  if (gender !== null && !VALID_GENDER.includes(gender as typeof VALID_GENDER[number])) {
    return validationError("Invalid gender");
  }

  // Lifestyle note (optional)
  const lifestyleNote =
    typeof body.lifestyle_note === "string"
      ? body.lifestyle_note.trim().slice(0, 200)
      : null;

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "Encryption is not configured" },
      { status: 500 },
    );
  }

  // Check if the user already has an active seeker registration
  const { data: existingSeeker } = await serviceSupabase
    .from("seekers")
    .select("id")
    .eq("session_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (existingSeeker) {
    return NextResponse.json(
      { error: "You already have an active search. It expires in 30 days." },
      { status: 409 },
    );
  }

  // Create seeker via RPC (encrypts contact info, creates geometry)
  const { data: seekerId, error: insertError } = await serviceSupabase.rpc(
    "create_seeker",
    {
      p_lat: lat,
      p_lng: lng,
      p_looking_for: lookingFor as string,
      p_budget_min: budgetMin,
      p_budget_max: budgetMax,
      p_bhk_pref: bhkPref,
      p_radius_km: radiusKm,
      p_email: email,
      p_phone: phone || "",
      p_gender: gender as string | null,
      p_lifestyle_note: lifestyleNote,
      p_session_id: user.id,
      p_encryption_key: encryptionKey,
    },
  );

  if (insertError || !seekerId) {
    console.error("Seeker insert error:", insertError);
    return NextResponse.json(
      { error: "Unable to register seeker" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      seeker: {
        id: seekerId,
        looking_for: lookingFor,
        budget_min: budgetMin,
        budget_max: budgetMax,
        radius_km: radiusKm,
      },
      message:
        "You're on the list! Claude checks for matches every night and will email you when something fits.",
    },
    { status: 201 },
  );
}
