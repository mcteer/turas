import {expect,it} from 'vitest';
import {calculateServicesPlan,DEFAULT_SERVICES_PLAN} from '../../lib/server/staffing/services-plan';

it('preserves legacy full annual payroll, overhead and pricing-floor arithmetic',()=>{
  expect(calculateServicesPlan(DEFAULT_SERVICES_PLAN)).toMatchObject({
    availableHours:5520,billableHours:3588,revenue:897000,totalCost:810000,
    operatingContribution:87000,operatingMarginPercent:9.7,targetRate:282.19,
    breakEvenUtilizationPercent:58.7,
  });
  expect(calculateServicesPlan({...DEFAULT_SERVICES_PLAN,billablePercent:50}).operatingContribution).toBe(-120000);
  expect(calculateServicesPlan({...DEFAULT_SERVICES_PLAN,deliveryWeeks:30}).payroll).toBe(690000);
});

it('preserves zero-denominator, protected-capacity and invalid-input behavior',()=>{
  expect(calculateServicesPlan({...DEFAULT_SERVICES_PLAN,billablePercent:0})).toMatchObject({
    operatingMarginPercent:null,targetRate:null,operatingContribution:-810000,
  });
  expect(calculateServicesPlan({...DEFAULT_SERVICES_PLAN,realizedHourlyRate:0}).breakEvenUtilizationPercent).toBeNull();
  expect(calculateServicesPlan({...DEFAULT_SERVICES_PLAN,billablePercent:80}).capacityFeasible).toBe(false);
  expect(calculateServicesPlan({...DEFAULT_SERVICES_PLAN,realizedHourlyRate:100}).breakEvenFeasible).toBe(false);
  for(const value of [NaN,Infinity,-1])expect(()=>calculateServicesPlan({...DEFAULT_SERVICES_PLAN,realizedHourlyRate:value})).toThrow();
});
