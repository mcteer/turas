import {beforeEach,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
const calls=vi.hoisted(()=>({query:vi.fn(),command:vi.fn()}));
vi.mock('node:child_process',()=>{const execFile=()=>{};Object.defineProperty(execFile,Symbol.for('nodejs.util.promisify.custom'),{value:calls.command});return {execFile};});
vi.mock('../../../lib/server/db/client',()=>({query:calls.query}));
vi.mock('../../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'controlled-local'})}));
import {runLocalReconciliation} from '../../../lib/server/operations/local-reconciliation';
const row={id:randomUUID(),lease_id:randomUUID()},labels={'turas.job.owner':row.id,'turas.job.environment':createHash('sha256').update('controlled-local').digest('hex')};
beforeEach(()=>{vi.clearAllMocks();calls.query.mockResolvedValue({rowCount:1,rows:[]}).mockResolvedValueOnce({rows:[row]});});
it('stops only exact owned local compute and confirms absence before releasing capacity',async()=>{
 calls.command.mockResolvedValueOnce({stdout:JSON.stringify(labels)}).mockResolvedValueOnce({stdout:''}).mockRejectedValueOnce(Object.assign(Error('Controlled absence'),{stderr:'No such object'}));
 expect(await runLocalReconciliation({limit:20,signal:AbortSignal.timeout(1000)})).toEqual({backlog:0,truncated:false});expect(calls.command.mock.calls[1][1]).toEqual(['rm','--force','turas-job-'+row.id]);expect(calls.query.mock.calls.at(-1)?.[0]).toContain("state='cancelled'");
});
it('does not delete a container whose environment or owner differs',async()=>{
 calls.command.mockResolvedValue({stdout:JSON.stringify({...labels,'turas.job.environment':'foreign'})});await expect(runLocalReconciliation({limit:20,signal:AbortSignal.timeout(1000)})).rejects.toThrow('ownership differs');expect(calls.command).toHaveBeenCalledOnce();expect(calls.query.mock.calls.some(([sql])=>sql.includes("state='cancelled'"))).toBe(false);
});
it('retains the capacity hold after unverified deletion',async()=>{
 calls.command.mockResolvedValueOnce({stdout:JSON.stringify(labels)}).mockRejectedValueOnce(Error('Controlled engine failure'));await expect(runLocalReconciliation({limit:20,signal:AbortSignal.timeout(1000)})).rejects.toThrow();expect(calls.query.mock.calls.some(([sql])=>sql.includes("state='cancelled'"))).toBe(false);
});
it('does no local engine IO when the durable reconciliation fence is lost',async()=>{
 calls.query.mockReset();calls.query.mockResolvedValueOnce({rows:[row]}).mockResolvedValueOnce({rowCount:0}).mockResolvedValueOnce({rowCount:0});await runLocalReconciliation({limit:20,signal:AbortSignal.timeout(1000)});expect(calls.command).not.toHaveBeenCalled();
});
