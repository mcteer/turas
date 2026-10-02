export function roundHalfAway(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("Positive denominator required");
  const sign = numerator < 0n ? -1n : 1n, absolute = numerator * sign;
  return sign * (absolute / denominator + (absolute % denominator * 2n >= denominator ? 1n : 0n));
}
export function twoDecimalPercentage(value: bigint): string {
  const sign = value < 0n ? "-" : "", absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
