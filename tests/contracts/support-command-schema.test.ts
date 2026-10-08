import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { supportCommandSchema, supportDependencyClosureSchema, supportListQuerySchema, parseSupportCommandBody } from "../../lib/server/support/schema";
import { supportTemporalIssues } from "../../lib/contracts/support";
import { Temporal } from "@js-temporal/polyfill";
import { unknownSupportAssessment } from "../fixtures/support/seed";

describe("support command boundaries", () => {
  const command = () => ({ contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
    workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [],
    content: unknownSupportAssessment("2026-10-04") });
  it("accepts an explicit customer-wide no-engagement scope", () => {
    expect(supportCommandSchema.safeParse(command()).success).toBe(true);
  });
  it("bounds UTF-8 request bytes before parsing, not JavaScript string length", () => {
    expect(() => parseSupportCommandBody(JSON.stringify(command()))).not.toThrow();
    expect(() => parseSupportCommandBody("é".repeat(32769))).toThrow();
  });
  it("requires bounded integer list limits and mutually exclusive detail filters", () => {
    expect(supportListQuerySchema.parse({}).limit).toBe(20);
    expect(supportListQuerySchema.safeParse({ limit: "50" }).success).toBe(true);
    for (const limit of ["0", "51", "1.5", "", "abc"])
      expect(supportListQuerySchema.safeParse({ limit }).success).toBe(false);
    expect(supportListQuerySchema.safeParse({ recordId: randomUUID(), disposition: "open" }).success).toBe(false);
    expect(supportListQuerySchema.safeParse({ secretFilter: "internal" }).success).toBe(false);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])("refuses invalid expected version %s", expectedVersion => {
    expect(supportCommandSchema.safeParse({ ...command(), expectedVersion }).success).toBe(false);
  });
  it("refuses caller-provided authority and invalid request identities", () => {
    expect(supportCommandSchema.safeParse({ ...command(), principalId: randomUUID() }).success).toBe(false);
    expect(supportCommandSchema.safeParse({ ...command(), requestKey: "not-a-uuid" }).success).toBe(false);
  });
  it("enforces distinct engagement selection with ten as the exact bound", () => {
    const ids = Array.from({ length: 10 }, () => randomUUID());
    expect(supportCommandSchema.safeParse({ ...command(), selectedEngagementIds: ids }).success).toBe(true);
    expect(supportCommandSchema.safeParse({ ...command(), selectedEngagementIds: [...ids, randomUUID()] }).success).toBe(false);
    expect(supportCommandSchema.safeParse({ ...command(), selectedEngagementIds: [ids[0], ids[0]] }).success).toBe(false);
  });
  it("bounds direct sources to twenty and dependency closure to two hundred", () => {
    const refs = Array.from({ length: 200 }, () => ({ kind: "execution_record", id: randomUUID(),
      sourceRevisionId: randomUUID(), engagementId: randomUUID(), generation: 1, contentDigest: "a".repeat(64) }));
    expect(supportCommandSchema.safeParse({ ...command(), sourceRefs: refs.slice(0, 20) }).success).toBe(true);
    expect(supportCommandSchema.safeParse({ ...command(), sourceRefs: refs.slice(0, 21) }).success).toBe(false);
    expect(supportCommandSchema.safeParse({ ...command(), sourceRefs: [refs[0], refs[0]] }).success).toBe(false);
    expect(supportDependencyClosureSchema.safeParse(refs).success).toBe(true);
    expect(supportDependencyClosureSchema.safeParse([...refs, refs[0]]).success).toBe(false);
  });
  it("rejects overlong and whitespace-only title and rationale", () => {
    const value = command();
    expect(supportCommandSchema.safeParse({ ...value, content: { ...value.content, title: "a".repeat(201) } }).success).toBe(false);
    expect(supportCommandSchema.safeParse({ ...value, content: { ...value.content, title: "   " } }).success).toBe(false);
    value.content.checks[0]!.rationale = "a".repeat(2001);
    expect(supportCommandSchema.safeParse(value).success).toBe(false);
  });
  it("requires exact revision, digest and rationale for a review", () => {
    const base = { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
      workloadId: null, expectedVersion: 1, recordId: randomUUID(), revisionId: randomUUID(),
      sourceDigest: "a".repeat(64), decision: "accept", rationale: "Exact source review" };
    expect(supportCommandSchema.safeParse(base).success).toBe(true);
    expect(supportCommandSchema.safeParse({ ...base, sourceDigest: "A".repeat(64) }).success).toBe(false);
    expect(supportCommandSchema.safeParse({ ...base, rationale: "" }).success).toBe(false);
  });
  it("checks observation against the specified timezone and clock", () => {
    const content = unknownSupportAssessment("2026-10-05");
    expect(supportTemporalIssues(content, Temporal.Instant.from("2026-10-04T23:00:00Z"))).toEqual(["future_observation"]);
    content.timezone = "Asia/Tokyo";
    expect(supportTemporalIssues(content, Temporal.Instant.from("2026-10-04T23:00:00Z"))).toEqual([]);
  });
});
