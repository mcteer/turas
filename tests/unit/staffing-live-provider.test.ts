import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { wrapLanguageModel } from "ai";
import { observeStaffingLiveProvider } from "../fixtures/staffing/live-provider";
const mocks = vi.hoisted(() => ({ query: vi.fn(), fence: vi.fn() }));
vi.mock("../../lib/server/db/client", () => ({ query: mocks.query }));
vi.mock("../../lib/server/staffing/native-admission", () => ({ assertGovernedStaffingProviderRelease: mocks.fence }));
type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
const identity = { nativeSessionId: "wrun_synthetic", responseAttemptId: "00000000-0000-4000-8000-000000000007", turnId: "turn_synthetic", stepIndex: 0 };
function provider() {
  const generate = vi.fn(async () => ({ content: [{ type: "text", text: "Synthetic output" }], finishReason: "stop",
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] }));
  const stream = vi.fn(async () => ({ stream: new ReadableStream({ start(controller) { controller.close(); } }) }));
  return { model: { specificationVersion: "v4", provider: "synthetic", modelId: "spacexai/grok-4.7", supportedUrls: {},
    doGenerate: generate, doStream: stream } as unknown as Model, generate, stream };
}
beforeEach(() => {
  vi.stubEnv("TURAS_ALLOW_LIVE_MODEL_TESTS", "1"); vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-key-never-sent");
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "TURAS_TEST_DATABASE_URL"]) vi.stubEnv(key, "postgresql://127.0.0.1/turas_test_007_eval_abcdefabcdef");
  for (const key of ["TURAS_ENVIRONMENT_ID", "TURAS_TEST_ENVIRONMENT_ID"]) vi.stubEnv(key, "test-synthetic-live-observation");
  mocks.query.mockReset().mockResolvedValue({ rowCount: 1, rows: [{ attempt_id: "synthetic" }] }); mocks.fence.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
/** Fake SQL/fence/provider only. These checks cannot establish actual live calls,
 * original authority, provider usage or owned runtime installation. */
describe("owned live-provider observation boundaries", () => {
  it("excludes provider credentials/options while preserving the original request on generate and stream", async () => {
    for (const path of ["generate", "stream"] as const) {
      const p = provider(), model = observeStaffingLiveProvider(p.model, null, identity);
      const params = { prompt: [{ role: "system" as const, content: "Synthetic approved context" }], maxOutputTokens: 1000,
        headers: { authorization: "PRIVATE_SYNTHETIC_PROVIDER_HEADER" }, providerOptions: { gateway: { secret: "PRIVATE_SYNTHETIC_PROVIDER_OPTION" } } };
      if (path === "generate") await model.doGenerate(params); else await model.doStream(params);
      const written = JSON.stringify(mocks.query.mock.calls.findLast(call => String(call[0]).startsWith("INSERT")));
      expect(written).toContain("Synthetic approved context"); expect(written).not.toContain("PRIVATE_SYNTHETIC_PROVIDER");
      expect(written).not.toContain("synthetic-key-never-sent");
      const calls = path === "generate" ? p.generate : p.stream;
      expect(calls).toHaveBeenCalledOnce(); expect(calls.mock.calls[0]).toEqual([params]);
      expect(mocks.fence.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(mocks.query.mock.invocationCallOrder.at(-1)!);
      expect(calls.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.fence.mock.invocationCallOrder.at(-1)!);
    }
  });
  it("does not reach a provider if the original release fence fails after observation", async () => {
    const p = provider(); mocks.fence.mockRejectedValue(new Error("Synthetic source changed"));
    await expect(observeStaffingLiveProvider(p.model, null, identity).doStream({ prompt: [], maxOutputTokens: 4096 })).rejects.toThrow("source changed");
    expect(p.stream).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled();
  });
  it("refuses incomplete paid identity and oversized observation before provider IO", async () => {
    const p = provider(); mocks.query.mockResolvedValue({ rowCount: 0 });
    await expect(observeStaffingLiveProvider(p.model, null, identity).doGenerate({ prompt: [], maxOutputTokens: 4096 })).rejects.toThrow("identity unavailable");
    mocks.query.mockClear();
    await expect(observeStaffingLiveProvider(p.model, null, identity).doGenerate({
      prompt: [{ role: "system", content: "x".repeat(131_073) }], maxOutputTokens: 4096 })).rejects.toThrow("boundary");
    expect(mocks.query).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled();
  });
  it("requires both the explicit live flag and an owned database identity", () => {
    const p = provider(); vi.stubEnv("TURAS_ALLOW_LIVE_MODEL_TESTS", "0");
    expect(() => observeStaffingLiveProvider(p.model, null, identity)).toThrow("live provider observation");
    vi.stubEnv("TURAS_ALLOW_LIVE_MODEL_TESTS", "1"); vi.stubEnv("DATABASE_URL", "postgresql://127.0.0.1/not-an-owned-clone");
    expect(() => observeStaffingLiveProvider(p.model, null, identity)).toThrow("owned disposable clone");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
