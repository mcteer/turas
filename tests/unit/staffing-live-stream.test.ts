import { afterEach, describe, expect, it, vi } from "vitest";
import { captureStaffingLiveStream } from "../../scripts/staffing-live-stream";

/** Mock HTTP only: verifies capture boundaries using the installed eve client,
 * never claims actual native execution, provider usage or a live eval score. */
const input = () => ({ origin: "http://127.0.0.1:3123", cookie: "synthetic=owned", nativeSessionId: "wrun_synthetic",
  turnId: "turn_synthetic", deadlineAt: Date.now() + 60_000, suiteDeadlineAt: Date.now() + 120_000 });
const event = (id: string, type: string, data: Record<string, unknown> = {}) => ({ type, meta: { id, at: "2026-10-01T12:00:00Z" }, data: { turnId: "turn_synthetic", ...data } });
const response = (events: unknown[]) => new Response(events.map(value => JSON.stringify(value)).join("\n") + "\n",
  { headers: { "content-type": "application/x-ndjson", "x-eve-stream-version": "25" } });
afterEach(() => vi.unstubAllGlobals());
describe("bounded read-only actual-output capture", () => {
  it("attaches through GET only, uses the absolute cursor and stops at its own terminal", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([event("evt_first", "message.completed", { message: "Synthetic captured text" }),
      event("evt_terminal", "turn.completed"), event("evt_after", "message.completed", { message: "must not capture" })]));
    vi.stubGlobal("fetch", fetcher);
    const captured = await captureStaffingLiveStream({ ...input(), startIndex: 4 });
    expect(captured).toMatchObject({ outcome: "terminal", terminal: "turn.completed", nextIndex: 6 });
    expect(captured.events).toHaveLength(2); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/eve/v1/session/wrun_synthetic/stream");
    expect(new URL(String(url)).searchParams.get("startIndex")).toBe("4");
    expect(options?.method ?? "GET").toBe("GET"); expect(options?.redirect).toBe("error");
  });
  it("preserves UTF-8 text split across actual HTTP chunks", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(event("evt_text", "message.completed", { message: "Kōrero" })) + "\n" +
      JSON.stringify(event("evt_done", "turn.completed")) + "\n");
    const split = bytes.findIndex(value => value === 0xc5) + 1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close();
    } }), { headers: { "x-eve-stream-version": "25" } })));
    const captured = await captureStaffingLiveStream(input());
    expect(captured.outcome).toBe("terminal"); expect(JSON.stringify(captured.events)).toContain("Kōrero");
  });
  it("does not open a stream after the original deadline or widen it", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await captureStaffingLiveStream({ ...input(), deadlineAt: Date.now() - 1 })).toMatchObject({ outcome: "unconfirmed", reason: "deadline" });
    await expect(captureStaffingLiveStream({ ...input(), deadlineAt: Date.now() + 180_000, suiteDeadlineAt: Date.now() + 180_000 })).rejects.toThrow("deadline");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports denial without leaking a private response or issuing a new request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "source_changed", message: "PRIVATE_SYNTHETIC_ERROR" }), { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    const captured = await captureStaffingLiveStream(input());
    expect(captured).toMatchObject({ outcome: "denied", status: 409 });
    expect(JSON.stringify(captured)).not.toContain("PRIVATE_SYNTHETIC_ERROR"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("resumes a closed read-only stream from the absolute cursor without sending another turn", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response([event("evt_partial", "message.completed", { message: "Synthetic partial" })]))
      .mockResolvedValueOnce(response([event("evt_terminal", "turn.completed")]));
    vi.stubGlobal("fetch", fetcher);
    expect(await captureStaffingLiveStream(input())).toMatchObject({ outcome: "terminal", terminal: "turn.completed", nextIndex: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get("startIndex")).toBe("1");
    expect(fetcher.mock.calls.every(([, options]) => (options?.method ?? "GET") === "GET")).toBe(true);
  });
  it("rejects another turn, a missing stable event ID and a repeated ID", async () => {
    for (const events of [[event("evt_wrong", "turn.completed", { turnId: "turn_other" })],
      [event("", "turn.completed")], [{ ...event("evt_bad_time", "turn.completed"), meta: { id: "evt_bad_time", at: "invalid" } }],
      [event("evt_repeat", "message.completed"), event("evt_repeat", "turn.completed")]]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(events)));
      await expect(captureStaffingLiveStream(input())).rejects.toThrow("Native live capture failed");
    }
  });
  it("rejects nonlocal/credential-bearing targets before accessing a network", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const origin of ["https://example.com", "http://owned:private@127.0.0.1:3123", "http://127.0.0.1:3123/other"]) {
      await expect(captureStaffingLiveStream({ ...input(), origin })).rejects.toThrow("owned local");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
