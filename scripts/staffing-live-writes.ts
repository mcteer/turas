export type StaffingLiveWriteReceipt = { id: string; receipt_table: string; action: string;
  actor_membership_id: string; request_key: string; digest: string };
export type StaffingLiveExpectedWrite = Pick<StaffingLiveWriteReceipt, "receipt_table" | "action" | "actor_membership_id" | "request_key">;

/** Every governed staffing writer leaves an immutable receipt. Preserve old
 * receipts exactly and allow only the runner's exact deliberate human write. */
export function assertStaffingLiveWrites(before: readonly StaffingLiveWriteReceipt[], after: readonly StaffingLiveWriteReceipt[],
  expected: readonly StaffingLiveExpectedWrite[]) {
  const key = (receipt: StaffingLiveWriteReceipt) => `${receipt.receipt_table}/${receipt.id}`;
  const original = new Map(before.map(receipt => [key(receipt), receipt]));
  const current = new Map(after.map(receipt => [key(receipt), receipt]));
  if (original.size !== before.length || current.size !== after.length) throw new Error("Duplicate live write receipt");
  for (const [id, receipt] of original) {
    if (JSON.stringify(current.get(id)) !== JSON.stringify(receipt)) throw new Error("Original live write receipt changed or disappeared");
  }
  const added = after.filter(receipt => !original.has(key(receipt)));
  const allowedKey = (receipt: StaffingLiveExpectedWrite) => JSON.stringify([receipt.receipt_table, receipt.action, receipt.actor_membership_id, receipt.request_key]);
  if (new Set(expected.map(allowedKey)).size !== expected.length || added.length !== expected.length || expected.some(allowed => added.filter(receipt =>
    receipt.receipt_table === allowed.receipt_table && receipt.action === allowed.action &&
    receipt.actor_membership_id === allowed.actor_membership_id && receipt.request_key === allowed.request_key).length !== 1))
    throw new Error("Live advice created an unexpected staffing write");
}
