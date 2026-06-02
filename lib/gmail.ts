import { google } from "googleapis";

type EmailMessage = {
  id: string;
  from: string;
  sender_hash: string;
  subject: string;
  body: string;
  date: string;
};

function getAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

/**
 * Fetch unread match reply emails from the monitored inbox.
 * Returns up to 50 messages.
 */
export async function getUnreadMatchReplies(): Promise<EmailMessage[]> {
  const auth = getAuth();
  if (!auth) {
    console.warn("Gmail: OAuth2 not configured, skipping email loop");
    return [];
  }

  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread label:match-replies",
    maxResults: 50,
  });

  const messageIds = data.messages || [];
  if (messageIds.length === 0) return [];

  const results: EmailMessage[] = [];

  for (const msg of messageIds) {
    if (!msg.id) continue;

    const { data: full } = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = full.payload?.headers || [];
    const from =
      headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
    const subject =
      headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
    const date =
      headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

    // Extract plain text body
    let body = "";
    if (full.payload?.parts) {
      const textPart = full.payload.parts.find(
        (p) => p.mimeType === "text/plain",
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    } else if (full.payload?.body?.data) {
      body = Buffer.from(full.payload.body.data, "base64").toString("utf-8");
    }

    // Extract email address from "Name <email>" format
    const emailMatch = from.match(/<([^>]+)>/);
    const senderEmail = emailMatch ? emailMatch[1] : from.trim();

    // Create a simple hash for matching (not crypto-grade, just for lookup)
    const { createHash } = await import("node:crypto");
    const senderHash = createHash("sha256")
      .update(senderEmail.toLowerCase())
      .digest("hex");

    results.push({
      id: msg.id,
      from: senderEmail,
      sender_hash: senderHash,
      subject,
      body: body.slice(0, 2000), // Limit body length
      date,
    });
  }

  return results;
}

/**
 * Mark an email as read in Gmail.
 */
export async function markEmailRead(messageId: string): Promise<void> {
  const auth = getAuth();
  if (!auth) return;

  const gmail = google.gmail({ version: "v1", auth });

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });
}
