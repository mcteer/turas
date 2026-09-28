import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { ingestVerifiedResearch } from "../../lib/server/profiles/research";
import { createProfileTestSession } from "../fixtures/profiles";
import { readProfile, readProfileSource } from "../../lib/server/profiles/read";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { randomUUID } from "node:crypto";

const fixture = {
  workspaceId: DEMO_IDS.workspace, customerId: DEMO_IDS.sharedCustomer,
  trustedIdentity: "synthetic-fixture-v1", location: "https://example.com/public-product-documentation",
  title: "Example public product documentation", passage: "Synthetic public capability text.",
  supportedClaim: "The example public product has a documented capability.",
  publicationAt: "2026-09-01T00:00:00Z", retrievalAt: "2026-09-27T00:00:00Z",
  eventAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  rights: "Public synthetic fixture", audience: "delivery",
  qualityInput: {
    rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 1,
    reliabilityRationale: "Named public source", directnessRationale: "Exact passage",
    corroborationRationale: "Single public source", informationType: "product_capability",
    dateBasis: "publication",
  },
  checks: { identity: true, scope: true, integrity: true, content: true,
    rationale: "Synthetic fixture checks passed", checkVersion: "research-check-v1" },
} as const;

describe("trusted research ingestion", () => {
  it("projects a dated synthetic source matrix with every quality band and freshness label", async () => {
    const previousEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const now = Date.now();
          const dated = (days: number) => new Date(now - days * 86_400_000).toISOString();
          const cases = [
            { label: "strong-recent", days: 1, R: 4, D: 4, C: 4, band: "strong", freshness: "Recent" },
            { label: "usable-recent", days: 1, R: 2, D: 4, C: 1, band: "usable", freshness: "Recent" },
            { label: "weak-unknown", days: null, R: 4, D: 0, C: 0, band: "weak", freshness: "Unknown" },
            { label: "insufficient-unknown", days: null, R: 0, D: 0, C: 0, band: "insufficient", freshness: "Unknown" },
            { label: "strong-aging", days: 45, R: 4, D: 4, C: 4, band: "strong", freshness: "Aging" },
            { label: "usable-stale", days: 70, R: 4, D: 4, C: 4, band: "usable", freshness: "Stale" },
          ] as const;
          const marker = randomUUID();
          for (const item of cases) {
            const source = await ingestVerifiedResearch({ ...fixture,
              location: `https://example.com/quality-${item.label}-${marker}`,
              passage: `Synthetic dated passage for ${item.label}`,
              publicationAt: item.days === null ? undefined : dated(item.days),
              retrievalAt: new Date(now).toISOString(),
              qualityInput: { ...fixture.qualityInput, R: item.R, D: item.D, C: item.C,
                dateBasis: item.days === null ? "unknown" : "publication" },
            }, client);
            const detail = await readProfileSource(admin, fixture.customerId, source.sourceRevisionId, client) as {
              quality: { band: string; freshness: string } };
            expect(detail.quality, item.label).toMatchObject({ band: item.band,
              freshness: item.freshness });
          }
          await expect(ingestVerifiedResearch({ ...fixture,
            location: `https://example.com/quality-future-${marker}`,
            publicationAt: new Date(now + 86_400_000).toISOString(),
            retrievalAt: new Date(now).toISOString(),
          }, client)).rejects.toMatchObject({ status: 422, code: "invalid_date" });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = previousEnvironment; }
  });

  it("keeps checked public evidence attributed, immutable and idempotent", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const first = await ingestVerifiedResearch(fixture, client);
          const repeat = await ingestVerifiedResearch(fixture, client);
          expect(repeat).toEqual(first);
          const source = await client.query<{ origin: string }>(
            "SELECT origin FROM evidence_sources WHERE id=$1", [first.sourceId]);
          expect(source.rows[0].origin).toBe("independent_research");
          const checks = await client.query("SELECT 1 FROM research_checks WHERE source_revision_id=$1",
            [first.sourceRevisionId]);
          expect(checks.rows).toHaveLength(1);
          const changed = await ingestVerifiedResearch({ ...fixture, passage: "Updated synthetic passage." }, client);
          expect(changed.sourceId).toBe(first.sourceId);
          expect(changed.sourceRevisionId).not.toBe(first.sourceRevisionId);
          expect(changed.version).toBe(2);
          const partner = await createProfileTestSession(client, "partner");
          const projected = await readProfile(partner, fixture.customerId, client) as {
            attributedResearch: { sourceRevisionId: string; state: string }[];
          };
          expect(projected.attributedResearch).toContainEqual(
            expect.objectContaining({ sourceRevisionId: changed.sourceRevisionId, state: "researched" }));
          expect(projected.attributedResearch.map((item) => item.sourceRevisionId))
            .not.toContain(first.sourceRevisionId);
          const detail = await readProfileSource(partner, fixture.customerId, changed.sourceRevisionId, client);
          expect(detail).toMatchObject({ state: "researched", passage: "Updated synthetic passage.",
            eventAt: fixture.eventAt });
          await expect(readProfileSource(partner, fixture.customerId, first.sourceRevisionId, client))
            .rejects.toMatchObject({ status: 404 });
          await expect(submitProfileCommand(partner, fixture.customerId, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: "Copied research is not independent support",
              sourceType: "manual", evidenceRevisionIds: [first.sourceRevisionId,
                changed.sourceRevisionId] },
            evidenceRevisionIds: [first.sourceRevisionId, changed.sourceRevisionId],
          }, client)).rejects.toMatchObject({ status: 404 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });
  it("rejects forged research identity and incomplete checks", async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        await expect(ingestVerifiedResearch({ ...fixture, trustedIdentity: "user-chat" }, client))
          .rejects.toThrow();
        await expect(ingestVerifiedResearch({ ...fixture, checks: { ...fixture.checks, integrity: false } }, client))
          .rejects.toThrow();
      } finally { await client.query("ROLLBACK"); }
    });
  });
  it("does not treat the same checked passage at two locations as independent support", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const marker = randomUUID();
          const first = await ingestVerifiedResearch({ ...fixture,
            location: `https://example.com/first-${marker}` }, client);
          const copy = await ingestVerifiedResearch({ ...fixture,
            location: `https://example.com/copied-${marker}` }, client);
          expect(first.sourceId).not.toBe(copy.sourceId);
          const partner = await createProfileTestSession(client, "partner");
          await expect(submitProfileCommand(partner, fixture.customerId, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "delivery", dataCategory: "delivery_context",
            payload: { kind: "claim", text: "Synthetic duplicated source passage",
              sourceType: "manual", evidenceRevisionIds: [first.sourceRevisionId,
                copy.sourceRevisionId] },
            evidenceRevisionIds: [first.sourceRevisionId, copy.sourceRevisionId],
          }, client)).rejects.toMatchObject({ status: 422, code: "copied_support" });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });
  it("withdraws a source once and removes it from partner research context", async () => {
    const oldMarker = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const source = await ingestVerifiedResearch({ ...fixture,
            location: `https://example.com/${randomUUID()}` }, client);
          const admin = await createProfileTestSession(client, "mcteer");
          const partner = await createProfileTestSession(client, "partner");
          const detail = await readProfileSource(admin, fixture.customerId, source.sourceRevisionId, client);
          expect(detail).toMatchObject({ lifecycleVersion: 0 });
          await submitProfileCommand(admin, fixture.customerId, { requestKey: randomUUID(),
            action: "withdraw_source", sourceRevisionId: source.sourceRevisionId,
            expectedLifecycleVersion: 0, rationale: "Synthetic withdrawal" }, client);
          const projected = await readProfile(partner, fixture.customerId, client) as {
            attributedResearch: { sourceRevisionId: string }[] };
          expect(projected.attributedResearch.map((item) => item.sourceRevisionId))
            .not.toContain(source.sourceRevisionId);
          await expect(readProfileSource(partner, fixture.customerId, source.sourceRevisionId, client))
            .rejects.toMatchObject({ status: 404 });
          await expect(submitProfileCommand(admin, fixture.customerId, { requestKey: randomUUID(),
            action: "withdraw_source", sourceRevisionId: source.sourceRevisionId,
            expectedLifecycleVersion: 1, rationale: "Duplicate" }, client))
            .rejects.toMatchObject({ status: 409 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = oldMarker; }
  });
});
