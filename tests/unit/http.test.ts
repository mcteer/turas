import { describe, expect, it } from "vitest";
import { failure, hiddenRecord, HttpFailure, success } from "../../lib/contracts/http";

describe("application responses", () => {
  it("returns a stable hidden-record response for inaccessible records", async () => {
    const response = failure(hiddenRecord(), "test-correlation");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Resource not found" },
      correlationId: "test-correlation",
    });
  });

  it("preserves rate-limit delay without echoing request content", async () => {
    const response = failure(new HttpFailure(429, "rate_limited", "Try again later", 2.2), "id");
    expect(response.headers.get("Retry-After")).toBe("3");
    expect(await response.text()).not.toContain("password");
  });

  it("treats unknown errors as unavailable without exposing their message", async () => {
    const response = failure(new Error("secret content"), "id");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret content");
    expect(success({ value: true }).headers.get("Cache-Control")).toBe("private, no-store");
  });
});
