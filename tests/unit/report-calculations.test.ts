import {describe,it,expect} from 'vitest';
import {calculateReportEffort,formatReportHours,calculateComparableChange} from '../../lib/reports/calculations';
import {reportMinuteOracle,reportMeasurementOracle} from '../fixtures/reports/oracles';
describe('independent report arithmetic',()=>{
 it('counts exact approved revisions once and computes a single closing forecast',()=>{
  const result=calculateReportEffort({fromDate:'2026-07-01',toDate:'2026-09-30',cutoffDate:'2026-10-03',actuals:[{revisionId:'a',serviceDate:'2026-06-30',minutes:'60'},{revisionId:'b',serviceDate:'2026-07-01',minutes:'90'},{revisionId:'b',serviceDate:'2026-07-01',minutes:'90'},{revisionId:'c',serviceDate:'2026-09-30',minutes:'0'}],remainingMinutes:'30',budgetMinutes:'200',comparable:true});
  expect(result).toMatchObject({periodActualMinutes:'90',cumulativeActualMinutes:'150',remainingMinutes:'30',forecastMinutes:'180',varianceMinutes:'-20'});
 });
 it('distinguishes unknown denominators and zero inputs',()=>{
  expect(calculateReportEffort({fromDate:'2026-09-01',toDate:'2026-09-30',cutoffDate:'2026-09-30',actuals:[],remainingMinutes:null,budgetMinutes:null,comparable:false})).toMatchObject({periodActualMinutes:'0',forecastMinutes:null,varianceMinutes:null});
  expect(calculateComparableChange({baseline:'0',current:'10',comparable:true})).toMatchObject({change:'10',percentage:null,reason:'zero_baseline'});
  expect(calculateComparableChange({baseline:'10',current:'20',comparable:false})).toMatchObject({change:null,percentage:null,reason:'non_comparable'});
 });
 it('uses integer half-up presentation, including negative variance',()=>{
  expect(formatReportHours('1')).toBe('0.02');expect(formatReportHours('60')).toBe('1.00');expect(formatReportHours('-1')).toBe('-0.02');
  expect(()=>formatReportHours('1.2')).toThrow();
 });
 it('matches an independent approved-history oracle through pending correction and reversal',()=>{
  const history=[{identity:'before',date:'2025-09-30',minutes:60,approved:true,reversed:false},{identity:'corrected',date:'2025-10-01',minutes:30,approved:true,reversed:false},{identity:'corrected',date:'2025-10-01',minutes:90,approved:true,reversed:false},{identity:'pending',date:'2025-12-31',minutes:120,approved:true,reversed:false},{identity:'pending',date:'2025-12-31',minutes:180,approved:false,reversed:false},{identity:'reversed',date:'2025-11-01',minutes:45,approved:true,reversed:false},{identity:'reversed',date:'2025-11-01',minutes:45,approved:true,reversed:true},{identity:'future',date:'2026-01-01',minutes:30,approved:true,reversed:false}];
  const expected=reportMinuteOracle(history,'2025-10-01','2025-12-31','2025-12-31');
  // These are the current approved ledger revisions, independently listed from the history above.
  const result=calculateReportEffort({fromDate:'2025-10-01',toDate:'2025-12-31',cutoffDate:'2025-12-31',actuals:[{revisionId:'before-rev',serviceDate:'2025-09-30',minutes:'60'},{revisionId:'corrected-rev2',serviceDate:'2025-10-01',minutes:'90'},{revisionId:'pending-approved-predecessor',serviceDate:'2025-12-31',minutes:'120'},{revisionId:'future-rev',serviceDate:'2026-01-01',minutes:'30'}],budgetMinutes:'400',remainingMinutes:'90',comparable:true});
  expect(expected).toEqual({period:210,cumulative:270});expect(result.periodActualMinutes).toBe(String(expected.period));expect(result.cumulativeActualMinutes).toBe(String(expected.cumulative));expect(result.forecastMinutes).toBe(String(expected.cumulative+90));expect(result.varianceMinutes).toBe(String(expected.cumulative+90-400));
 });
 it('matches an independent measurement oracle and does not invent missing comparisons',()=>{
  const expected=reportMeasurementOracle(80,100,true,true,true,true),actual=calculateComparableChange({baseline:'80',current:'100',comparable:true});expect(actual.change).toBe(String(expected.change));expect(Number(actual.percentage)).toBe(expected.percentage);
  expect(calculateComparableChange({baseline:null,current:'100',comparable:true})).toMatchObject({change:null,percentage:null});
  expect(reportMeasurementOracle(80,100,true,true,false,true)).toEqual({change:null,percentage:null});
 });
});

it('keeps uninitialized actuals unknown while an initialized empty ledger is a measured zero',()=>{const base={fromDate:'2026-09-01',toDate:'2026-09-30',cutoffDate:'2026-10-03',actuals:[],remainingMinutes:'60',budgetMinutes:'120',comparable:true};const unknown=calculateReportEffort({...base,actualsKnown:false});expect(unknown.periodActualMinutes).toBeNull();expect(unknown.cumulativeActualMinutes).toBeNull();expect(unknown.forecastMinutes).toBeNull();expect(unknown.missingReasons).toContain('actual_unknown');expect(calculateReportEffort({...base,actualsKnown:true}).periodActualMinutes).toBe('0');});
