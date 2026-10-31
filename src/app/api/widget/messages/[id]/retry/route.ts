import { after } from "next/server";
import { deliverVisitorMessage } from "@/lib/delivery";
import { fail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getMessage, updateMessage } from "@/lib/repo";
import { isSameOrigin, sessionIdFromRequest } from "@/lib/widget/server";

// "Tentar de novo" on a message that failed delivery: queue it again and deliver now.
export async function POST(request: Request, ctx: RouteContext<"/api/widget/messages/[id]/retry">) {
  if (!isSameOrigin(request)) return fail("Origem não permitida.", 403);
  const sessionId = sessionIdFromRequest(request);
  if (sessionId && !(await rateLimit(`retry:${sessionId}`, 60, 5))) return fail("Aguarde um pouco antes de tentar de novo.", 429);
  const { id } = await ctx.params;
  const message = sessionId ? await getMessage(id) : null;
  if (!message || message.session_id !== sessionId || message.author !== "visitor") return fail("Mensagem não encontrada.", 404);
  if (message.delivery_status === "sent") return Response.json({ ok: true });

  await updateMessage(id, { delivery_status: "pending", attempts: 0, next_attempt_at: null });
  after(() => deliverVisitorMessage(id));
  return Response.json({ ok: true });
}
