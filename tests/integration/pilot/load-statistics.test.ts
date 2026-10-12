import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {prepareLoadStatistics,loadQueryCounter,queryCounterDelta} from '../../../scripts/pilot-load-statistics';
it('counts actual successful runtime queries without exposing SQL and rejects reset or eviction',async()=>{
 const owner=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Pool({connectionString:requireOwnedPilotDatabase()}),db=await owner.connect();
 try{await prepareLoadStatistics(db);const before=await loadQueryCounter(db);await runtime.query('SELECT 1');await runtime.query('SELECT 2');const after=await loadQueryCounter(db);expect(queryCounterDelta(before,after)).toBe(2);expect(Object.keys(after).sort()).toEqual(['calls','dealloc','reset']);expect(()=>queryCounterDelta(before,{...after,dealloc:String(Number(before.dealloc)+1)})).toThrow('eviction');expect(()=>queryCounterDelta(before,{...after,reset:new Date(0).toISOString()})).toThrow('reset');expect((await db.query("SELECT has_schema_privilege('turas_runtime','pilot_observability','USAGE') allowed")).rows[0].allowed).toBe(false);
 }finally{db.release();await runtime.end();await owner.end();}
});
