import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { runPendingJobs } from "@/lib/jobs";

// Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET" when the variable
// exists; without it the route stays closed, since anyone could call it otherwise.
export async function GET(request: Request) {
  const secret = env.cronSecret;
  if (!secret) return fail("CRON_SECRET não configurada: rotina desativada.", 503);
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(token, secret)) return fail("unauthorized", 401);
  return ok({ report: await runPendingJobs() });
}
