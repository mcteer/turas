import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("../../../lib/server/db/client",()=>({query:mocks.query}));
vi.mock("../../../lib/server/operations/admission",()=>({withOperationalIo:async(run:()=>Promise<unknown>)=>run()}));
import { runMaintenanceClass, validateMaintenanceBindings, startMaintenanceScheduler, maintenanceClasses } from "../../../lib/server/operations/maintenance";
beforeEach(()=>mocks.query.mockReset());
const binding={id:"conversation",enabled:true,optional:false,tick:async()=>({backlog:0,truncated:false})};
it("keeps missing required classes unconfigured",()=>{const classes=validateMaintenanceBindings([binding]);expect(classes.filter(c=>!c.configured)).toHaveLength(14);});
it("rejects duplicate or optional required bindings",()=>{expect(()=>validateMaintenanceBindings([binding,binding])).toThrow();expect(()=>validateMaintenanceBindings([{...binding,optional:true}])).toThrow();});
it("records success only after the tick returns",async()=>{let complete!:()=>void;const held=new Promise<void>(resolve=>{complete=resolve;});mocks.query.mockResolvedValue({rowCount:1,rows:[{generation:1}]});const running=runMaintenanceClass("test-pilot","a".repeat(40),{...binding,tick:async({limit})=>{expect(limit).toBe(1);await held;return {backlog:1001,truncated:false,oldestDueAt:new Date(Date.now()-1000)};}});await vi.waitFor(()=>expect(mocks.query).toHaveBeenCalledTimes(2));expect(mocks.query.mock.calls.some(call=>String(call[0]).includes("last_success_at=clock_timestamp()"))).toBe(false);complete();expect(await running).toEqual({state:"pass"});expect(mocks.query.mock.calls[2][1].slice(3,5)).toEqual([1000,true]);});
it("records bounded failure without a success heartbeat",async()=>{mocks.query.mockResolvedValue({rowCount:1,rows:[{generation:1}]});expect(await runMaintenanceClass("test-pilot","a".repeat(40),{...binding,tick:async()=>{throw new Error("private customer payload");}})).toEqual({state:"fail"});expect(mocks.query.mock.calls[2][1]).toContain("unavailable");expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("private customer payload");expect(mocks.query.mock.calls[2][0]).not.toContain("last_success_at=");});
it("does not claim a pass after losing the lease",async()=>{mocks.query.mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rowCount:1,rows:[{generation:1}]}).mockResolvedValueOnce({rowCount:0});expect(await runMaintenanceClass("test-pilot","a".repeat(40),binding)).toEqual({state:"lost_lease"});});
it('refuses to schedule a missing or disabled required class',()=>{expect(()=>startMaintenanceScheduler('test-pilot','a'.repeat(40),[binding])).toThrow('All required');const bindings=maintenanceClasses.map(row=>({...binding,id:row.id}));expect(()=>startMaintenanceScheduler('test-pilot','a'.repeat(40),bindings.map((row,index)=>({...row,enabled:index!==0})))).toThrow('All required');});
it('keeps stalled and failed classes independent without overlapping their own ticks',async()=>{
 vi.useFakeTimers();mocks.query.mockResolvedValue({rowCount:1,rows:[{generation:1}]});
 let finish!:()=>void;const stalled=new Promise<void>(resolve=>{finish=resolve;});const counts=new Map<string,number>();
 const bindings=maintenanceClasses.map(row=>({...binding,id:row.id,tick:async()=>{counts.set(row.id,(counts.get(row.id)??0)+1);if(row.id==='artifacts')await stalled;if(row.id==='mcp')throw Error('Controlled outage');return {backlog:0,truncated:false};}}));
 const scheduler=startMaintenanceScheduler('test-pilot','a'.repeat(40),bindings);
 try{await vi.advanceTimersByTimeAsync(31000);expect(counts.get('artifacts')).toBe(1);expect(counts.get('conversation')).toBeGreaterThan(1);expect(counts.get('mcp')).toBe(2);expect(counts.get('learning')).toBe(2);}
 finally{finish();await scheduler.stop();vi.useRealTimers();}
});
