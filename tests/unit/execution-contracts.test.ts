import { describe, expect, it } from "vitest";
import { executionDate, executionExpectedVersions, executionHash, executionKey, executionListSchema, executionPeriodSchema, executionRationale, executionTimezone, executionVersion } from "../../lib/server/execution/schema";
import { executionBody, executionQuery } from "../../lib/server/execution/http";

describe("execution boundaries", () => {
  it("requires exact positive versions, bounded rationales and baseline key grammar", () => {
    for (const invalid of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) expect(executionVersion.safeParse(invalid).success).toBe(false);
    expect(executionExpectedVersions.safeParse({}).success).toBe(false);
    expect(executionRationale.safeParse("  ").success).toBe(false);
    expect(executionRationale.safeParse("x".repeat(2000)).success).toBe(true);
    expect(executionRationale.safeParse("x".repeat(2001)).success).toBe(false);
    expect(executionKey.safeParse("package_1-a").success).toBe(true);
    expect(executionKey.safeParse("Package 1").success).toBe(false);
    expect(executionHash.safeParse("A".repeat(64)).success).toBe(false);
  });
  it("validates real dates, timezone identity and inclusive periods", () => {
    expect(executionDate.safeParse("2024-02-29").success).toBe(true);
    expect(executionDate.safeParse("2025-02-29").success).toBe(false);
    expect(executionTimezone.safeParse("America/Denver").success).toBe(true);
    expect(executionTimezone.safeParse("+02:00").success).toBe(false);
    expect(executionPeriodSchema.safeParse({ from: "2026-01-01", to: "2026-04-01" }).success).toBe(true);
    expect(executionPeriodSchema.safeParse({ from: "2026-01-01", to: "2026-04-02" }).success).toBe(false);
    for (const limit of [0, 51, 1.5]) expect(executionListSchema.safeParse({ limit }).success).toBe(false);
  });
  it("rejects duplicate query authority, malformed JSON and streamed overflow", async () => {
    expect(() => executionQuery(new Request("https://example.test/?limit=2&limit=3"), ["limit"])).toThrow();
    expect(() => executionQuery(new Request("https://example.test/?actor=admin"), ["limit"])).toThrow();
    await expect(executionBody(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400 });
    await expect(executionBody(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(131073) }))).rejects.toMatchObject({ status: 413 });
    await expect(executionBody(new Request("https://example.test", { method: "POST", body: "text" }))).rejects.toMatchObject({ status: 415 });
    expect(await executionBody(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: '{"ok":true}' }))).toEqual({ ok: true });
  });
});
