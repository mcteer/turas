/** Content failure may precede native usage settlement. Never infer usage or
 * repeat a paid call just because the advice record is already terminal. */
export function supportCaptureSettled(row: { state: string; response_state: string | null;
  admitted_steps: number; usage_steps: number } | undefined): boolean {
  return Boolean(row && ["completed", "failed", "cancelled", "expired", "unconfirmed"].includes(row.state) &&
    row.response_state && ["completed", "failed", "cancelled", "expired", "unconfirmed"].includes(row.response_state) &&
    Number.isSafeInteger(row.admitted_steps) && row.admitted_steps >= 0 &&
    Number.isSafeInteger(row.usage_steps) && row.usage_steps === row.admitted_steps);
}
