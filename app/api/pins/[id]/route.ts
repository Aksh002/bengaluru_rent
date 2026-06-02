import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { PublicPin } from "@/lib/types/pins";
import { roundCoord } from "@/lib/utils/geo";

export const runtime = "nodejs";

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseFurnishing(value: unknown) {
  if (value === "furnished" || value === "semi" || value === "unfurnished") {
    return value;
  }
  return null;
}

/**
 * Verify that the requesting user owns the pin.
 * Returns the user ID on success, or a NextResponse error.
 */
async function verifyPinOwnership(
  req: NextRequest,
  pinId: string,
) {
  const serviceSupabase = createServiceSupabaseClient();
  if (!serviceSupabase) {
    return { error: NextResponse.json({ error: "Supabase is not configured" }, { status: 500 }) };
  }

  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return { error: NextResponse.json({ error: "Anonymous session is required" }, { status: 401 }) };
  }

  const userSupabase = createUserSupabaseClient(accessToken);
  if (!userSupabase) {
    return { error: NextResponse.json({ error: "Supabase auth is not configured" }, { status: 500 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await userSupabase.auth.getUser(accessToken);

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Invalid anonymous session" }, { status: 401 }) };
  }

  // Check pin exists and belongs to the session
  const { data: pin, error: pinError } = await serviceSupabase
    .from("pins")
    .select("id, session_id")
    .eq("id", pinId)
    .maybeSingle();

  if (pinError || !pin) {
    return { error: NextResponse.json({ error: "Pin not found" }, { status: 404 }) };
  }

  if (pin.session_id !== user.id) {
    return { error: NextResponse.json({ error: "You can only modify your own pins" }, { status: 403 }) };
  }

  return { userId: user.id, serviceSupabase };
}

/**
 * PATCH /api/pins/[id] — Edit a pin (session-verified).
 * Editable fields: rent, bhk, furnished, gated, occupant_type, society_name, deposit_months, comment.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await verifyPinOwnership(req, id);

  if ("error" in result) {
    return result.error;
  }

  const { serviceSupabase } = result;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return validationError("Invalid JSON body");
  }

  const payload = body as Record<string, unknown>;
  const updates: Database["public"]["Tables"]["pins"]["Update"] = {};

  // Validate and collect editable fields
  if ("rent" in payload) {
    const rent = Number(payload.rent);
    if (!Number.isInteger(rent) || rent < 1000 || rent >= 1_000_000) {
      return validationError("Rent must be between ₹1,000 and ₹9,99,999");
    }
    updates.rent = rent;
  }

  if ("bhk" in payload) {
    const bhk = Number(payload.bhk);
    if (!Number.isInteger(bhk) || bhk < 1 || bhk > 6) {
      return validationError("BHK must be between 1 and 6");
    }
    updates.bhk = bhk;
  }

  if ("furnished" in payload) {
    updates.furnished = payload.furnished === true;
  }

  if ("furnishing" in payload) {
    const furnishing = parseFurnishing(payload.furnishing);
    if (!furnishing) {
      return validationError("Invalid furnishing value");
    }
    updates.furnishing = furnishing;
    updates.furnished = furnishing !== "unfurnished";
  }

  if ("gated" in payload) {
    updates.gated = payload.gated === true;
  }

  if ("occupant_type" in payload) {
    const ot = payload.occupant_type;
    if (ot !== "family" && ot !== "bachelor" && ot !== "any") {
      return validationError("Invalid tenant preference");
    }
    updates.occupant_type = ot;
  }

  if ("society_name" in payload) {
    updates.society_name = normalizeString(payload.society_name, 120);
  }

  if ("deposit_months" in payload) {
    const dm =
      payload.deposit_months === null || payload.deposit_months === ""
        ? null
        : Number(payload.deposit_months);
    if (
      dm !== null &&
      (!Number.isInteger(dm) || dm < 0 || dm > 24)
    ) {
      return validationError("Deposit must be between 0 and 24 months");
    }
    updates.deposit_months = dm;
  }

  if ("comment" in payload) {
    updates.comment = normalizeString(payload.comment, 200);
    // Reset moderation when comment changes
    updates.comment_approved =
      updates.comment === null ? true : null;
  }

  if (Object.keys(updates).length === 0) {
    return validationError("No valid fields to update");
  }

  updates.updated_at = new Date().toISOString();

  const { data: updatedPin, error: updateError } = await serviceSupabase
    .from("pins")
    .update(updates)
    .eq("id", id)
    .select(
      `id, lat, lng, bhk, rent, furnished, gated, society_name,
       furnishing,
       occupant_type, deposit_months, neighbourhood, created_at,
       report_count, comment, comment_approved`,
    )
    .single();

  if (updateError || !updatedPin) {
    return NextResponse.json(
      { error: "Unable to update pin" },
      { status: 500 },
    );
  }

  const pin: PublicPin = {
    id: updatedPin.id,
    lat: roundCoord(updatedPin.lat),
    lng: roundCoord(updatedPin.lng),
    bhk: updatedPin.bhk,
    rent: updatedPin.rent,
    furnished: updatedPin.furnished,
    furnishing: updatedPin.furnishing ?? (updatedPin.furnished ? "furnished" : "unfurnished"),
    gated: updatedPin.gated,
    society_name: updatedPin.society_name,
    occupant_type: updatedPin.occupant_type,
    deposit_months: updatedPin.deposit_months ?? null,
    neighbourhood: updatedPin.neighbourhood,
    created_at: updatedPin.created_at,
    report_count: updatedPin.report_count,
    has_listing: false,
    comment: updatedPin.comment,
    comment_approved: updatedPin.comment_approved,
    is_owner: true,
  };

  return NextResponse.json({ pin });
}

/**
 * DELETE /api/pins/[id] — Soft-delete a pin (set is_hidden = true).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await verifyPinOwnership(req, id);

  if ("error" in result) {
    return result.error;
  }

  const { serviceSupabase } = result;

  const { error: deleteError } = await serviceSupabase
    .from("pins")
    .update({ is_hidden: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Unable to delete pin" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
