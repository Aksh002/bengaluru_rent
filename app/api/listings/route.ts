import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_LISTING_TYPES = ["whole_flat", "room"] as const;
const VALID_AVAILABLE_FROM = ["asap", "next_month", "flex"] as const;
const VALID_GENDER_PREF = ["male", "female", "any"] as const;
const VALID_FOOD_PREF = ["veg", "nonveg", "any"] as const;

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * GET /api/listings — Return active listings (without contact info).
 * Used to show "Flat available" badges on pins.
 */
export async function GET() {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ listings: [] });
  }

  const { data, error } = await supabase
    .from("listings")
    .select(
      `id, pin_id, listing_type, rent_per_room, available_from,
       gender_pref, smoking_ok, food_pref, parking_spots,
       is_active, created_at`,
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json(
      { error: "Unable to fetch listings", listings: [] },
      { status: 500 },
    );
  }

  return NextResponse.json({ listings: data ?? [] });
}

/**
 * POST /api/listings — Create a new listing for a pin.
 * Validates session ownership of the pin, encrypts contact info.
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

  // Validate pin_id
  const pinId = body.pin_id;
  if (typeof pinId !== "string" || !pinId) {
    return validationError("Pin ID is required");
  }

  // Verify pin ownership
  const { data: pin } = await serviceSupabase
    .from("pins")
    .select("id, session_id, bhk, rent")
    .eq("id", pinId)
    .maybeSingle();

  if (!pin) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }
  if (pin.session_id !== user.id) {
    return NextResponse.json(
      { error: "You can only create listings for your own pins" },
      { status: 403 },
    );
  }

  // Check if listing already exists for this pin
  const { data: existingListing } = await serviceSupabase
    .from("listings")
    .select("id")
    .eq("pin_id", pinId)
    .eq("is_active", true)
    .maybeSingle();

  if (existingListing) {
    return NextResponse.json(
      { error: "This pin already has an active listing" },
      { status: 409 },
    );
  }

  // Validate fields
  const listingType = body.listing_type;
  if (!VALID_LISTING_TYPES.includes(listingType as typeof VALID_LISTING_TYPES[number])) {
    return validationError("Listing type must be whole_flat or room");
  }

  const rentPerRoom =
    listingType === "room" ? Number(body.rent_per_room) : null;
  if (listingType === "room") {
    if (
      !Number.isInteger(rentPerRoom) ||
      !rentPerRoom ||
      rentPerRoom <= 0 ||
      rentPerRoom >= 1_000_000
    ) {
      return validationError("Rent per room is required for room listings");
    }
  }

  const availableFrom = body.available_from ?? "asap";
  if (!VALID_AVAILABLE_FROM.includes(availableFrom as typeof VALID_AVAILABLE_FROM[number])) {
    return validationError("Invalid availability");
  }

  const genderPref = body.gender_pref ?? "any";
  if (!VALID_GENDER_PREF.includes(genderPref as typeof VALID_GENDER_PREF[number])) {
    return validationError("Invalid gender preference");
  }

  const smokingOk =
    body.smoking_ok === true ? true : body.smoking_ok === false ? false : null;

  const foodPref = body.food_pref ?? "any";
  if (!VALID_FOOD_PREF.includes(foodPref as typeof VALID_FOOD_PREF[number])) {
    return validationError("Invalid food preference");
  }

  const parkingSpots = Number(body.parking_spots ?? 0);
  if (!Number.isInteger(parkingSpots) || parkingSpots < 0 || parkingSpots > 10) {
    return validationError("Invalid parking spots");
  }

  // Email is required
  const ownerEmail =
    typeof body.owner_email === "string" ? body.owner_email.trim() : "";
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return validationError("A valid email is required");
  }

  // Junk email detection
  const junkEmails = [
    "test@test.com",
    "a@a.com",
    "abc@abc.com",
    "admin@admin.com",
  ];
  if (junkEmails.includes(ownerEmail.toLowerCase())) {
    return validationError("Please use a real email address");
  }

  const ownerPhone =
    typeof body.owner_phone === "string"
      ? body.owner_phone.replace(/\s/g, "").slice(0, 15)
      : null;

  // Junk phone detection
  if (
    ownerPhone &&
    /^(1234567890|0000000000|9999999999|1111111111)$/.test(ownerPhone)
  ) {
    return validationError("Please use a real phone number");
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "Encryption is not configured" },
      { status: 500 },
    );
  }

  // Create listing via RPC (encrypts contact info)
  const { data: listingId, error: insertError } = await serviceSupabase.rpc(
    "create_listing",
    {
      p_pin_id: pinId,
      p_listing_type: listingType as string,
      p_rent_per_room: rentPerRoom,
      p_available_from: availableFrom as string,
      p_owner_email: ownerEmail,
      p_owner_phone: ownerPhone,
      p_gender_pref: genderPref as string,
      p_smoking_ok: smokingOk,
      p_food_pref: foodPref as string,
      p_parking_spots: parkingSpots,
      p_session_id: user.id,
      p_encryption_key: encryptionKey,
    },
  );

  if (insertError || !listingId) {
    console.error("Listing insert error:", insertError);
    return NextResponse.json(
      { error: "Unable to create listing" },
      { status: 500 },
    );
  }

  // Trigger watchlist alerts (non-blocking)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    serviceSupabase
      .rpc("get_watchlist_matches", {
        p_pin_id: pinId,
        p_bhk: pin.bhk,
        p_rent: pin.rent,
      })
      .then(async ({ data: matches }) => {
        if (!matches || matches.length === 0) return;

        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);

        for (const match of matches) {
          try {
            // Decrypt email
            const { data: decryptedEmail } = await serviceSupabase.rpc(
              "decrypt_field",
              {
                encrypted_value: match.email,
                encryption_key: encryptionKey,
              },
            );

            if (decryptedEmail) {
              await resend.emails.send({
                from: "alerts@bengaluru.rent",
                to: decryptedEmail as string,
                subject: "New Listing Alert - bengaluru.rent",
                text: `A new ${listingType} listing (${pin.bhk} BHK, Rs. ${pin.rent}) was just added near your watched area! Check it out at https://bengaluru.rent`,
              });
            }
          } catch (err) {
            console.error("Watchlist alert failed for:", match.id, err);
          }
        }
      });
  }

  return NextResponse.json(
    {
      listing: {
        id: listingId,
        pin_id: pinId,
        listing_type: listingType,
        available_from: availableFrom,
      },
    },
    { status: 201 },
  );
}
