import Anthropic from "@anthropic-ai/sdk";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type AgentRunResult = {
  agent_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  action_summary: {
    seekers_processed: number;
    matches_made: number;
    emails_sent: number;
  };
  error?: string;
};

type ScoredMatch = {
  listing_id: string;
  score: number;
  reason: string;
};

type CandidateRow = {
  id: string;
  pin_id: string;
  listing_type: string;
  rent_per_room: number | null;
  available_from: string;
  gender_pref: string;
  smoking_ok: boolean | null;
  food_pref: string;
  parking_spots: number;
  neighbourhood: string | null;
  bhk: number;
  rent: number;
  furnished: boolean;
  lat: number;
  lng: number;
};

type SeekerRow = {
  id: string;
  lat: number;
  lng: number;
  looking_for: string;
  budget_min: number;
  budget_max: number;
  bhk_pref: number | null;
  radius_km: number;
  email: string;
  phone: string | null;
  gender: string | null;
  lifestyle_note: string | null;
};

/**
 * Nightly matching agent.
 *
 * 1. Fetch active seekers with coordinates (via RPC)
 * 2. For each seeker, spatial pre-filter via PostGIS find_candidates
 * 3. Send seeker + candidates to Claude Sonnet for compatibility scoring
 * 4. Log matches, send emails via Resend (when configured)
 * 5. Log the agent run to agent_runs table
 */
export async function runMatchingAgent(): Promise<AgentRunResult> {
  const startTime = Date.now();
  const supabase = createServiceSupabaseClient();

  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is not configured");

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalMatches = 0;
  let emailsSent = 0;

  // 1. Fetch active seekers with extracted lat/lng
  const { data: rawSeekers, error: seekerError } = await supabase.rpc(
    "get_active_seekers_with_coords",
  );

  if (seekerError) {
    throw new Error(`Failed to fetch seekers: ${seekerError.message}`);
  }

  const seekers = (rawSeekers ?? []) as SeekerRow[];

  if (seekers.length === 0) {
    const result = buildResult(0, 0, 0, 0, 0, startTime);
    await logRun(supabase, result);
    return result;
  }

  // 2. Process each seeker
  for (const seeker of seekers) {
    // Decrypt seeker contact info
    const { data: seekerEmail } = await supabase.rpc("decrypt_field", {
      encrypted_value: seeker.email,
      encryption_key: encryptionKey,
    });
    const { data: seekerPhone } = await supabase.rpc("decrypt_field", {
      encrypted_value: seeker.phone ?? "",
      encryption_key: encryptionKey,
    });

    if (!seekerEmail) continue;

    // Spatial pre-filter via PostGIS
    const { data: rawCandidates } = await supabase.rpc("find_candidates", {
      seeker_lat: seeker.lat,
      seeker_lng: seeker.lng,
      radius_km: seeker.radius_km,
      budget_max: seeker.budget_max,
    });

    const candidates = (rawCandidates ?? []) as CandidateRow[];
    if (candidates.length === 0) continue;

    // Exclude already-matched listings
    const { data: existingMatches } = await supabase
      .from("matches")
      .select("listing_id")
      .eq("seeker_id", seeker.id);

    const matchedIds = new Set(
      (existingMatches ?? []).map(
        (m: { listing_id: string }) => m.listing_id,
      ),
    );
    const newCandidates = candidates.filter((c) => !matchedIds.has(c.id));
    if (newCandidates.length === 0) continue;

    // 3. Score via Claude
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: `You are a rent matching engine for bengaluru.rent.
Given a seeker's preferences and a list of candidate listings, return a JSON array of matches sorted by compatibility score (0.0–1.0).
Only include listings with score >= 0.6.
Return ONLY valid JSON, no prose.
Format: [{"listing_id": "...", "score": 0.85, "reason": "brief reason"}]`,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              seeker: {
                looking_for: seeker.looking_for,
                budget_min: seeker.budget_min,
                budget_max: seeker.budget_max,
                bhk_pref: seeker.bhk_pref,
                gender: seeker.gender,
                lifestyle_note: seeker.lifestyle_note,
              },
              candidates: newCandidates.map((c) => ({
                id: c.id,
                listing_type: c.listing_type,
                rent: c.rent,
                bhk: c.bhk,
                furnished: c.furnished,
                neighbourhood: c.neighbourhood ?? "Unknown",
                gender_pref: c.gender_pref,
                smoking_ok: c.smoking_ok,
                food_pref: c.food_pref,
                parking_spots: c.parking_spots,
                available_from: c.available_from,
              })),
            }),
          },
        ],
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const text =
        response.content[0].type === "text" ? response.content[0].text : "[]";
      const scored: ScoredMatch[] = JSON.parse(
        text.replace(/```json|```/g, "").trim(),
      );

      // 4. Process matches
      for (const match of scored) {
        const candidate = newCandidates.find((c) => c.id === match.listing_id);
        if (!candidate) continue;

        // Insert match record
        const { error: matchInsertError } = await supabase
          .from("matches")
          .insert({
            seeker_id: seeker.id,
            listing_id: match.listing_id,
            match_score: match.score,
            email_sent_at: new Date().toISOString(),
          });

        if (matchInsertError) {
          if (matchInsertError.code === "23505") continue; // duplicate
          console.error("Match insert error:", matchInsertError);
          continue;
        }

        totalMatches++;

        // Decrypt owner contact info
        const { data: listing } = await supabase
          .from("listings")
          .select("owner_email, owner_phone")
          .eq("id", match.listing_id)
          .single();

        if (!listing) continue;

        const { data: ownerEmail } = await supabase.rpc("decrypt_field", {
          encrypted_value: listing.owner_email,
          encryption_key: encryptionKey,
        });
        const { data: ownerPhone } = await supabase.rpc("decrypt_field", {
          encrypted_value: listing.owner_phone ?? "",
          encryption_key: encryptionKey,
        });

        // Send emails via Resend
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey && seekerEmail && ownerEmail) {
          try {
            const { Resend } = await import("resend");
            const resend = new Resend(resendKey);

            await resend.emails.send({
              from: "matches@bengaluru.rent",
              to: seekerEmail as string,
              subject: `🏠 Match found: ${candidate.bhk}BHK in ${candidate.neighbourhood || "Bengaluru"}`,
              html: buildSeekerEmail(
                candidate,
                match,
                ownerEmail as string,
                ownerPhone as string | null,
              ),
            });

            await resend.emails.send({
              from: "matches@bengaluru.rent",
              to: ownerEmail as string,
              subject: "🔍 Someone's looking for your flat",
              html: buildOwnerEmail(
                seeker,
                candidate,
                match,
                seekerEmail as string,
                seekerPhone as string | null,
              ),
            });

            emailsSent += 2;
          } catch (emailErr) {
            console.error("Email send error:", emailErr);
          }
        }
      }
    } catch (err) {
      console.error(`Matching error for seeker ${seeker.id}:`, err);
    }
  }

  // 5. Log the agent run
  const result = buildResult(
    totalInputTokens,
    totalOutputTokens,
    seekers.length,
    totalMatches,
    emailsSent,
    startTime,
  );
  await logRun(supabase, result);
  return result;
}

