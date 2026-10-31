import type { WebchatConfig } from "@/lib/settings/schema";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Whether "now" falls inside the configured business hours, in the configured time zone.
export function isOpenNow(hours: WebchatConfig["hours"], now = new Date()): boolean {
  if (!hours.enabled) return true;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: hours.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return true;
  }
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = hours.days[WEEKDAYS.indexOf(get("weekday"))];
  if (!day?.enabled) return false;
  const current = `${get("hour")}:${get("minute")}`;
  // Ranges that cross midnight (e.g. 22:00–02:00) are not supported; the panel validates open < close.
  return current >= day.open && current < day.close;
}
