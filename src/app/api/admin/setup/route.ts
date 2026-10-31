import { schemaStatus, runMigrations } from "@/lib/db/migrate";
import { envStatus } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/admin-guard";

// Installation health: which environment variables exist and whether the tables were created.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const env = envStatus();
  const schema = env.supabaseUrl && env.supabaseServiceKey ? await schemaStatus() : { ready: false, error: "Supabase não configurado." };
  return ok({ env, schema, canMigrate: env.databaseUrl });
}

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const result = await runMigrations();
    return ok({ ...result, schema: await schemaStatus() });
  } catch (error) {
    console.error("migration_failed", { error: (error as Error).message });
    return fail(`Não foi possível criar as tabelas: ${(error as Error).message}`, 500);
  }
}