function buildResult(
  inputTokens: number,
  outputTokens: number,
  seekersProcessed: number,
  matchesMade: number,
  emailsSent: number,
  startTime: number,
): AgentRunResult {
  return {
    agent_type: "matching",
    model: "claude-sonnet-4-5",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: inputTokens * 0.000003 + outputTokens * 0.000015,
    duration_ms: Date.now() - startTime,
    action_summary: {
      seekers_processed: seekersProcessed,
      matches_made: matchesMade,
      emails_sent: emailsSent,
    },
  };
}

async function logRun(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  result: AgentRunResult,
) {
  if (!supabase) return;
  await supabase.from("agent_runs").insert({
    agent_type: "matching" as const,
    model: result.model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
    action_summary: result.action_summary,
  });
}

function buildSeekerEmail(
  candidate: CandidateRow,
  match: ScoredMatch,
  ownerEmail: string,
  ownerPhone: string | null,
): string {
  const rent = candidate.rent.toLocaleString("en-IN");
  return `
    <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 8px 0;">🏠 Match found on bengaluru.rent</h2>
      <p style="color: #61584e; margin: 0 0 20px 0;">A listing matches your search preferences.</p>
      <div style="background: #f7f2e8; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="font-size: 28px; font-weight: bold; margin: 0;">₹${rent}/mo</p>
        <p style="color: #61584e; margin: 4px 0 0 0;">
          ${candidate.bhk}BHK · ${candidate.furnished ? "Furnished" : "Unfurnished"} · ${candidate.neighbourhood || "Bengaluru"}
        </p>
        <p style="color: #61584e; margin: 4px 0 0 0;">
          Available: ${candidate.available_from === "asap" ? "ASAP" : candidate.available_from === "next_month" ? "Next month" : "Flexible"}
        </p>
      </div>
      <div style="background: #fff; border: 1px solid #e5e0d8; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="font-weight: bold; margin: 0 0 8px 0;">Owner contact</p>
        <p style="margin: 0;">📧 ${ownerEmail}</p>
        ${ownerPhone ? `<p style="margin: 4px 0 0 0;">📱 ${ownerPhone}</p>` : ""}
      </div>
      <p style="color: #61584e; font-size: 13px; margin-top: 20px;">
        Match confidence: ${Math.round(match.score * 100)}% — ${match.reason}
      </p>
      <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 16px 0;" />
      <p style="color: #8c8378; font-size: 12px;">
        Reply to this email to update your search. Say "found one" to deactivate.
      </p>
    </div>
  `;
}

function buildOwnerEmail(
  seeker: SeekerRow,
  candidate: CandidateRow,
  match: ScoredMatch,
  seekerEmail: string,
  seekerPhone: string | null,
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 8px 0;">🔍 Someone's looking for your flat</h2>
      <p style="color: #61584e; margin: 0 0 20px 0;">A seeker on bengaluru.rent matches your listing.</p>
      <div style="background: #f7f2e8; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="font-weight: bold; margin: 0 0 8px 0;">Their preferences</p>
        <p style="margin: 0;">Looking for: ${seeker.looking_for === "any" ? "Either flat or room" : seeker.looking_for === "whole_flat" ? "Whole flat" : "Room"}</p>
        <p style="margin: 4px 0 0 0;">Budget: ₹${seeker.budget_min.toLocaleString("en-IN")}–₹${seeker.budget_max.toLocaleString("en-IN")}/mo</p>
        ${seeker.bhk_pref ? `<p style="margin: 4px 0 0 0;">BHK: ${seeker.bhk_pref}</p>` : ""}
        ${seeker.lifestyle_note ? `<p style="margin: 4px 0 0 0; font-style: italic;">"${seeker.lifestyle_note}"</p>` : ""}
      </div>
      <div style="background: #fff; border: 1px solid #e5e0d8; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="font-weight: bold; margin: 0 0 8px 0;">Seeker contact</p>
        <p style="margin: 0;">📧 ${seekerEmail}</p>
        ${seekerPhone ? `<p style="margin: 4px 0 0 0;">📱 ${seekerPhone}</p>` : ""}
      </div>
      <hr style="border: none; border-top: 1px solid #e5e0d8; margin: 16px 0;" />
      <p style="color: #8c8378; font-size: 12px;">
        Reply "rented" to deactivate your listing.
      </p>
    </div>
  `;
}
