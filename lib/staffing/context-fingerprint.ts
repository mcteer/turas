type DeliveryContext = { contextVersion: string; entries: Record<string, unknown>[];
  customer: { id: string; displayName: string; synthetic: boolean }; complete: boolean };

/** Assessment clocks are refreshed on every governed profile read. Retain the
 * current scores, freshness, source identity and payload, but do not mistake a
 * new assessment timestamp or rolling validity deadline for a source change.
 * The original injection deadline is independently fenced by its receipt. */
export function staffingDeliveryContextIdentity(context: DeliveryContext, workloadId: string | null) {
  const entries = context.entries.map(entry => {
    if (typeof entry.quality !== "object" || entry.quality === null || Array.isArray(entry.quality)) return entry;
    const { asOf: _asOf, validUntil: _validUntil, ...quality } = entry.quality as Record<string, unknown>;
    return { ...entry, quality };
  });
  return { generation: context.contextVersion, entries, complete: context.complete, workloadId, customer: context.customer };
}
