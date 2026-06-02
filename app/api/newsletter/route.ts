import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  const { error } = await supabase
    .from("newsletter")
    .upsert({ email }, { onConflict: "email" });

  if (error) {
    console.error("Newsletter upsert error:", error);
    return NextResponse.json(
      { error: "Unable to sign up for newsletter" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
