import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

/**
 * POST /api/pins/[id]/report — Report a pin as inaccurate or spam.
 * Uses the report_pin RPC which atomically inserts into reports
 * and increments pins.report_count. The existing trigger auto-hides at >= 3.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: pinId } = await params;
  const serviceSupabase = createServiceSupabaseClient();

  if (!serviceSupabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 500 },
    );
  }

  // Parse optional reason
  let reason: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 200);
    }
  } catch {
    // No body is acceptable — reason is optional
  }

  const ipHash = hashIp(getClientIp(req));

  // Use the report_pin RPC for an atomic insert + increment
  const { error } = await serviceSupabase.rpc("report_pin", {
    p_pin_id: pinId,
    p_reporter_ip_hash: ipHash,
    p_reason: reason,
  });

  if (error) {
    // Unique violation means this IP already reported this pin
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You have already reported this pin" },
        { status: 409 },
      );
    }

    // Foreign key violation means pin doesn't exist
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Pin not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Unable to report pin" },
      { status: 500 },
    );
  }

  return NextResponse.json({ reported: true }, { status: 201 });
}
