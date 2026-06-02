import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  createUserSupabaseClient,
} from "@/lib/supabase/server";
import type { PinComment } from "@/lib/types/pins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeComment(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  return cleaned.slice(0, 240);
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function toPublicComment(row: PinComment): PinComment {
  return {
    id: row.id,
    pin_id: row.pin_id,
    body: row.body,
    comment_approved: row.comment_approved,
    created_at: row.created_at,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ comments: [] satisfies PinComment[] });
  }

  const { data, error } = await supabase
    .from("pin_comments")
    .select("id, pin_id, body, comment_approved, created_at")
    .eq("pin_id", id)
    .eq("comment_approved", true)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json(
      { error: "Unable to fetch comments", comments: [] },
      { status: 500 },
    );
  }

  return NextResponse.json({
    comments: ((data ?? []) as PinComment[]).map(toPublicComment),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return validationError("Invalid JSON body");
  }

  const comment = sanitizeComment(body.comment);
  if (!comment || comment.length < 3) {
    return validationError("Comment must be at least 3 characters");
  }

  const { data: pin } = await serviceSupabase
    .from("pins")
    .select("id")
    .eq("id", id)
    .eq("is_hidden", false)
    .maybeSingle();

  if (!pin) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  const { data, error } = await serviceSupabase
    .from("pin_comments")
    .insert({
      pin_id: id,
      session_id: user.id,
      body: comment,
      comment_approved: true,
    })
    .select("id, pin_id, body, comment_approved, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Unable to add comment" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { comment: toPublicComment(data as PinComment) },
    { status: 201 },
  );
}
