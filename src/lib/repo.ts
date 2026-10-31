import "server-only";
import type { SessionData } from "@/lib/datacrazy/webhook";
import { db } from "@/lib/supabase";

export type SessionRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  consent_at: string | null;
  consent_version: string | null;
  page_url: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  user_agent: string | null;
  lead_webhook_status: "pending" | "ok" | "failed" | "skipped";
  lead_webhook_attempts: number;
  note_status: "pending" | "ok" | "failed" | "skipped";
  note_attempts: number;
  dc_conversation_id: string | null;
  created_at: string;
  first_message_at: string | null;
  last_message_at: string | null;
  first_agent_reply_at: string | null;
};

// Visitor attachments point to our storage (attachmentId); agent attachments keep DataCrazy's URL.
export type StoredAttachment = { attachmentId?: string; url?: string; mimeType: string; filename: string; size?: number };

export type MessageRow = {
  id: string;
  session_id: string;
  author: "visitor" | "agent" | "system";
  text: string;
  attachment: StoredAttachment | null;
  dc_message_id: string | null;
  delivery_status: "pending" | "sent" | "failed" | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

export function toSessionData(row: SessionRow): SessionData {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    pageUrl: row.page_url,
    referrer: row.referrer,
    utm: row.utm ?? {},
    consentAt: row.consent_at,
    consentVersion: row.consent_version,
    createdAt: row.created_at,
  };
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const { data, error } = await db().from("sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as SessionRow | null;
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  const { data, error } = await db().from("messages").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as MessageRow | null;
}

export async function updateSession(id: string, patch: Partial<Record<string, unknown>>): Promise<void> {
  const { error } = await db().from("sessions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateMessage(id: string, patch: Partial<Record<string, unknown>>): Promise<void> {
  const { error } = await db().from("messages").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// Idempotent on dc_message_id: DataCrazy may resend the same agent message.
export async function insertAgentMessage(input: {
  sessionId: string;
  dcMessageId: string;
  text: string;
  attachment: StoredAttachment | null;
}): Promise<{ message: MessageRow; duplicate: boolean }> {
  const existing = await db().from("messages").select("*").eq("dc_message_id", input.dcMessageId).maybeSingle();
  if (existing.data) return { message: existing.data as MessageRow, duplicate: true };

  const { data, error } = await db()
    .from("messages")
    .insert({
      id: crypto.randomUUID(),
      session_id: input.sessionId,
      author: "agent",
      text: input.text,
      attachment: input.attachment,
      dc_message_id: input.dcMessageId,
    })
    .select("*")
    .single();

  if (error) {
    // Two concurrent deliveries of the same message: the unique index makes the second one lose.
    if (error.code === "23505") {
      const again = await db().from("messages").select("*").eq("dc_message_id", input.dcMessageId).single();
      if (again.data) return { message: again.data as MessageRow, duplicate: true };
    }
    throw new Error(error.message);
  }

  const now = new Date().toISOString();
  await db().from("sessions").update({ last_message_at: now }).eq("id", input.sessionId);
  await db().from("sessions").update({ first_agent_reply_at: now }).eq("id", input.sessionId).is("first_agent_reply_at", null);
  return { message: data as MessageRow, duplicate: false };
}
