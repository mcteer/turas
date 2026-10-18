import {expect,it} from 'vitest';
import {aggregatePatterns,type Measurement} from '../../lib/contracts/customer-adoption';
const quarter='2026-Q3';
const rows:Array<Measurement&{accountId:string}>=Array.from({length:10},(_,i)=>({accountId:'synthetic-'+i,quarter,metricId:'weekly_active_admin_rate_v1',baselinePercent:20,currentPercent:40,intervention:i<5?'enablement_and_handoff':'no_recorded_intervention'}));
it('collapses identical account duplicates and suppresses both groups for a conflicting duplicate',()=>{
 expect(aggregatePatterns(quarter,[...rows,rows[0]])).toMatchObject({status:'available',groups:[{accountCount:5},{accountCount:5}]});
 expect(aggregatePatterns(quarter,[...rows,{...rows[0],currentPercent:80}])).toMatchObject({status:'insufficient_evidence',groups:[]});
 expect(aggregatePatterns(quarter,rows.slice(0,9))).toMatchObject({status:'insufficient_evidence',groups:[]});
});
