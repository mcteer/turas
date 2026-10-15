import { expect, it } from "vitest";
import { z } from "zod";
import { HttpFailure } from "../../lib/contracts/http";
import { researchFinalizationFailure } from "../../lib/server/research/specialists/solution-research/finalization-failure";

it("distinguishes source retention from signing, storage and completion without retrying", () => {
  const error = new HttpFailure(409, "research_source_retired", "private source prose");
  expect(researchFinalizationFailure(error, "retain_sources")).toEqual({
    category: "research_source_retired",
    reason: "Research could not retain its cited sources. Existing access, source-integrity and retention checks still apply.",
  });
  expect(researchFinalizationFailure(error, "bind_context").reason).toContain("verify and sign");
  expect(researchFinalizationFailure(error, "store_artifact").reason).toContain("store its signed artifact");
  expect(researchFinalizationFailure(error, "finish_reservation").reason).toContain("Do not retry");
});

it("retains fixed database and validation categories without their private details", () => {
  const secret = "private-source-quotation postgres://private:secret@host/db";
  const database = Object.assign(new Error(secret), { code: "40P01", detail: secret });
  expect(researchFinalizationFailure(database, "retain_sources").category).toBe("database_40P01");
  const invalid = z.string().safeParse({ secret });
  expect(researchFinalizationFailure(invalid.error, "retain_sources").category).toBe("invalid_structure");
  for (const error of [database, invalid.error, new HttpFailure(409, secret, secret), { code: "40P01", message: secret }, new Error(secret)]) {
    const diagnostic = researchFinalizationFailure(error, "retain_sources");
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
  }
  expect(researchFinalizationFailure(new HttpFailure(409, secret, secret), "retain_sources").category).toBe("unclassified");
  expect(researchFinalizationFailure(new DOMException(secret, "AbortError"), "retain_sources").category).toBe("interrupted");
});
