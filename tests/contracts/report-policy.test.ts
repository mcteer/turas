import {describe,it,expect} from 'vitest';
import {requireReportCapability,reportSourceAudience} from '../../lib/server/reports/policy';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
describe('report actor and audience boundary',()=>{
 const reviewer={kind:'internal',role:'admin',principalId:DEMO_IDS.mcteer} as any;
 const panel={kind:'internal',role:'member',principalId:DEMO_IDS.panel} as any;
 const partner={kind:'partner',role:'member',principalId:DEMO_IDS.partner} as any;
 it('restricts every approval and delivery address to canonical mcteer',()=>{
  for(const capability of ['publish','brand','policy','send','reconcile','addresses'] as const){
   expect(()=>requireReportCapability(reviewer,capability,'delivery',true)).not.toThrow();
   expect(()=>requireReportCapability(panel,capability,'delivery',true)).toThrow();
   expect(()=>requireReportCapability(partner,capability,'delivery',true)).toThrow();
  }
 });
 it('restricts partners to published delivery reads',()=>{
  expect(()=>requireReportCapability(partner,'read','delivery',true)).not.toThrow();
  expect(()=>requireReportCapability(partner,'read','delivery',false)).toThrow();
  expect(()=>requireReportCapability(partner,'read','leadership',true)).toThrow();
  expect(()=>requireReportCapability(partner,'prepare','delivery',true)).toThrow();
 });
 it('selects source audience before retrieval',()=>{
  expect(reportSourceAudience('delivery')).toEqual(['delivery']);
  expect(reportSourceAudience('leadership')).toEqual(['delivery','internal']);
  expect(reportSourceAudience('account_team')).toEqual(['delivery','internal']);
 });
});
