import { ok } from "@/lib/http";
import { runPendingJobs } from "@/lib/jobs";
import { requireAdmin } from "@/lib/admin-guard";

// "Reprocessar pendentes" in the panel: same job as the cron, on demand (the Hobby plan runs crons once a day).
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return ok({ report: await runPendingJobs() });
}
