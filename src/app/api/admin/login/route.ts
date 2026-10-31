import { cookies } from "next/headers";
import { z } from "zod";
import { SIGNUP_OPEN_MESSAGE, createAuthClient, isSignupDisabled } from "@/lib/admin-auth";
import { envStatus } from "@/lib/env";
import { fail, ok, readJson } from "@/lib/http";
import { clientIp, rateLimit, refundRateLimit, resetRateLimit } from "@/lib/rate-limit";

const WINDOW = 15 * 60;

const bodySchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

async function authClient() {
  const store = await cookies();
  return createAuthClient({
    getAll: () => store.getAll(),
    setAll: (list) => {
      for (const { name, value, options } of list) store.set(name, value, options);
    },
  });
}

export async function POST(request: Request) {
  const status = envStatus();
  if (!status.supabaseUrl || !status.supabaseAnonKey) return fail("Supabase não está configurado na Vercel.", 500);

  const body = await readJson(request, bodySchema);
  if ("error" in body) return fail("Informe e-mail e senha.");

  // Each attempt is reserved atomically before talking to Supabase (parallel requests can't slip
  // through) and given back when it succeeds, so only failures add up, every 15 minutes:
  // - 10 per IP and 5 per IP+email: stops guessing from one place;
  // - 20 per email from anywhere: caps distributed guessing at ~80 passwords/hour per account while
  //   making it costly to lock the admin out on purpose. Supabase Auth adds its own limits on top.
  const ip = clientIp(request);
  const email = body.data.email.toLowerCase();
  const keys = [
    { key: `admin-login:ip:${ip}`, max: 10 },
    { key: `admin-login:pair:${ip}:${email}`, max: 5 },
    { key: `admin-login:email:${email}`, max: 20 },
  ];
  const reserved = await Promise.all(keys.map(({ key, max }) => rateLimit(key, WINDOW, max)));
  if (reserved.includes(false)) return fail("Muitas tentativas. Aguarde 15 minutos e tente de novo.", 429);
  if (!(await isSignupDisabled())) return fail(SIGNUP_OPEN_MESSAGE, 403, { code: "signup_open" });

  const { error } = await (await authClient()).auth.signInWithPassword(body.data);
  if (error) {
    // Same message for every failure: doesn't reveal which emails exist.
    console.warn("admin_login_failed", { code: error.code });
    return fail("E-mail ou senha incorretos.", 401);
  }
  await Promise.all([refundRateLimit(keys[0]!.key), resetRateLimit(keys[1]!.key), refundRateLimit(keys[2]!.key)]);
  return ok({});
}

export async function DELETE() {
  await (await authClient()).auth.signOut();
  return ok({});
}
