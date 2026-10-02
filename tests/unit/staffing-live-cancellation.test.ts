import { afterEach, describe, expect, it, vi } from "vitest";
import { staffingLiveCancellationOutcome } from "../../scripts/staffing-live-cancellation";
import { reconcileStaffingLive } from "../../scripts/staffing-live-runtime";
import { signMaintenanceRequest } from "../../lib/server/conversations/watchdog";
import { ownedEvalTimeout } from "../../scripts/eval-deadline";
import { assertStaffingLiveWrites, type StaffingLiveWriteReceipt } from "../../scripts/staffing-live-writes";

const owned = vi.hoisted(() => vi.fn());
vi.mock("../../scripts/staffing-eval-environment", () => ({ requireOwnedStaffingClone: owned }));
vi.mock("../../lib/server/config", () => ({ getServerConfig: () => ({ TURAS_ENVIRONMENT_ID: "test-synthetic-007",
  TURAS_MAINTENANCE_SECRET: "synthetic-unit-only-not-a-real-secret" }) }));
afterEach(() => { vi.unstubAllGlobals(); owned.mockReset(); });

/** Synthetic metadata tests classification rules; these do not prove native
 * cancellation, a real reconciliation or a successful live evaluation. */
describe("live cancellation evidence classification", () => {
  const stopped = { adviceState: "cancelled", responseState: "stopping", reconciliation: "retry",
    nativeTerminalCount: 0, paidReceiptsUnchanged: true };
  it("preserves uncertain native completion after a durable stop and real unresolved reconciliation", () => {
    expect(staffingLiveCancellationOutcome(stopped)).toEqual({ state: "unconfirmed", terminalSource: "durable-reconciliation" });
  });
  it("requires a terminal projection and settled reconciliation to confirm native cancellation", () => {
    for (const responseState of ["cancelled", "failed", "completed"]) {
      expect(staffingLiveCancellationOutcome({ ...stopped, responseState, reconciliation: "settled", nativeTerminalCount: 1 }))
        .toEqual({ state: "cancelled", terminalSource: "native-projection" });
    }
  });
  it("rejects missing stops, newly admitted paid steps and inconsistent metadata instead of manufacturing completion", () => {
    for (const patch of [{ adviceState: "running" }, { adviceState: "unconfirmed" }, { paidReceiptsUnchanged: false },
      { responseState: "cancelled" }, { reconciliation: "settled" }, { reconciliation: "cancel_requested" },
      { nativeTerminalCount: 1 }, { nativeTerminalCount: -1 }, { nativeTerminalCount: NaN }, { nativeTerminalCount: 0.5 }]) {
      expect(() => staffingLiveCancellationOutcome({ ...stopped, ...patch })).toThrow();
    }
  });
});

