import { z } from "zod";
import { fail, ok, readJson } from "@/lib/http";
import { logIntegration } from "@/lib/logs";
import { toPublicMessage } from "@/lib/messages";
import { broadcast } from "@/lib/realtime";
import { insertAgentMessage } from "@/lib/repo";
import { isTestSession } from "@/lib/test-session";
import { requireAdmin } from "@/lib/admin-guard";

// Simulates an agent reply without DataCrazy, going through the same storage + Realtime path as
// /api/datacrazy/outbound. Only for conversations opened from the "Testar" tab, so a real visitor
// can never receive a message typed here by mistake.
const bodySchema = z.object({ sessionId: z.uuid(), text: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request, bodySchema);
  if ("error" in body) return fail("Escreva a resposta.");
  if (!(await isTestSession(body.data.sessionId))) return fail("Só dá para simular respostas em conversas abertas pela aba Testar.", 403);

  const { message } = await insertAgentMessage({
    sessionId: body.data.sessionId,
    dcMessageId: `simulado_${crypto.randomUUID()}`,
    text: body.data.text,
    attachment: null,
  });
  await broadcast(body.data.sessionId, "message", toPublicMessage(message));
  await logIntegration("outbound", "ok", { simulated: true }, undefined, body.data.sessionId);
  return ok({ id: message.id });
}
