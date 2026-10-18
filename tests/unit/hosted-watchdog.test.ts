import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({heartbeat:vi.fn(),claim:vi.fn(),finish:vi.fn(),maintain:vi.fn(),learning:vi.fn(),mcp:vi.fn(),retrieval:vi.fn()}));
vi.mock('../../scripts/retrieval-worker',()=>({runRetrievalWorkerTick:mocks.retrieval}));
vi.mock('../../lib/server/db/client',()=>({getOperationalFencePool:()=>({connect:async()=>({query:async()=>({rows:[{released:true}],rowCount:1}),release:vi.fn()})}),query:vi.fn(async()=>({rowCount:1,rows:[{generation:1}]}))}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'synthetic-production'})}));
vi.mock('../../lib/server/operations/code-version',()=>({operationalCodeVersion:()=> 'a'.repeat(40)}));
vi.mock('../../lib/server/operations/hosted-reconciliation',()=>({runHostedReconciliation:async()=>({backlog:0,truncated:false})}));
vi.mock('../../lib/server/operations/maintenance-bindings',async()=>{const {maintenanceClasses}=await import('../../lib/server/operations/maintenance');return {createMaintenanceBindings:({attachSession}: {attachSession:unknown})=>maintenanceClasses.map(row=>({id:row.id,enabled:true,optional:false,tick:async()=>{if(row.id==='conversation'){const jobs=await mocks.claim('controlled-worker',1);for(const job of jobs){try{await mocks.maintain(job,attachSession);}catch{await mocks.finish('controlled-worker',job.attemptId,'retry','maintenance_call_failed');}}await mocks.heartbeat();}if(row.id==='learning')await mocks.learning({attachSession});if(row.id==='mcp')await mocks.mcp();return {backlog:0,truncated:false};}}))};});
import { authorizeHostedWatchdog, runHostedWatchdog, startPreviewChatWorker } from "../../lib/server/conversations/hosted-watchdog";
beforeEach(()=>{mocks.retrieval.mockResolvedValue(undefined);});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("hosted watchdog authentication", () => {
  const secret = "synthetic-watchdog-secret-not-real-12345";
  const request = (headers: HeadersInit = {}, method = "GET") =>
    new Request("https://synthetic.invalid/eve/v1/turas/watchdog", { method, headers });
  it("accepts only the configured cron bearer", () => {
    expect(() => authorizeHostedWatchdog(request({ authorization: `Bearer ${secret}` }), secret)).not.toThrow();
    for (const authorization of ["", "Bearer wrong", `Bearer ${secret}x`])
      expect(() => authorizeHostedWatchdog(request({ authorization }), secret)).toThrow();
  });
  it("fails closed without a secret and refuses browser cookies or writes", () => {
    expect(() => authorizeHostedWatchdog(request(), "")).toThrow();
    for (const cookie of ["turas_session=synthetic", "__Host-turas_session=synthetic", "platform=synthetic; turas_session=synthetic"])
      expect(() => authorizeHostedWatchdog(request({ authorization: `Bearer ${secret}`, cookie }), secret)).toThrow();
    expect(() => authorizeHostedWatchdog(request({ authorization: `Bearer ${secret}` }, "POST"), secret)).toThrow();
  });
  it("allows platform cookies only with the exact independent cron bearer", () => {
    expect(() => authorizeHostedWatchdog(request({ authorization: `Bearer ${secret}`, cookie: "synthetic_platform=1" }), secret)).not.toThrow();
    expect(() => authorizeHostedWatchdog(request({ cookie: "synthetic_platform=1" }), secret)).toThrow();
    expect(() => authorizeHostedWatchdog(request({ authorization: "Bearer wrong", cookie: "synthetic_platform=1" }), secret)).toThrow();
  });
});

