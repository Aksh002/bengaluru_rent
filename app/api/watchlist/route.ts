import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bengaluruBounds = {
  minLat: 12.74,
  maxLat: 13.18,
  minLng: 77.38,
  maxLng: 77.86,
};

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return validationError("Invalid JSON body");
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return validationError("A map location is required");
  }

  if (
    lat < bengaluruBounds.minLat ||
    lat > bengaluruBounds.maxLat ||
    lng < bengaluruBounds.minLng ||
    lng > bengaluruBounds.maxLng
  ) {
    return validationError("Location must be within Bengaluru");
  }

  const radiusKm = Number(body.radius_km ?? 2.5);
  if (!Number.isFinite(radiusKm) || radiusKm < 0.5 || radiusKm > 10) {
    return validationError("Radius must be between 0.5 and 10 km");
  }

  const bhkPref = body.bhk_pref === null ? null : Number(body.bhk_pref);
  if (
    bhkPref !== null &&
    (!Number.isInteger(bhkPref) || bhkPref < 1 || bhkPref > 6)
  ) {
    return validationError("BHK preference must be between 1 and 6");
  }

  const maxRent = body.max_rent === null ? null : Number(body.max_rent);
  if (maxRent !== null && (!Number.isInteger(maxRent) || maxRent <= 0)) {
    return validationError("Max rent must be valid");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return validationError("A valid email is required");
  }

  // Junk email detection
  const junkEmails = [
    "test@test.com",
    "a@a.com",
    "abc@abc.com",
    "admin@admin.com",
  ];
  if (junkEmails.includes(email.toLowerCase())) {
    return validationError("Please use a real email address");
  }

  const phone =
    typeof body.phone === "string"
      ? body.phone.replace(/\s/g, "").slice(0, 15)
      : null;

  if (phone && /^(1234567890|0000000000|9999999999|1111111111)$/.test(phone)) {
    return validationError("Please use a real phone number");
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json(
      { error: "Encryption is not configured" },
      { status: 500 },
    );
  }

  const { data: watchlistId, error } = await supabase.rpc(
    "create_watchlist_entry",
    {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radiusKm,
      p_bhk_pref: bhkPref,
      p_max_rent: maxRent,
      p_email: email,
      p_phone: phone,
      p_encryption_key: encryptionKey,
    },
  );

  if (error || !watchlistId) {
    console.error("Watchlist insert error:", error);
    return NextResponse.json(
      { error: "Unable to create watchlist alert" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: watchlistId }, { status: 201 });
}
