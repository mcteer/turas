import { describe, expect, it } from "vitest";
import { supportBody, supportQuery, supportRouteId } from "../../lib/server/support/http";

describe("bounded support transport", () => {
  it("rejects oversized streamed UTF-8 even without a content-length", async () => {
    const request = new Request("http://localhost/test", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "€".repeat(22000) }) });
    await expect(supportBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects invalid encoding, malformed JSON and non-JSON bodies", async () => {
    await expect(supportBody(new Request("http://localhost/test", { method: "POST",
      headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) }))).rejects.toMatchObject({ status: 400 });
    await expect(supportBody(new Request("http://localhost/test", { method: "POST",
      headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
    await expect(supportBody(new Request("http://localhost/test", { method: "POST", body: "{}" }))).rejects.toMatchObject({ status: 415 });
  });
  it("refuses duplicate queries and malformed identifiers", () => {
    expect(() => supportQuery(new Request("http://localhost/test?limit=1&limit=2"))).toThrow();
    expect(() => supportRouteId("not-a-uuid")).toThrow();
  });
});
