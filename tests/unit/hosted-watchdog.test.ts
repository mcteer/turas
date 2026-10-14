import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), claim: vi.fn(), finish: vi.fn(), maintain: vi.fn(),learning:vi.fn(),mcp:vi.fn(),retrieval:vi.fn(),cleanup:vi.fn(),researchDue:vi.fn() }));
vi.mock("../../lib/server/conversations/watchdog", () => ({ heartbeatWorker: mocks.heartbeat,
  claimDueJobs: mocks.claim, finishDueJob: mocks.finish }));
vi.mock("../../lib/server/conversations/maintenance", () => ({ performMaintenance: mocks.maintain }));
vi.mock("../../lib/server/learning/maintenance",()=>({runLearningMaintenanceTick:mocks.learning}));
vi.mock("../../lib/server/config", () => ({ getServerConfig: () => ({ TURAS_ENVIRONMENT_ID: "synthetic-production" }) }));
vi.mock("../../lib/server/mcp/retention",()=>({runMcpMaintenanceTick:mocks.mcp}));
vi.mock("../../scripts/retrieval-worker",()=>({runRetrievalWorkerTick:mocks.retrieval}));
vi.mock("../../lib/server/retrieval/cleanup",()=>({runRetrievalCleanupTick:mocks.cleanup}));
vi.mock("../../lib/server/research/refresh",()=>({markDueResearch:mocks.researchDue}));
import { authorizeHostedWatchdog, runHostedWatchdog, startPreviewChatWorker } from "../../lib/server/conversations/hosted-watchdog";
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

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

describe("bounded hosted watchdog", () => {
  it("refreshes every five seconds for 65 seconds and records cancellation retries", async () => {
    vi.useFakeTimers();
    mocks.learning.mockResolvedValue({processed:0,durationMs:0});mocks.mcp.mockResolvedValue({processed:0});
    mocks.claim.mockResolvedValue([]).mockResolvedValueOnce([{ attemptId: "synthetic-attempt" }]);
    mocks.maintain.mockRejectedValueOnce(new Error("synthetic native failure"));
    const running = runHostedWatchdog((() => { throw new Error("unused"); }) as Parameters<typeof runHostedWatchdog>[0]);
    await vi.advanceTimersByTimeAsync(65_000);
    await running;
    expect(mocks.retrieval).toHaveBeenCalledTimes(13);expect(mocks.cleanup).toHaveBeenCalledTimes(13);expect(mocks.researchDue).toHaveBeenCalledTimes(13);
    expect(mocks.learning).toHaveBeenCalledTimes(3);expect(mocks.mcp).toHaveBeenCalledTimes(3);
    expect(mocks.learning.mock.calls.every(args=>typeof args[0].attachSession==='function')).toBe(true);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(13);
    expect(mocks.claim).toHaveBeenCalledTimes(13);
    expect(mocks.claim.mock.calls.every(args => args[1] === 1)).toBe(true);
    expect(mocks.finish).toHaveBeenCalledWith(expect.any(String), "synthetic-attempt", "retry", "maintenance_call_failed");
  });
  it("never announces readiness when database claiming fails", async () => {
    mocks.mcp.mockResolvedValue({processed:0});mocks.claim.mockRejectedValueOnce(new Error("synthetic database failure"));
    await expect(runHostedWatchdog((() => { throw new Error("unused"); }) as Parameters<typeof runHostedWatchdog>[0])).rejects.toThrow();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("runs MCP cleanup independently without overlapping ticks and drains it on exit", async()=>{
    vi.useFakeTimers();let releaseClaim!:()=>void,releaseCleanup!:()=>void;
    mocks.claim.mockReturnValue(new Promise(resolve=>{releaseClaim=()=>resolve([]);}));
    mocks.mcp.mockReturnValueOnce(new Promise(resolve=>{releaseCleanup=()=>resolve({processed:0});})).mockResolvedValue({processed:0});
    mocks.learning.mockResolvedValue({processed:0,durationMs:0});
    const running=runHostedWatchdog((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0]);
    await vi.advanceTimersByTimeAsync(30000);expect(mocks.mcp).toHaveBeenCalledTimes(1);expect(mocks.heartbeat).not.toHaveBeenCalled();
    releaseCleanup();await vi.advanceTimersByTimeAsync(30000);expect(mocks.mcp).toHaveBeenCalledTimes(2);expect(mocks.heartbeat).not.toHaveBeenCalled();
    releaseClaim();await vi.advanceTimersByTimeAsync(5000);await running;expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps retrieval ticks independent, prevents overlap and drains a pending index job",async()=>{
    vi.useFakeTimers();let finishIndex!:()=>void;
    mocks.claim.mockResolvedValue([]);mocks.learning.mockResolvedValue({processed:0,durationMs:0});mocks.mcp.mockResolvedValue({processed:0});
    mocks.retrieval.mockReturnValueOnce(new Promise<void>(resolve=>{finishIndex=resolve;}));
    const running=runHostedWatchdog((()=>{throw Error('unused');}) as Parameters<typeof runHostedWatchdog>[0]);
    await vi.advanceTimersByTimeAsync(65000);
    expect(mocks.retrieval).toHaveBeenCalledTimes(1);expect(mocks.heartbeat).toHaveBeenCalledTimes(13);expect(mocks.cleanup).not.toHaveBeenCalled();
    finishIndex();await running;
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);expect(mocks.researchDue).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });

});

describe("Preview chat worker", () => {
  beforeEach(() => { mocks.mcp.mockResolvedValue({processed:0});mocks.retrieval.mockResolvedValue(undefined);mocks.cleanup.mockResolvedValue(undefined);mocks.researchDue.mockResolvedValue(undefined); });
  afterEach(() => vi.unstubAllEnvs());
  it("does not start a request worker in Production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");const wait=vi.fn();
    await startPreviewChatWorker(vi.fn() as never,wait);
    expect(wait).not.toHaveBeenCalled();expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it("waits for a real heartbeat and continues past the response deadline", async () => {
    vi.useFakeTimers();vi.stubEnv("VERCEL_ENV", "preview");mocks.claim.mockResolvedValue([]);mocks.learning.mockResolvedValue({processed:0,durationMs:0});
    const wait=vi.fn();await startPreviewChatWorker(vi.fn() as never,wait);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1);expect(wait).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(180000);await wait.mock.calls[0][0];
    expect(mocks.heartbeat).toHaveBeenCalledTimes(36);expect(vi.getTimerCount()).toBe(0);
  });
  it("denies admission when actual worker startup fails", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");mocks.claim.mockRejectedValue(new Error("database unavailable"));
    await expect(startPreviewChatWorker(vi.fn() as never,vi.fn())).rejects.toThrow("database unavailable");
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});
