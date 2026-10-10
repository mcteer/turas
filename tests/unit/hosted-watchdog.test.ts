import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), claim: vi.fn(), finish: vi.fn(), maintain: vi.fn(),learning:vi.fn() }));
vi.mock("../../lib/server/conversations/watchdog", () => ({ heartbeatWorker: mocks.heartbeat,
  claimDueJobs: mocks.claim, finishDueJob: mocks.finish }));
vi.mock("../../lib/server/conversations/maintenance", () => ({ performMaintenance: mocks.maintain }));
vi.mock("../../lib/server/learning/maintenance",()=>({runLearningMaintenanceTick:mocks.learning}));
vi.mock("../../lib/server/config", () => ({ getServerConfig: () => ({ TURAS_ENVIRONMENT_ID: "synthetic-production" }) }));
import { authorizeHostedWatchdog, runHostedWatchdog } from "../../lib/server/conversations/hosted-watchdog";
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
    mocks.learning.mockResolvedValue({processed:0,durationMs:0});
    mocks.claim.mockResolvedValue([]).mockResolvedValueOnce([{ attemptId: "synthetic-attempt" }]);
    mocks.maintain.mockRejectedValueOnce(new Error("synthetic native failure"));
    const running = runHostedWatchdog((() => { throw new Error("unused"); }) as Parameters<typeof runHostedWatchdog>[0]);
    await vi.advanceTimersByTimeAsync(65_000);
    await running;
    expect(mocks.learning).toHaveBeenCalledTimes(3);
    expect(mocks.learning.mock.calls.every(args=>typeof args[0].attachSession==='function')).toBe(true);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(13);
    expect(mocks.claim).toHaveBeenCalledTimes(13);
    expect(mocks.claim.mock.calls.every(args => args[1] === 1)).toBe(true);
    expect(mocks.finish).toHaveBeenCalledWith(expect.any(String), "synthetic-attempt", "retry", "maintenance_call_failed");
  });
  it("never announces readiness when database claiming fails", async () => {
    mocks.claim.mockRejectedValueOnce(new Error("synthetic database failure"));
    await expect(runHostedWatchdog((() => { throw new Error("unused"); }) as Parameters<typeof runHostedWatchdog>[0])).rejects.toThrow();
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
});
