import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

// Service-role client. Every table has RLS on and no policies: only the server reads and writes.
export function db(): SupabaseClient {
  client ??= createClient(requireEnv("supabaseUrl", "SUPABASE_URL"), requireEnv("supabaseServiceKey", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const STORAGE_BUCKET = "webchat";
