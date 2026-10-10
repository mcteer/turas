import { afterEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ workforce: vi.fn(async () => undefined), cleanup: vi.fn(async () => undefined),
  heartbeat: vi.fn(async () => undefined), expiry: vi.fn(async () => 0), advisory: vi.fn(async () => 0),
  execution: vi.fn(async () => 0), executionCleanup: vi.fn(async () => 0), retirement: vi.fn(async () => undefined),
  conversation: vi.fn(() => new Promise<void>(() => undefined)), supportCleanup: vi.fn(async () => 0),
  supportExpiry: vi.fn(async () => 0), supportAudit: vi.fn(async () => 0), supportAdvice: vi.fn(async () => 0),
  supportAdviceCleanup: vi.fn(async () => 0), supportRetirement: vi.fn(async () => undefined), partnerMaintenance: vi.fn(async () => ({skipped:true})), learningMaintenance: vi.fn(async () => ({processed:0})), mcpMaintenance: vi.fn(async () => ({processed:0})) }));
vi.mock("../../lib/server/db/client", () => ({ closeRuntimePool: vi.fn(async () => undefined), withTransaction: vi.fn(async (run: (db: object) => unknown) => run({ query: vi.fn(async () => ({ rows: [{ schema_version: 43 }] })) })) }));
vi.mock("../../lib/server/config", () => ({ getServerConfig: () => ({ TURAS_ENVIRONMENT_ID: "staffing-synthetic-scheduler" }) }));
vi.mock("../../lib/server/conversations/watchdog", () => ({ heartbeatWorker: calls.conversation, claimDueJobs: vi.fn(), finishDueJob: vi.fn(), signMaintenanceRequest: vi.fn() }));
vi.mock("../../scripts/retrieval-worker", () => ({ runRetrievalWorkerTick: vi.fn(async () => undefined) }));
vi.mock("../../lib/server/retrieval/cleanup", () => ({ runRetrievalCleanupTick: vi.fn(async () => undefined) }));
vi.mock("../../lib/server/knowledge/suspension", () => ({ suspendStaleKnowledge: vi.fn(async () => undefined) }));
vi.mock("../../lib/server/research/refresh", () => ({ markDueResearch: vi.fn(async () => undefined) }));
vi.mock("../../lib/server/plans/cleanup", () => ({ runPlanCleanupTick: vi.fn(async () => undefined) }));
vi.mock("../../lib/server/staffing/runner", () => ({ runWorkforceWorkerTick: calls.workforce }));
vi.mock("../../lib/server/staffing/cleanup", () => ({ runWorkforceCleanupTick: calls.cleanup }));
vi.mock("../../lib/server/staffing/worker-readiness", () => ({ heartbeatWorkforceWorker: calls.heartbeat }));
vi.mock("../../lib/server/staffing/repository", () => ({ requireStaffingEnvironment: vi.fn(async () => undefined) }));
vi.mock("../../lib/server/staffing/reservations", () => ({ expireStaffingReservations: calls.expiry }));
vi.mock("../../lib/server/staffing/advisory-maintenance", () => ({ settleDueStaffingAdvisories: calls.advisory }));
vi.mock("../../lib/server/execution/maintenance", () => ({ settleDueExecutionAdvisories: calls.execution, runExecutionCleanupTick: calls.executionCleanup }));
vi.mock("../../lib/server/execution/native-retirement", () => ({ processExecutionNativeRetirement: calls.retirement }));
vi.mock("../../lib/server/support/maintenance", () => ({ runSupportCleanupTick: calls.supportCleanup,
  expireSupportReceipts: calls.supportExpiry, minimizeSupportAudit: calls.supportAudit,
  settleDueSupportAdvice: calls.supportAdvice, runSupportAdviceCleanupTick: calls.supportAdviceCleanup }));
vi.mock("../../lib/server/support/native-retirement", () => ({ processSupportNativeRetirement: calls.supportRetirement }));

vi.mock("../../lib/server/partners/maintenance", () => ({runPartnerMaintenanceTick:calls.partnerMaintenance}));

vi.mock("../../lib/server/learning/maintenance", () => ({runLearningMaintenanceTick:calls.learningMaintenance}));

vi.mock("../../lib/server/mcp/retention", () => ({runMcpMaintenanceTick:calls.mcpMaintenance}));

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
it("a stalled conversation watchdog blocks neither workforce, execution nor partner/learning maintenance and does not multiply timers", async () => {
  vi.useFakeTimers(); vi.stubEnv("TURAS_EVE_INTERNAL_ORIGIN", "http://127.0.0.1:19007");
  vi.stubEnv("TURAS_WORKFORCE_STORE_ROOT", "/tmp/staffing-synthetic-scheduler");
  const signals = ["SIGINT", "SIGTERM"] as const;
  const existing = new Map(signals.map(signal => [signal, process.listeners(signal)]));
  try {
    await import("../../scripts/maintenance-worker");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(calls.conversation).toHaveBeenCalledTimes(1);
    expect(calls.workforce).toHaveBeenCalledTimes(7);
    expect(calls.cleanup).toHaveBeenCalledTimes(3);
    expect(calls.heartbeat).toHaveBeenCalledTimes(3);
    expect(calls.expiry).toHaveBeenCalledTimes(3);
    expect(calls.advisory).toHaveBeenCalledTimes(3);
    expect(calls.execution).toHaveBeenCalledTimes(3);
    expect(calls.executionCleanup).toHaveBeenCalledTimes(3);
    expect(calls.retirement).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(11);
    expect(calls.supportCleanup).not.toHaveBeenCalled();
    expect(calls.partnerMaintenance).toHaveBeenCalledTimes(1);
    expect(calls.learningMaintenance).toHaveBeenCalledTimes(1);
    expect(calls.mcpMaintenance).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    for (const call of [calls.supportCleanup, calls.supportExpiry, calls.supportAudit,
      calls.supportAdvice, calls.supportAdviceCleanup, calls.supportRetirement]) expect(call).toHaveBeenCalledTimes(1);
    expect(calls.conversation).toHaveBeenCalledTimes(1);
    expect(calls.workforce).toHaveBeenCalledTimes(15);
    expect(calls.execution).toHaveBeenCalledTimes(6);
    expect(calls.partnerMaintenance).toHaveBeenCalledTimes(2);
    expect(calls.learningMaintenance).toHaveBeenCalledTimes(2);
    expect(calls.mcpMaintenance).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(11);
  } finally {
    for (const signal of signals) for (const listener of process.listeners(signal)) {
      if (!existing.get(signal)!.includes(listener)) process.removeListener(signal, listener);
    }
  }
});
