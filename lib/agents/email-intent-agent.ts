import Anthropic from "@anthropic-ai/sdk";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getUnreadMatchReplies, markEmailRead } from "@/lib/gmail";

type EmailIntent = {
  intent:
    | "still_available"
    | "rented"
    | "update_phone"
    | "deactivate_search"
    | "extend_search"
    | "unknown";
  new_phone: string | null;
  notes: string;
};

export type EmailLoopResult = {
  agent_type: string;
  model: string;
  emails_processed: number;
  intents: Record<string, number>;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
};

/**
 * Email intent agent — processes reply emails from match notifications.
 *
 * Reads unread emails from the monitored inbox, uses Claude to extract intent,
 * and performs the corresponding Supabase mutation.
 */
export async function runEmailIntentAgent(): Promise<EmailLoopResult> {
  const startTime = Date.now();
  const supabase = createServiceSupabaseClient();

  if (!supabase) throw new Error("Supabase is not configured");

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is not configured");

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const emails = await getUnreadMatchReplies();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const intentCounts: Record<string, number> = {};

  for (const email of emails) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        system: `You are processing email replies from renters on bengaluru.rent.
Extract intent from the reply and return JSON:
{
  "intent": "still_available" | "rented" | "update_phone" | "deactivate_search" | "extend_search" | "unknown",
  "new_phone": "string or null",
  "notes": "brief explanation"
}
Be generous — simple replies like "still available", "yes", "found one" are enough to determine intent.`,
        messages: [{ role: "user", content: email.body }],
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const text =
        response.content[0].type === "text"
          ? response.content[0].text
          : '{"intent":"unknown"}';
      const intent: EmailIntent = JSON.parse(
        text.replace(/```json|```/g, "").trim(),
      );

      intentCounts[intent.intent] = (intentCounts[intent.intent] || 0) + 1;

      // Act on intent
      switch (intent.intent) {
        case "rented":
          // Deactivate listings matching the sender's email hash
          await supabase
            .from("listings")
            .update({ is_active: false })
            .eq("owner_email_hash", email.sender_hash);
          break;

        case "still_available":
          // No-op, just mark as read
          break;

        case "update_phone":
          if (intent.new_phone) {
            // Encrypt the new phone and update
            const { data: encryptedPhone } = await supabase.rpc(
              "encrypt_field",
              {
                plaintext: intent.new_phone,
                encryption_key: encryptionKey,
              },
            );
            if (encryptedPhone) {
              await supabase
                .from("listings")
                .update({ owner_phone: encryptedPhone as string })
                .eq("owner_email_hash", email.sender_hash);
            }
          }
          break;

        case "deactivate_search":
          await supabase
            .from("seekers")
            .update({ is_active: false })
            .eq("email_hash", email.sender_hash);
          break;

        case "extend_search":
          await supabase
            .from("seekers")
            .update({
              expires_at: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000,
              ).toISOString(),
            })
            .eq("email_hash", email.sender_hash);
          break;

        default:
          // Unknown intent — skip
          break;
      }

      // Mark email as read
      await markEmailRead(email.id);

      // Log this individual run
      await supabase.from("agent_runs").insert({
        agent_type: "email_loop" as const,
        model: "claude-sonnet-4-5",
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cost_usd:
          response.usage.input_tokens * 0.000003 +
          response.usage.output_tokens * 0.000015,
        duration_ms: Date.now() - startTime,
        action_summary: {
          intent: intent.intent,
          email_id: email.id,
          notes: intent.notes,
        },
      });
    } catch (err) {
      console.error(`Email intent error for ${email.id}:`, err);
    }
  }

  return {
    agent_type: "email_loop",
    model: "claude-sonnet-4-5",
    emails_processed: emails.length,
    intents: intentCounts,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd:
      totalInputTokens * 0.000003 + totalOutputTokens * 0.000015,
    duration_ms: Date.now() - startTime,
  };
}
