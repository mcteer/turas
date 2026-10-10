import {describe,it,expect} from 'vitest';
import {learningRational,learningRoundedMean,learningCustomerChange} from '../../lib/learning/calculations';
import {learningQuarterWindows} from '../../lib/learning/metric-protocols';
import {learningMeasurementExamples,learningMeasurementExpectedMean,learningPrivacyPopulationSizes} from '../fixtures/learning/measurements';
const locators=[{sourceKind:'accepted_profile' as const,revisionId:'00000000-0000-4000-8000-000000000001',generation:1,digest:'a'.repeat(64),fieldPath:'/statement'}];
const window=(deployments:number,totalMinutes:string|null,failedDeployments:number|null)=>({start:'2026-01-01T00:00:00Z',end:'2026-01-15T00:00:00Z',deployments,totalMinutes,failedDeployments,fieldLocators:locators});
describe('fixed exact outcome calculations',()=>{
 it('matches the independently authored population including unavailable measurements',()=>{
  const changes=learningMeasurementExamples.map(example=>{const change=learningCustomerChange('deployment_lead_time',{...window(1,'0',null),...example.baseline},{...window(1,'0',null),...example.current});expect(change?learningRoundedMean([change]):null).toBe(example.expectedChange);return change;}).filter(value=>value!==null);
  expect(learningRoundedMean(changes)).toBe(learningMeasurementExpectedMean);expect(learningPrivacyPopulationSizes).toEqual({suppressed:4,minimum:5});
 });
 it('uses equal customers rather than pooled deployment weights and retains worsening and unchanged values',()=>{
  const improvements=learningCustomerChange('deployment_lead_time',window(100,'2000',null),window(100,'1000',null))!,worsening=learningCustomerChange('deployment_lead_time',window(1,'10',null),window(1,'30',null))!,unchanged=learningCustomerChange('deployment_lead_time',window(1,'7',null),window(1,'7',null))!;
  expect(learningRoundedMean([improvements,worsening,unchanged])).toBe('3.33');
 });
 it('reports signed percentage points without relative uplift or intermediate rounding',()=>{
  expect(learningRoundedMean([learningCustomerChange('change_failure_rate',window(3,null,1),window(7,null,2))!])).toBe('-4.76');
  expect(learningRoundedMean([learningRational(1n,3n),learningRational(-1n,3n),learningRational(3n,200n)])).toBe('0.01');
 });
 it.each([[1n,200n,'0.01'],[-1n,200n,'-0.01'],[49n,10000n,'0.00'],[-49n,10000n,'0.00'],[999999999999999n,1000000n,'1000000000.00']] as const)('rounds final %s/%s to %s', (n,d,expected)=>expect(learningRoundedMean([learningRational(n,d)])).toBe(expected));
 it('treats zero deployment counts as unavailable and rejects negative or excessive counts/values',()=>{
  expect(learningCustomerChange('deployment_lead_time',window(0,'0',null),window(1,'1',null))).toBeNull();
  expect(()=>learningCustomerChange('change_failure_rate',window(1,null,2),window(1,null,0))).toThrow();expect(()=>learningCustomerChange('deployment_lead_time',window(1,'-1',null),window(1,'0',null))).toThrow();expect(()=>learningRoundedMean([])).toThrow();
 });
 it('fixes completed UTC quarter half-open windows including leap years and enforces failure lag exactly',()=>{
  expect(learningQuarterWindows('deployment_lead_time','2024-Q1',new Date('2024-04-01T00:00:00Z'))).toMatchObject({baseline:{start:'2024-01-01T00:00:00.000Z',end:'2024-01-15T00:00:00.000Z'},current:{start:'2024-03-18T00:00:00.000Z',end:'2024-04-01T00:00:00.000Z'}});
  expect(()=>learningQuarterWindows('deployment_lead_time','2026-Q4',new Date('2026-10-09T00:00:00Z'))).toThrow();expect(()=>learningQuarterWindows('change_failure_rate','2026-Q3',new Date('2026-10-01T23:59:59.999Z'))).toThrow();expect(learningQuarterWindows('change_failure_rate','2026-Q3',new Date('2026-10-02T00:00:00Z')).eligibleAt).toBe('2026-10-02T00:00:00.000Z');
 });
});
