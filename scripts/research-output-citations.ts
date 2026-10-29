import {citationLocatorSchema} from '../lib/contracts/retrieval';

export type ResearchCitationForValidation = {
  id: string;
  source_kind: string;
  source_revision_id: string;
  consumed: boolean;
  current: boolean;
  locators: readonly unknown[];
};

/** The caller resolves eligible rows through the governed citation resolver.
 * Receipt identities retain their original semantics; additional unit identities
 * require the exact current approved source consumed by this response. */
export function countUnknownResearchIdentifiers(input: {
  response: string;
  customerId: string;
  approvedSelectionId: string;
  citations: readonly ResearchCitationForValidation[];
}): number {
  const outputIds = new Set(input.response.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []);
  const knownIds = new Set([input.customerId]);
  for (const row of input.citations) {
    knownIds.add(row.id);
    if (!row.current || !row.consumed || row.source_kind !== 'approved_excerpt' ||
        row.source_revision_id !== input.approvedSelectionId) continue;
    for (const value of row.locators) {
      const locator = citationLocatorSchema.safeParse(value);
      if (locator.success && locator.data.kind === 'artifact_unit') {
        knownIds.add(locator.data.unitId);
      }
    }
  }
  return [...outputIds].filter((id) => !knownIds.has(id)).length;
}
