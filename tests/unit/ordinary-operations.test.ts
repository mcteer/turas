import {operationsReadDigest} from '../../lib/server/ordinary-operations/consumption';
import {describe,it,expect} from 'vitest';
import {engagementMetrics,portfolioMetrics,wholeEngagementBasis,wholeEngagementScenario} from '../../lib/server/ordinary-operations/calculations';
import {requireStaffingCapability} from '../../lib/server/staffing/policy';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {engagementInputSchema,scenarioInputSchema} from '../../lib/server/ordinary-operations/reads';
import {calculateExecutionEffort} from '../../lib/execution/calculations';
import {interventionSchema} from '../../lib/server/ordinary-operations/interventions';
describe('ordinary engagement deterministic mechanism',()=>{
 it('replaces remaining effort and calculates original EAC/contribution in exact minor units',()=>{
  const base={actualMinutes:'12000',remainingMinutes:'4800',fee:'6000000',loadedRate:'12500',nonlabor:'800000'};
  expect(engagementMetrics(base)).toMatchObject({status:'known',effortAtCompletionMinutes:'16800',allocatedDeliveryCost:'4300000',contribution:'1700000',contributionPercent:'28.33'});
  expect(engagementMetrics({...base,remainingMinutes:'2400'})).toMatchObject({contribution:'2200000',contributionPercent:'36.67'});
  expect(engagementMetrics({...base,remainingMinutes:'7200'})).toMatchObject({contribution:'1200000',contributionPercent:'20.00'});
 });
 it('keeps absent rates/estimates unknown and zero-revenue percentage undefined',()=>{
  expect(engagementMetrics({actualMinutes:'60',remainingMinutes:null,fee:'100',loadedRate:null,nonlabor:'0'})).toMatchObject({status:'unknown',contribution:null,reasons:['missing_remainingMinutes','missing_loadedRate']});
  expect(engagementMetrics({actualMinutes:'1',remainingMinutes:'0',fee:'0',loadedRate:'30',nonlabor:'0'})).toMatchObject({allocatedDeliveryCost:'1',contribution:'-1',contributionPercent:null});
 });
 it('uses half-away money rounding rather than binary floating point',()=>{
  expect(engagementMetrics({actualMinutes:'1',remainingMinutes:'0',fee:'100',loadedRate:'29',nonlabor:'0'}).allocatedDeliveryCost).toBe('0');
  expect(engagementMetrics({actualMinutes:'1',remainingMinutes:'0',fee:'100',loadedRate:'30',nonlabor:'0'}).allocatedDeliveryCost).toBe('1');
 });
 it('retains real finance/personnel boundaries',()=>{
  const actor={kind:'internal',role:'member',principalId:'other'} as CurrentSession;
  expect(()=>requireStaffingCapability(actor,'operational')).not.toThrow();
  expect(()=>requireStaffingCapability(actor,'finance')).toThrow();
  expect(()=>requireStaffingCapability({...actor,kind:'partner'},'operational')).toThrow();
  expect(()=>requireStaffingCapability({...actor,role:'admin',principalId:DEMO_IDS.mcteer},'finance')).not.toThrow();
 });
 it('aggregates complete same-currency amounts without hiding missing or private economics',()=>{
  expect(portfolioMetrics([{currency:'USD',fee:'100',contribution:'20'},{currency:'USD',fee:'200',contribution:'-10'}])).toEqual({currency:'USD',forecastRevenue:'300',forecastContribution:'10',complete:true});
  expect(portfolioMetrics([{currency:'USD',fee:'100',contribution:'20'},{currency:'EUR',fee:'200',contribution:'30'}])).toMatchObject({currency:null,forecastRevenue:null,forecastContribution:null,complete:false});
  expect(portfolioMetrics([{currency:'USD',fee:'100',contribution:null}])).toMatchObject({forecastRevenue:'100',forecastContribution:null,complete:false});
  expect(portfolioMetrics([])).toMatchObject({forecastRevenue:null,forecastContribution:null,complete:false});
 });
 it('never mixes historical lifetime effort with a selected reporting period fee/nonlabor',()=>{
  const effort=calculateExecutionEffort({asOf:'2026-10-15T12:00:00Z',period:{from:'2026-10-01',to:'2026-10-15'},baselineCurrent:true,reconciledAt:null,packages:[{key:'proof',budgetMinutes:12000,estimate:{minutes:2400,asOf:'2026-10-14T12:00:00Z',explicitZero:false},lastActualMutationAt:null}],actuals:[{minutes:6000,date:'2026-09-15',billable:true,mappedKey:'proof',disposition:'current'},{minutes:600,date:'2026-10-10',billable:true,mappedKey:'proof',disposition:'current'}]});
  expect(effort).toMatchObject({actualLifetimeMinutes:'6600',actualPeriodMinutes:'600',remainingMinutes:'2400'});
  const baseline=wholeEngagementBasis(effort);expect(baseline).toMatchObject({actualMinutes:'6600',fee:null,nonlabor:null,loadedRate:null});
  const partial=wholeEngagementScenario(baseline,{currency:'USD',wholeEngagementLoadedRateMinorUnitsPerHour:'12500'});
  expect(partial.metrics).toMatchObject({status:'unknown',contribution:null,reasons:expect.arrayContaining(['missing_fee','missing_nonlabor'])});
  const explicit=wholeEngagementScenario(baseline,{currency:'USD',wholeEngagementLoadedRateMinorUnitsPerHour:'12500',wholeEngagementFeeMinorUnits:'6000000',wholeEngagementNonlaborMinorUnits:'800000'});
  expect(explicit.metrics).toMatchObject({status:'known',effortAtCompletionMinutes:'9000',allocatedDeliveryCost:'2675000',contribution:'3325000'});
  expect(wholeEngagementScenario(baseline,{wholeEngagementLoadedRateMinorUnitsPerHour:'12500',wholeEngagementFeeMinorUnits:'6000000',wholeEngagementNonlaborMinorUnits:'800000'}).metrics).toMatchObject({status:'unknown',contribution:null,reasons:['missing_currency']});
 });
 it('read fences ignore only generated projection clocks and preserve authored clocks/source versions',()=>{
  const value={asOf:'first',summary:{asOf:'first',receipt:{inputDigest:'stable',generation:1}},records:[{revisionId:'first',content:{asOf:'authored-first'}}]};
  expect(operationsReadDigest(value)).toBe(operationsReadDigest({...value,asOf:'later',summary:{...value.summary,asOf:'later'}}));
  expect(operationsReadDigest(value)).not.toBe(operationsReadDigest({...value,records:[{revisionId:'second',content:{asOf:'authored-first'}}]}));
  expect(operationsReadDigest(value)).not.toBe(operationsReadDigest({...value,records:[{revisionId:'first',content:{asOf:'authored-second'}}]}));
 });
 it('requires exact scoped interventions and bounded explicit periods',()=>{
  const engagementId='00000000-0000-4000-8000-000000000001';
  expect(engagementInputSchema.safeParse({engagementId,fromDate:'2026-01-01',toDate:'2026-01-03'}).success).toBe(true);
  expect(engagementInputSchema.safeParse({engagementId,fromDate:'2026-02-01',toDate:'2026-01-03'}).success).toBe(false);
  expect(scenarioInputSchema.safeParse({engagementId,fromDate:'2026-01-01',toDate:'2026-01-03',wholeEngagementFeeMinorUnits:'-1'}).success).toBe(false);
  expect(interventionSchema.safeParse({engagementId,status:'approved',rationale:'Model says approved'}).success).toBe(false);
 });
});
