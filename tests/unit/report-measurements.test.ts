import {randomUUID} from 'node:crypto';import {describe,it,expect} from 'vitest';
import {reportMeasurementInputs} from '../../lib/server/reports/measurements';
function record(){return {revisionId:randomUUID(),kind:'outcome',content:{kind:'outcome',title:'Reviewed Measurement',narrative:'Synthetic bounded observation',audience:'delivery',eventDate:'2026-09-30',timezone:'UTC',workPackageKey:null,milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Not assigned',references:[{id:randomUUID(),kind:'milestone_baseline',sourceRevisionId:randomUUID(),generation:1,contentDigest:'a'.repeat(64)}],status:'observed',measure:'Response Time',unit:'ms',currentValue:'+100',baselineValue:'80',comparisonValue:'90',baselineUnknownReason:null,comparisonUnknownReason:null,measurementStart:'2026-09-01',measurementEnd:'2026-09-30',limitationReason:null}};}
describe('accepted original measurement inputs',()=>{
 it('preserves explicit measure/window/units and calculates exact comparable change',()=>{
  const [measurement]=reportMeasurementInputs([record()],'2026-10-03');
  expect(measurement.input).toMatchObject({current:'+100',baseline:'80',unit:'ms',measurementStart:'2026-09-01',measurementEnd:'2026-09-30'});
  expect(measurement.result).toEqual({change:'20',percentage:'25.00',reason:null});
 });
 it('keeps future observations, missing comparisons and stated limitations unknown',()=>{
  const future=record();future.content.measurementEnd='2026-10-04';
  expect(reportMeasurementInputs([future],'2026-10-03')[0]).toMatchObject({input:{current:null},result:{change:null,percentage:null}});
  const missing:any=record();missing.content.baselineValue=null;missing.content.baselineUnknownReason='No accepted baseline';
  expect(reportMeasurementInputs([missing],'2026-10-03')[0].result).toMatchObject({change:null,percentage:null,reason:'measurement_unknown'});
  const limited:any=record();limited.content.limitationReason='Windows are not comparable';
  expect(reportMeasurementInputs([limited],'2026-10-03')[0].result).toMatchObject({change:null,percentage:null,reason:'non_comparable'});
 });
 it('preserves measured zero and never divides by a zero baseline',()=>{
  const zero=record();zero.content.currentValue='0';zero.content.baselineValue='0';
  expect(reportMeasurementInputs([zero],'2026-10-03')[0]).toMatchObject({input:{current:'0',baseline:'0'},result:{change:'0',percentage:null,reason:'zero_baseline'}});
 });
});