describe("owned live metadata reconciliation transport", () => {
  const attemptId = "11111111-1111-4111-8111-111111111111";
  it("signs exactly one metadata-only request to the latest owned native supervisor without a cookie or resend", async () => {
    const transport = vi.fn(async () => Response.json({ data: { status: "retry" } }));
    vi.stubGlobal("fetch", transport);
    expect(await reconcileStaffingLive("server listening at http://127.0.0.1:19006/\nserver listening at http://127.0.0.1:19007/", attemptId, Date.now() + 1000)).toBe("retry");
    expect(transport).toHaveBeenCalledTimes(1); expect(owned).toHaveBeenCalled();
    const [url, request] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:19007/internal/turas/maintenance");
    expect(request.redirect).toBe("error"); expect(request.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(request.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(JSON.parse(String(request.body))).toEqual({ action: "reconcile", attemptId, environmentId: "test-synthetic-007" });
    expect(headers.get("x-turas-signature")).toBe(signMaintenanceRequest("POST", "/internal/turas/maintenance",
      headers.get("x-turas-timestamp")!, headers.get("x-turas-nonce")!, String(request.body)));
  });
  it("fails before transport for missing owned identity, external startup URLs and elapsed original deadlines", async () => {
    const transport = vi.fn(); vi.stubGlobal("fetch", transport);
    owned.mockImplementationOnce(() => { throw new Error("Owned clone required"); });
    await expect(reconcileStaffingLive("server listening at http://127.0.0.1:19007/", attemptId, Date.now() + 1000)).rejects.toThrow();
    await expect(reconcileStaffingLive("server listening at https://external.invalid/", attemptId, Date.now() + 1000)).rejects.toThrow();
    await expect(reconcileStaffingLive("server listening at http://127.0.0.1:19007/", attemptId, Date.now() - 1)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not turn denied or malformed reconciliation into an uncertain passing record", async () => {
    for (const response of [new Response("PRIVATE_SYNTHETIC_ERROR", { status: 403 }), Response.json({ data: { status: "cancel_requested" } }),
      Response.json({ data: { status: "unknown" } })]) {
      const transport = vi.fn(async () => response); vi.stubGlobal("fetch", transport);
      await expect(reconcileStaffingLive("server listening at http://127.0.0.1:19007/", attemptId, Date.now() + 1000)).rejects.toThrow(/unavailable|invalid result/);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
});

describe("original owned evaluation deadline", () => {
  it("caps setup and restart timeouts at the original remaining allowance", () => {
    expect(ownedEvalTimeout(1200, 600_000, 1000)).toBe(200);
    expect(ownedEvalTimeout(1200, 600_000, 1199)).toBe(1);
    expect(ownedEvalTimeout(900_000, 120_000, 1000)).toBe(120_000);
    expect(ownedEvalTimeout(undefined, 90_000, 1000)).toBe(90_000);
    for (const now of [1200, 1201]) expect(() => ownedEvalTimeout(1200, 600_000, now)).toThrow("Original");
  });
  it("refuses invalid deadlines instead of disabling the timeout or granting a fresh budget", () => {
    for (const deadline of [NaN, Infinity, 1000.5]) expect(() => ownedEvalTimeout(deadline, 1000, 0)).toThrow();
    for (const maximum of [0, -1, Infinity, 1000.5]) expect(() => ownedEvalTimeout(undefined, maximum, 0)).toThrow();
  });
});

describe("live governed staffing write evidence", () => {
  const prior: StaffingLiveWriteReceipt = { id: "old", receipt_table: "workforce_command_receipts", action: "resource_create",
    actor_membership_id: "manager", request_key: "original-request", digest: "original-digest" };
  const human: StaffingLiveWriteReceipt = { id: "new", receipt_table: "staffing_command_receipts", action: "finance_input_revise",
    actor_membership_id: "manager", request_key: "exact-human-request", digest: "new-digest" };
  const allowed = { receipt_table: human.receipt_table, action: human.action, actor_membership_id: human.actor_membership_id, request_key: human.request_key };
  it("permits no staffing writes or the exact explicit human input change while preserving prior receipts", () => {
    expect(() => assertStaffingLiveWrites([prior], [prior], [])).not.toThrow();
    expect(() => assertStaffingLiveWrites([prior], [human, prior], [allowed])).not.toThrow();
  });
  it("rejects hidden non-allocation writes, receipt changes/removal, wrong human identities and duplicate allowances", () => {
    for (const [before, after, expected] of [
      [[prior], [prior, human], []], [[prior], [], []], [[prior], [{ ...prior, digest: "changed" }], []],
      [[prior, prior], [prior], []], [[prior], [prior, prior], []],
      [[prior], [prior, { ...human, actor_membership_id: "panel" }], [allowed]],
      [[prior], [prior, { ...human, request_key: "different-request" }], [allowed]],
      [[prior], [prior, { ...human, action: "calendar_approve" }], [allowed]],
      [[prior], [prior, human, { ...human, id: "hidden", action: "resource_revise" }], [allowed, allowed]],
    ] as const) expect(() => assertStaffingLiveWrites(before, after, expected)).toThrow();
  });
});
