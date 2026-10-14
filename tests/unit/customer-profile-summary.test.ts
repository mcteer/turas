import { describe, expect, it } from "vitest";
import { profileSummary, researchProductMentions } from "../../lib/profiles/summary";
const evidence = ['11111111-1111-4111-8111-111111111111'];
const date = '2026-10-01T00:00:00Z';
const maturity = { kind: 'maturity_assessment', observationStart: date, observationEnd: date, assessor: 'Synthetic assessor', rubricVersion: 'customer-maturity-v1',
  rationale: 'Synthetic scoped assessment', journeyStage: 'Accelerate', reviewAt: '2026-12-01T00:00:00Z', nextCapability: 'Measure outcomes', evidenceRevisionIds: evidence,
  dimensions: ['outcome_ownership','delivery_collaboration','experience_adoption','operational_trust','platform_organization','innovation_ai'].map(key => ({ key, state: 'Established', rationale: 'Observed synthetic capability', nextCapability: 'Measure outcomes', evidenceRevisionIds: evidence })) };
const risk = { kind: 'risk', category: 'Delivery', description: 'Synthetic review risk', owner: 'Synthetic owner', likelihood: 2, impact: 3, severity: 'high', severityRationale: 'Synthetic risk assessment', mitigation: 'Review dependencies', status: 'open', observedAt: date, evidenceRevisionIds: evidence };
describe('customer overview scope and unknowns', () => {
  it('preserves unknown maturity/risk rather than deriving them from products or public research', () => {
    expect(profileSummary([], null)).toMatchObject({ maturity: null, risk: null, products: [] });
    expect(profileSummary([{ kind: 'maturity_assessment', workloadId: 'workload-a', payload: maturity }], null).maturity).toBe(null);
    expect(profileSummary([{ kind: 'maturity_assessment', workloadId: 'workload-a', payload: maturity }], 'workload-a').maturity).toMatchObject({ stage: 'Accelerate', stageNumber: 3 });
  });
  it('withholds conflicted or unsupported facts and excludes resolved risks and planned products', () => {
    const fact = (payload: unknown, kind: string, supportStatus = 'settled') => ({ kind, workloadId: null, payload, supportStatus });
    const product = { kind: 'product_use', productKey: 'sandbox', displayName: 'Vercel Sandbox', state: 'planned', usageDescription: 'Synthetic planned pilot', observedAt: date, evidenceRevisionIds: evidence };
    const value = profileSummary([fact(maturity,'maturity_assessment','unsupported'),fact(risk,'risk','conflicted'),fact({...risk,status:'resolved'},'risk'),fact(product,'product_use')], null);
    expect(value).toMatchObject({ maturity: null, risk: null, products: [] });
    expect(profileSummary([fact(risk,'risk')],null).risk).toMatchObject({level:'high',count:1});
  });
  it('keeps researched product identity attached to its exact source and excludes generic sandbox mentions', () => {
    const source = { sourceRevisionId: evidence[0], title: 'Synthetic Workers case study', location: 'https://example.com/case', supportedClaim: 'The checked customer source reports that Synthetic Workers run on Vercel Sandbox.' };
    expect(researchProductMentions([source])).toEqual([{ name: 'Vercel Sandbox', sources: [source] }]);
    expect(researchProductMentions([{...source,supportedClaim:'The customer uses a generic local sandbox.'}])).toEqual([]);
    expect(researchProductMentions([{...source,supportedClaim:'The customer does not use Vercel Sandbox.'}])).toEqual([]);
    expect(researchProductMentions([{...source,supportedClaim:'The customer plans to use Vercel Sandbox.'}])).toEqual([]);
  });
});
