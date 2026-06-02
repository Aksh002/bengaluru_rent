import { NextRequest, NextResponse } from "next/server";
import { runMatchingAgent } from "@/lib/agents/matching-agent";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max for matching

/**
 * POST /api/agents/match — Called by Vercel Cron nightly.
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMatchingAgent();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Matching agent error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