describe('bounded hosted watchdog',()=>{
 it('admits a Preview send only after a real conversation tick and keeps its original worker lifetime',async()=>{
  vi.useFakeTimers();vi.stubEnv('VERCEL_ENV','preview');
  let release!:()=>void;mocks.claim.mockReturnValueOnce(new Promise(resolve=>{release=()=>resolve([]);})).mockResolvedValue([]);
  let retained!:Promise<unknown>,admitted=false;
  const admission=startPreviewChatWorker((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0],task=>{retained=task;}).then(()=>{admitted=true;});
  await vi.advanceTimersByTimeAsync(1);expect(admitted).toBe(false);expect(mocks.heartbeat).not.toHaveBeenCalled();
  release();await vi.advanceTimersByTimeAsync(1);await admission;expect(mocks.heartbeat).toHaveBeenCalled();expect(admitted).toBe(true);
  await vi.advanceTimersByTimeAsync(179998);await retained;expect(mocks.retrieval).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('refuses Preview admission when the conversation worker fails while independent cleanup continues',async()=>{
  vi.useFakeTimers();vi.stubEnv('VERCEL_ENV','preview');mocks.claim.mockRejectedValue(Error('Controlled claim failure'));
  let retained!:Promise<unknown>;
  const admission=startPreviewChatWorker((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0],task=>{retained=task;});
  const refused=expect(admission).rejects.toThrow('Conversation worker unavailable');
  await vi.advanceTimersByTimeAsync(1);await refused;expect(mocks.heartbeat).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(179999);await retained;expect(mocks.mcp).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
 });
 it('refreshes independently for 65 seconds and records cancellation retries',async()=>{
  vi.useFakeTimers();mocks.learning.mockResolvedValue({processed:0});mocks.mcp.mockResolvedValue({processed:0});mocks.claim.mockResolvedValue([]).mockResolvedValueOnce([{attemptId:'synthetic-attempt'}]);mocks.maintain.mockRejectedValueOnce(Error('Controlled native failure'));
  const running=runHostedWatchdog((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0]);await vi.advanceTimersByTimeAsync(65000);await running;
  expect(mocks.learning).toHaveBeenCalledTimes(3);expect(mocks.mcp).toHaveBeenCalledTimes(3);expect(mocks.claim.mock.calls.every(args=>args[1]===1)).toBe(true);expect(mocks.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(13);expect(mocks.finish).toHaveBeenCalledWith(expect.any(String),'synthetic-attempt','retry','maintenance_call_failed');expect(vi.getTimerCount()).toBe(0);
 });
 it('does not announce conversation readiness when claiming fails while other cleanup continues',async()=>{
  vi.useFakeTimers();mocks.claim.mockRejectedValue(Error('Controlled database failure'));mocks.mcp.mockResolvedValue({processed:0});mocks.learning.mockResolvedValue({processed:0});
  const running=runHostedWatchdog((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0]);await vi.advanceTimersByTimeAsync(65000);await running;expect(mocks.heartbeat).not.toHaveBeenCalled();expect(mocks.mcp).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
 });
 it('runs MCP cleanup independently without overlapping ticks and drains it on exit',async()=>{
  vi.useFakeTimers();let releaseClaim!:()=>void,releaseCleanup!:()=>void;mocks.claim.mockReturnValue(new Promise(resolve=>{releaseClaim=()=>resolve([]);}));mocks.mcp.mockReturnValueOnce(new Promise(resolve=>{releaseCleanup=()=>resolve({processed:0});})).mockResolvedValue({processed:0});mocks.learning.mockResolvedValue({processed:0});
  const running=runHostedWatchdog((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0]);await vi.advanceTimersByTimeAsync(30000);expect(mocks.mcp).toHaveBeenCalledTimes(1);expect(mocks.heartbeat).not.toHaveBeenCalled();releaseCleanup();await vi.advanceTimersByTimeAsync(30000);expect(mocks.mcp).toHaveBeenCalledTimes(2);expect(mocks.heartbeat).not.toHaveBeenCalled();releaseClaim();await vi.advanceTimersByTimeAsync(5000);await running;expect(vi.getTimerCount()).toBe(0);
 });
});
