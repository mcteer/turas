import type { StaffingCurrency } from "../../../lib/contracts/staffing-economics";

/** Format the persisted integer, preserving cents and negative contribution. */
export function staffingMoney(value: string | null, currency: StaffingCurrency): string {
  if (value === null) return "Unavailable";
  const amount = BigInt(value), negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const exponent = currency === "JPY" ? 0 : 2;
  const scale = exponent === 0 ? 1n : 100n;
  const whole = absolute / scale;
  const signed = negative ? whole === 0n ? -0 : -whole : whole;
  return new Intl.NumberFormat("en-US", { style: "currency", currency,
    minimumFractionDigits: exponent, maximumFractionDigits: exponent }).formatToParts(signed)
    .map(part => part.type === "fraction" ? (absolute % scale).toString().padStart(exponent, "0") : part.value).join("");
}
