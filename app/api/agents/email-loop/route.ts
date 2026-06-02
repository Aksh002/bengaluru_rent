import { NextRequest, NextResponse } from "next/server";
import { runEmailIntentAgent } from "@/lib/agents/email-intent-agent";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes max

/**
 * POST /api/agents/email-loop — Called by Vercel Cron every 10 minutes.
 * Processes unread match reply emails and extracts intent.
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEmailIntentAgent();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email intent agent error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
