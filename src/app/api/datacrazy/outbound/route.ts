import { NextResponse } from "next/server";
import { handleOutbound } from "@/lib/datacrazy/outbound";
import { logIntegration } from "@/lib/logs";
import { toPublicMessage } from "@/lib/messages";
import { broadcast } from "@/lib/realtime";
import { getSession, insertAgentMessage, type MessageRow } from "@/lib/repo";
import { getSettings } from "@/lib/settings";

// Called by DataCrazy (Universal Connection, "Envio" tab) whenever an agent replies.
// Text and attachment endpoints both point here; the body tells them apart.
export async function POST(request: Request) {
  const raw = await request.text();
  let row: MessageRow | null = null;

  const result = await handleOutbound(
    {
      outboundToken: async () => (await getSettings()).secrets.outboundToken,
      sessionExists: async (visitorId) => (await getSession(visitorId)) !== null,
      saveAgentMessage: async (input) => {
        const saved = await insertAgentMessage(input);
        row = saved.message;
        return {
          message: {
            id: saved.message.id,
            sessionId: input.sessionId,
            text: saved.message.text,
            attachment: input.attachment,
            createdAt: saved.message.created_at,
          },
          duplicate: saved.duplicate,
        };
      },
      publish: async (message) => {
        if (row) await broadcast(message.sessionId, "message", toPublicMessage(row));
      },
      log: (status, summary, error, sessionId) => logIntegration("outbound", status, summary, error, sessionId),
    },
    request.headers.get("authorization"),
    raw,
  ).catch(async (error: Error) => {
    console.error("outbound_failed", { error: error.message });
    await logIntegration("outbound", "error", {}, error.message);
    return { status: 500, body: { ok: false as const, error: "Erro interno ao salvar a mensagem." } };
  });

  return NextResponse.json(result.body, { status: result.status });
}
