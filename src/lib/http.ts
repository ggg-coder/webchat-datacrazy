import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

export function ok<T extends Record<string, unknown>>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, init);
}

export function fail(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

// Parses a JSON body with a Zod schema; returns the first issue as a readable message.
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<{ data: z.infer<S> } | { error: string }> {
  const raw = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${issue.path.join(".") || "corpo"}: ${issue.message}` : "Dados inválidos." };
  }
  return { data: parsed.data };
}
