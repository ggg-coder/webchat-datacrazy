import type { LeadFilters } from "./index";
import type { Period } from "./period";

const PERIODS: Period[] = ["today", "7d", "30d", "90d", "custom"];

export function filtersFromUrl(url: string): LeadFilters {
  const params = new URL(url).searchParams;
  const period = params.get("period") as Period | null;
  return {
    period: period && PERIODS.includes(period) ? period : "30d",
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    q: params.get("q") ?? undefined,
    includeTests: params.get("tests") === "1",
    page: Math.max(1, Math.min(1000, Number(params.get("page")) || 1)),
  };
}
