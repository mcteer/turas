import { describe, expect, it, vi } from "vitest";
import { StaffingCommandClient } from "../../lib/staffing/client-commands";
const result = { resourceId: "00000000-0000-4000-8000-000000000111", state: "active" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("staffing browser command uncertainty", () => {
  it("admits only one mutation before React can render its busy state", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const completed = vi.fn();
    const client = new StaffingCommandClient("csrf-synthetic", fetcher, completed);
    const first = client.save("/api/staffing/resources", { rationale: "Synthetic" });
    expect(await client.save("/api/staffing/resources", { rationale: "Duplicate click" })).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    finish(json(200, { data: result })); expect(await first).toBe(true); expect(completed).toHaveBeenCalledOnce();
    expect(client.snapshot).toMatchObject({ busy: false, uncertainKey: null });
  });
  it("acknowledges the admitted form exactly once after an uncertain receipt", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(json(200, { data: result }));
    const confirmed = vi.fn(), duplicate = vi.fn();
    const client = new StaffingCommandClient("csrf-synthetic", fetcher, vi.fn());
    await client.save("/api/staffing/resources", {}, "POST", confirmed);
    expect(confirmed).not.toHaveBeenCalled();
    await client.save("/api/staffing/resources", {}, "POST", duplicate);
    await client.reconcile();
    expect(confirmed).toHaveBeenCalledOnce(); expect(duplicate).not.toHaveBeenCalled();
    expect(await client.reconcile()).toBe(false); expect(confirmed).toHaveBeenCalledOnce();
  });
  it("keeps an uncertain key and only reads its receipt without retrying a write", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(json(404, { error: { message: "Not available" } }))
      .mockResolvedValueOnce(json(200, { data: result }));
    const completed = vi.fn();
    const client = new StaffingCommandClient("csrf-synthetic", fetcher, completed);
    expect(await client.save("/api/staffing/resources", {})).toBe(false);
    const key = client.snapshot.uncertainKey; expect(key).toBeTruthy();
    expect(await client.save("/api/staffing/resources", {})).toBe(false);
    await client.reconcile(); expect(client.snapshot.uncertainKey).toBe(key);
    await client.reconcile(); expect(client.snapshot.uncertainKey).toBeNull(); expect(completed).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls[1][0]).toBe(`/api/staffing/commands/${key}`);
  });
  it("preserves uncertainty after a server error or malformed success envelope", async () => {
    for (const response of [json(503, { error: { message: "Unavailable" } }), json(200, {})]) {
      const client = new StaffingCommandClient("csrf-synthetic", vi.fn().mockResolvedValue(response), vi.fn());
      await client.save("/api/staffing/skills", {}); expect(client.snapshot.uncertainKey).toBeTruthy();
    }
  });
  it("keeps a confirmed save confirmed when refreshing its projection fails", async () => {
    const completed = vi.fn().mockRejectedValue(new Error("Read unavailable"));
    const client = new StaffingCommandClient("csrf-synthetic", vi.fn().mockResolvedValue(json(200, { data: result })), completed);
    expect(await client.save("/api/staffing/resources", {})).toBe(true);
    expect(client.snapshot.uncertainKey).toBeNull(); expect(client.snapshot.message).toContain("Saved.");
    expect(client.snapshot.message).toContain("Reload");
  });
  it("leaves known validation failures retryable and sends the exact captured payload", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(422, { error: { message: "Invalid staffing request" } }));
    const client = new StaffingCommandClient("csrf-synthetic", fetcher, vi.fn());
    const body = { rationale: "Synthetic initial value", requestKey: "caller_must_not_replace_key" };
    const pending = client.save("/api/staffing/resources", body); body.rationale = "Edited afterward";
    await pending;
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.rationale).toBe("Synthetic initial value"); expect(sent.requestKey).not.toBe(body.requestKey);
    expect(client.snapshot).toMatchObject({ uncertainKey: null, busy: false, message: "Invalid staffing request" });
  });
});
