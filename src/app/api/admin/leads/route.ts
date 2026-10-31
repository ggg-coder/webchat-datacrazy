import { fail, ok } from "@/lib/http";
import { leadsOverview } from "@/lib/leads";
import { filtersFromUrl } from "@/lib/leads/filters";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return ok(await leadsOverview(filtersFromUrl(request.url)));
  } catch (error) {
    console.error("leads_overview_failed", { error: (error as Error).message });
    return fail("Não foi possível carregar os leads.", 500);
  }
}
