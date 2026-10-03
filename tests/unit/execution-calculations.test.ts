import {describe,it,expect} from "vitest";
import {calculateExecutionEffort,calculateActualUtilization,estimateFreshness} from "../../lib/execution/calculations";
import {effort,actual,work,asOf,utilizationVectors} from "../fixtures/execution/arithmetic";

describe("independent execution minute arithmetic",()=>{
  it("separates lifetime and inclusive captured-date period actuals, preserves classification, and gives negative variance",()=>{
    const input=effort();input.actuals=[actual("60","2026-09-30"),actual("20","2026-10-01"),{...actual("10","2026-10-02"),billable:false},actual("5","2026-10-03")];
    const result=calculateExecutionEffort(input);
    expect(result).toMatchObject({formulaVersion:"execution-effort-v1",actualLifetimeMinutes:"95",actualPeriodMinutes:"30",billablePeriodMinutes:"20",nonbillablePeriodMinutes:"10",remainingMinutes:"30",forecastMinutes:"125",budgetMinutes:"120",varianceMinutes:"5"});
    expect(calculateExecutionEffort(effort()).varianceMinutes).toBe("-30");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it("retains historical actuals in forecast but refuses variance for retired or unmapped work",()=>{
    const input=effort();input.actuals.push(actual("40","2026-09-01",null));
    expect(calculateExecutionEffort(input)).toMatchObject({actualLifetimeMinutes:"100",remainingMinutes:"30",forecastMinutes:"130",varianceMinutes:null,varianceReason:"unmapped_historical_actual"});
    input.actuals[1]={...input.actuals[1],mappedKey:"proof",disposition:"mapped" as never};
    expect(calculateExecutionEffort(input).varianceMinutes).toBe("10");
    expect(calculateExecutionEffort({...input,baselineCurrent:false})).toMatchObject({forecastMinutes:null,varianceMinutes:null});
  });
  it("preserves big integer totals beyond Number.MAX_SAFE_INTEGER and rejects unsafe numeric input",()=>{
    const input=effort();input.actuals=[actual("9007199254740993"),actual("2")];
    expect(calculateExecutionEffort(input)).toMatchObject({actualLifetimeMinutes:"9007199254740995",forecastMinutes:"9007199254741025",varianceMinutes:"9007199254740905"});
    expect(()=>calculateExecutionEffort({...input,actuals:[{...actual(),minutes:9007199254740992 as never}]})).toThrow();
  });
  it("distinguishes explicit zero, absent budgets, missing estimates and independently entered point budgets",()=>{
    const input=effort();input.packages[0].estimate={minutes:"0",asOf,explicitZero:true};
    expect(calculateExecutionEffort(input)).toMatchObject({remainingMinutes:"0",forecastMinutes:"60",varianceMinutes:"-60"});
    input.packages[0].budgetMinutes=null;
    expect(calculateExecutionEffort(input)).toMatchObject({budgetMinutes:null,forecastMinutes:"60",varianceMinutes:null,varianceReason:"missing_budget"});
    const missing={...input,packages:[input.packages[0],{...work("rollout"),estimate:null}]};
    expect(calculateExecutionEffort(missing)).toMatchObject({actualLifetimeMinutes:"60",remainingMinutes:null,forecastMinutes:null,varianceMinutes:null});
    expect(calculateExecutionEffort(missing).missingEstimates).toEqual([{key:"rollout",reason:"missing_estimate"}]);
  });
  it("uses UTC calendar day 7/8, future/as-of boundaries, reconciliation and actual mutation freshness",()=>{
    const estimate={minutes:"0",asOf:"2026-03-01T23:59:00.000Z",explicitZero:true};
    expect(estimateFreshness(estimate,"2026-03-08T00:00:00.000Z",null,null)).toBeNull();
    expect(estimateFreshness(estimate,"2026-03-09T00:00:00.000Z",null,null)).toBe("stale_estimate");
    expect(estimateFreshness(estimate,"2026-03-01T23:58:59.999Z",null,null)).toBe("future_estimate");
    expect(estimateFreshness(estimate,"2026-03-08T00:00:00.000Z",estimate.asOf,null)).toBeNull();
    expect(estimateFreshness(estimate,"2026-03-08T00:00:00.000Z","2026-03-01T23:59:00.000001Z",null)).toBe("actuals_after_estimate");
    expect(estimateFreshness(estimate,"2026-03-08T00:00:00.000Z",null,"2026-03-01T23:59:00.000001Z")).toBe("baseline_reconciliation");
    expect(estimateFreshness(estimate,"2026-03-08T00:00:00.000Z","2026-03-02T00:00:00.000Z",null)).toBe("actuals_after_estimate");
    expect(estimateFreshness(estimate,"2026-03-08T00:00:00.000Z",null,"2026-03-02T00:00:00.000Z")).toBe("baseline_reconciliation");
    expect(estimateFreshness({...estimate,explicitZero:false},"2026-03-08T00:00:00.000Z",null,null)).toBe("zero_not_asserted");
  });
});

describe("actual utilization oracle",()=>{
  for(const vector of utilizationVectors)it(`${vector.actual}/${vector.available} minutes = ${vector.expected}%`,()=>{
    expect(calculateActualUtilization([{resourceId:"a",date:"2026-10-01",actualBillableMinutes:vector.actual,availableMinutes:vector.available,reason:null}])).toMatchObject({percentage:vector.expected,state:"complete"});
  });
  it("rounds once after summing, handles zero/missing/timezone mismatch and refuses duplicate days",()=>{
    const day={resourceId:"a",date:"2026-10-01",actualBillableMinutes:"1",availableMinutes:"3",reason:null};
    expect(calculateActualUtilization([day,{...day,date:"2026-10-02",actualBillableMinutes:"2"}]).percentage).toBe("50.00");
    expect(calculateActualUtilization([{...day,availableMinutes:"0"}])).toMatchObject({percentage:null,state:"not_applicable"});
    expect(calculateActualUtilization([{...day,availableMinutes:null,reason:"missing_calendar"}])).toMatchObject({percentage:null,state:"incomplete",actualBillableMinutes:"1",availableMinutes:null});
    expect(calculateActualUtilization([{...day,reason:"timezone_mismatch"}])).toMatchObject({percentage:null,state:"incomplete"});
    expect(()=>calculateActualUtilization([day,day])).toThrow();
  });
});
