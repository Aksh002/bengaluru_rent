import Anthropic from "@anthropic-ai/sdk";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type ModerationResult = {
  pin_id: string;
  approved: boolean;
  reason: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
};

/**
 * Moderate a single comment using Claude Haiku.
 *
 * Classifies the comment as safe (approved) or unsafe (rejected).
 * Updates pins.comment_approved and logs the run to agent_runs.
 */
export async function moderateComment(
  pinId: string,
  comment: string,
): Promise<ModerationResult> {
  const startTime = Date.now();
  const supabase = createServiceSupabaseClient();

  if (!supabase) throw new Error("Supabase is not configured");

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    // No API key — auto-approve to avoid blocking
    console.warn("Moderation skipped: ANTHROPIC_API_KEY not set, auto-approving");
    await supabase
      .from("pins")
      .update({ comment_approved: true })
      .eq("id", pinId);

    return {
      pin_id: pinId,
      approved: true,
      reason: "auto-approved (no API key)",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startTime,
    };
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: `You are a content moderator for a public rent transparency board in India.
Classify the comment as safe or unsafe.
Safe: genuine rent info, neighbourhood feedback, helpful tips, mild frustration.
Unsafe: abuse, hate speech, phone numbers/emails (privacy risk), spam, ads, sexual content.
Respond ONLY with JSON: {"safe": true/false, "reason": "brief reason"}`,
      messages: [
        {
          role: "user",
          content: comment,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(
      text.replace(/```json|```/g, "").trim(),
    ) as { safe: boolean; reason: string };

    const approved = parsed.safe === true;
    const reason = parsed.reason || (approved ? "Content is safe" : "Content flagged");

    // Update pin
    await supabase
      .from("pins")
      .update({ comment_approved: approved })
      .eq("id", pinId);

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = inputTokens * 0.00000025 + outputTokens * 0.00000125;

    // Log agent run
    await supabase.from("agent_runs").insert({
      agent_type: "moderation" as const,
      model: "claude-haiku-4-5",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      duration_ms: Date.now() - startTime,
      action_summary: {
        pin_id: pinId,
        approved,
        reason,
      },
    });

    return {
      pin_id: pinId,
      approved,
      reason,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      duration_ms: Date.now() - startTime,
    };
  } catch (err) {
    console.error(`Moderation failed for pin ${pinId}:`, err);

    // On failure, leave comment_approved as null (pending)
    // Log the error
    await supabase.from("agent_runs").insert({
      agent_type: "moderation" as const,
      model: "claude-haiku-4-5",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startTime,
      error: err instanceof Error ? err.message : "Unknown error",
      action_summary: { pin_id: pinId, error: true },
    });

    return {
      pin_id: pinId,
      approved: false,
      reason: "moderation error — comment remains pending",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startTime,
    };
  }
}
