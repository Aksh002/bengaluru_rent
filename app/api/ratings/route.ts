import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return validationError("Invalid JSON body");
  }

  const pinId = body.pin_id;
  if (typeof pinId !== "string" || !pinId) {
    return validationError("Pin ID is required");
  }

  const localityScore = Number(body.locality_score);
  if (
    !Number.isInteger(localityScore) ||
    localityScore < 1 ||
    localityScore > 5
  ) {
    return validationError("Locality score must be between 1 and 5");
  }

  const buildQuality = Number(body.build_quality);
  if (
    !Number.isInteger(buildQuality) ||
    buildQuality < 1 ||
    buildQuality > 5
  ) {
    return validationError("Building quality score must be between 1 and 5");
  }

  const { error: insertError } = await serviceSupabase
    .from("ratings")
    .insert({
      pin_id: pinId,
      rater_session_id: user.id,
      locality_score: localityScore,
      build_quality: buildQuality,
    });

  if (insertError) {
    if (insertError.code === "23505") { // Unique violation
      return NextResponse.json(
        { error: "You have already rated this pin" },
        { status: 409 },
      );
    }
    console.error("Ratings insert error:", insertError);
    return NextResponse.json(
      { error: "Unable to submit rating" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
