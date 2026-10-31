import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export type SchemaStatus = { ready: boolean; error?: string };

// Checks through the REST API (works without a direct database URL).
export async function schemaStatus(): Promise<SchemaStatus> {
  try {
    const { error } = await db().from("settings").select("id").eq("id", 1).maybeSingle();
    if (!error) return { ready: true };
    return { ready: false, error: error.message };
  } catch (error) {
    return { ready: false, error: (error as Error).message };
  }
}

export async function listMigrations(): Promise<{ name: string; sql: string }[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  return Promise.all(files.map(async (name) => ({ name, sql: await readFile(path.join(MIGRATIONS_DIR, name), "utf8") })));
}

// Applies pending migrations through the direct Postgres connection injected by the
// Supabase ↔ Vercel integration. Each file runs in its own transaction.
export async function runMigrations(): Promise<{ applied: string[] }> {
  const url = env.databaseUrl;
  if (!url) throw new Error("Sem POSTGRES_URL_NON_POOLING/DATABASE_URL: rode o SQL manualmente no SQL Editor do Supabase.");

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 15 });
  try {
    await sql`create table if not exists public.webchat_migrations (name text primary key, applied_at timestamptz not null default now())`;
    await sql`alter table public.webchat_migrations enable row level security`;
    const done = new Set((await sql<{ name: string }[]>`select name from public.webchat_migrations`).map((row) => row.name));

    const applied: string[] = [];
    for (const migration of await listMigrations()) {
      if (done.has(migration.name)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(migration.sql);
        await tx`insert into public.webchat_migrations (name) values (${migration.name})`;
      });
      applied.push(migration.name);
    }
    // PostgREST caches the schema; ask it to reload so the new tables are visible right away.
    await sql`notify pgrst, 'reload schema'`;
    return { applied };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
