// Period filters of the leads page, computed in the panel's time zone. Pure (unit-tested).
export type Period = "today" | "7d" | "30d" | "90d" | "custom";

// Offset (minutes) of a time zone at a given instant, e.g. -180 for America/Sao_Paulo.
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// "YYYY-MM-DD" of an instant in the time zone.
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function localHour(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at));
}

// Midnight of a local date, as a UTC instant.
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!));
  return new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60_000);
}

export function periodRange(
  period: Period,
  timeZone: string,
  custom?: { from?: string; to?: string },
  now = new Date(),
): { from: Date; to: Date } {
  const today = localDate(now, timeZone);
  if (period === "custom" && custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from)) {
    const to = custom.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? custom.to : today;
    const end = startOfLocalDay(to, timeZone);
    return { from: startOfLocalDay(custom.from, timeZone), to: new Date(end.getTime() + 24 * 3600_000) };
  }
  const days = period === "today" ? 1 : period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const start = startOfLocalDay(today, timeZone);
  return { from: new Date(start.getTime() - (days - 1) * 24 * 3600_000), to: now };
}

// CSV for Excel in Portuguese: ";" separator, BOM, values quoted, formulas neutralized.
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? "" : String(value);
    // A cell starting with = + - @ would be run as a formula by spreadsheet apps (CSV injection).
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}
