/** Default observed dates must use the same calendar day as their declared zone. */
export function executionDateInZone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone,
    calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (field: "year" | "month" | "day") => parts.find(item => item.type === field)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
