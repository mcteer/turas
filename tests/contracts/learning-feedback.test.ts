import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { learningFeedbackSchema, learningDispositionSchema, learningDraftSchema, microUsdSchema, learningArmOutputSchema } from '../../lib/contracts/learning';
const envelope = () => ({ contractVersion: 'learning-v1', requestId: randomUUID(), expectedVersion: 0 });
const target = () => ({ kind: 'shared_practice', id: randomUUID(), revisionId: randomUUID(), generation: 1, digest: 'a'.repeat(64) });
describe('learning strict command boundaries', () => {
  it('requires an exact immutable target and rejects claims of approval', () => {
    const input = { ...envelope(), target: target(), category: 'unclear', text: 'The prerequisite needs explanation.' };
    expect(learningFeedbackSchema.safeParse(input).success).toBe(true);
    for (const bad of [{ ...input, approved: true }, { ...input, target: { ...input.target, generation: 0 } }, { ...input, text: 'x'.repeat(2001) }, { ...input, target: { ...input.target, kind: 'conversation' } }])
      expect(learningFeedbackSchema.safeParse(bad).success).toBe(false);
  });
  it('cannot link without an exact candidate or hide a link under another disposition', () => {
    const input = { ...envelope(), expectedVersion: 1, state: 'linked', rationale: 'Reviewed proposed improvement' };
    expect(learningDispositionSchema.safeParse(input).success).toBe(false);
    expect(learningDispositionSchema.safeParse({ ...input, candidateRevisionId: randomUUID() }).success).toBe(true);
    expect(learningDispositionSchema.safeParse({ ...input, state: 'dismissed', candidateRevisionId: randomUUID() }).success).toBe(false);
  });
  it('requires a positive explicit budget and rejects unknown authority fields from a model', () => {
    for (const value of ['0', '-1', '25.000001', '1.0000001', '1e1', '01']) expect(microUsdSchema.safeParse(value).success).toBe(false);
    expect(microUsdSchema.parse('25')).toBe('25');
    expect(learningArmOutputSchema.safeParse({ kind: 'answer', text: 'Proposed next step', citationKeys: [], unknowns: [], passed: true }).success).toBe(false);
    expect(learningDraftSchema.safeParse({ ...envelope(), customerId: randomUUID(), question: 'Improve this', feedbackIds: [], lineage: [], budgetUsd: '1' }).success).toBe(false);
  });
});
