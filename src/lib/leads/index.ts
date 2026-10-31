import "server-only";
import { getSettings } from "@/lib/settings";
import { STORAGE_BUCKET, db } from "@/lib/supabase";
import { localDate, localHour, periodRange, type Period } from "./period";

export type LeadFilters = { period: Period; from?: string; to?: string; q?: string; includeTests: boolean; page: number };

export const PAGE_SIZE = 25;
const STATS_LIMIT = 5000;

const LIST_COLUMNS =
  "id, name, email, phone, page_url, referrer, utm, user_agent, created_at, first_message_at, last_message_at, first_agent_reply_at, lead_webhook_status, lead_webhook_error, note_status, note_error, dc_conversation_id, consent_version, consent_at";

// Builds the base sessions query for the filters. PostgREST "or" filter: escape characters it treats specially.
function sessionsQuery(filters: LeadFilters, range: { from: Date; to: Date }, columns: string, count?: "exact") {
  let query = db()
    .from("sessions")
    .select(columns, count ? { count } : undefined)
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString());
  if (!filters.includeTests) query = query.eq("is_test", false);
  const q = filters.q
    ?.trim()
    .replace(/[%*,()."\\]/g, " ")
    .slice(0, 80);
  if (q) query = query.or(`name.ilike.*${q}*,email.ilike.*${q}*,phone.ilike.*${q.replace(/\D/g, "") || q}*`);
  return query;
}

export async function leadsOverview(filters: LeadFilters) {
  const { config } = await getSettings();
  const timeZone = config.hours.timezone;
  const range = periodRange(filters.period, timeZone, { from: filters.from, to: filters.to });

  const [list, statsRows] = await Promise.all([
    sessionsQuery(filters, range, LIST_COLUMNS, "exact")
      .order("created_at", { ascending: false })
      .range((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE - 1),
    sessionsQuery(filters, range, "id, created_at, first_message_at, first_agent_reply_at, page_url, utm, lead_webhook_status").limit(
      STATS_LIMIT,
    ),
  ]);
  if (list.error) throw new Error(list.error.message);
  const rows = (statsRows.data ?? []) as unknown as {
    id: string;
    created_at: string;
    first_message_at: string | null;
    first_agent_reply_at: string | null;
    page_url: string | null;
    utm: Record<string, string>;
    lead_webhook_status: string;
  }[];

  // Messages of the sessions in the period, split by author.
  const ids = rows.map((row) => row.id);
  const countMessages = async (author: "visitor" | "agent") => {
    if (!ids.length) return 0;
    let total = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const { count } = await db()
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("author", author)
        .in("session_id", ids.slice(i, i + 200));
      total += count ?? 0;
    }
    return total;
  };
  const [received, sent] = await Promise.all([countMessages("visitor"), countMessages("agent")]);

  const withMessage = rows.filter((row) => row.first_message_at);
  const responseTimes = rows
    .filter((row) => row.first_message_at && row.first_agent_reply_at)
    .map((row) => Date.parse(row.first_agent_reply_at!) - Date.parse(row.first_message_at!))
    .filter((ms) => ms >= 0);

  const byDay = new Map<string, number>();
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 24 * 3600_000) byDay.set(localDate(new Date(t), timeZone), 0);
  const byHour = Array.from({ length: 24 }, () => 0);
  const pages = new Map<string, number>();
  const sources = new Map<string, number>();
  for (const row of rows) {
    const at = new Date(row.created_at);
    const day = localDate(at, timeZone);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    byHour[localHour(at, timeZone)]!++;
    if (row.page_url) {
      let page = row.page_url;
      try {
        const url = new URL(row.page_url);
        page = url.host + url.pathname;
      } catch {}
      pages.set(page, (pages.get(page) ?? 0) + 1);
    }
    const source = [row.utm?.source, row.utm?.medium, row.utm?.campaign].filter(Boolean).join(" / ");
    if (source) sources.set(source, (sources.get(source) ?? 0) + 1);
  }
  const top = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    stats: {
      conversations: withMessage.length,
      leads: rows.length,
      conversion: rows.length ? withMessage.length / rows.length : 0,
      received,
      sent,
      avgFirstResponseMs: responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
      leadWebhookFailed: rows.filter((row) => row.lead_webhook_status === "failed").length,
      truncated: rows.length >= STATS_LIMIT,
    },
    byDay: [...byDay.entries()].map(([day, count]) => ({ day, count })),
    byHour,
    topPages: top(pages),
    topSources: top(sources),
    sessions: list.data ?? [],
    total: list.count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

export async function leadsForExport(filters: LeadFilters) {
  const { config } = await getSettings();
  const range = periodRange(filters.period, config.hours.timezone, { from: filters.from, to: filters.to });
  const { data, error } = await sessionsQuery(filters, range, LIST_COLUMNS).order("created_at", { ascending: false }).limit(10_000);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], timeZone: config.hours.timezone };
}

// LGPD: removes everything stored here about a visitor (session, messages, files). DataCrazy keeps its own copy.
export async function deleteVisitorData(sessionId: string): Promise<boolean> {
  const { data: files } = await db().from("attachments").select("path").eq("session_id", sessionId);
  const paths = (files ?? []).map((file) => file.path as string);
  if (paths.length) await db().storage.from(STORAGE_BUCKET).remove(paths);
  await db().from("integration_logs").delete().eq("session_id", sessionId);
  const { error, count } = await db().from("sessions").delete({ count: "exact" }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
