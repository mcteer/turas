import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_CUSTOMER_EVIDENCE as snapshot, findPublicAccounts, getPublicAccount, searchPublicAccounts } from "../lib/customer-evidence/repository.ts";
import { DEMO_DATA } from "../lib/demo/fixtures.ts";

test("public inventory reconciles its sources without invented internal states", () => {
  const ids = new Set();
  const aliases = new Set();
  const sources = new Set();
  for (const account of snapshot.accounts) {
    assert.ok(!ids.has(account.id)); ids.add(account.id);
    assert.equal(account.formalMaturity, "unknown");
    assert.equal(account.internalEngagement, "not_available");
    assert.ok(account.directoryListed || account.evidence.length > 0);
    for (const name of new Set([account.name, ...account.aliases].map(value => value.toLowerCase()))) {
      assert.ok(!aliases.has(name), `Ambiguous alias: ${name}`); aliases.add(name);
    }
    for (const evidence of account.evidence) {
      assert.equal(new URL(evidence.url).hostname, "vercel.com");
      assert.ok(evidence.publishedAt <= snapshot.reviewedAt);
      assert.ok(!sources.has(evidence.url)); sources.add(evidence.url);
      assert.ok(evidence.scope && evidence.summary);
    }
  }
  assert.equal(sources.size, snapshot.coverage.storyCount);
  assert.equal(snapshot.accounts.filter(account => account.directoryListed).length, snapshot.coverage.directoryCustomers);
  for (const account of DEMO_DATA.customers) {
    assert.equal(ids.has(account.id), false);
    for (const alias of account.aliases) assert.equal(aliases.has(alias.toLowerCase()), false);
  }
});

test("Notion resolves to two dated public workloads, never the fictional handoff", () => {
  const [notion] = findPublicAccounts(" Notion Labs ");
  assert.equal(notion.id, "public-notion");
  assert.deepEqual(notion.evidence.map(item => item.publishedAt), ["2026-03-12", "2024-11-25"]);
  assert.ok(notion.evidence.some(item => item.scope === "Notion Workers" && item.products.includes("Sandbox")));
  assert.ok(notion.evidence.some(item => item.scope === "Marketing-site experimentation"));
  assert.equal(/12 of 40|Avery|Maya|240 hours/.test(JSON.stringify(notion)), false);
  assert.deepEqual(findPublicAccounts("Not"), []);
  assert.deepEqual(findPublicAccounts("Coda"), []);
  assert.equal(getPublicAccount("acct-notion-labs"), undefined);
});

test("directory listings stay unknown, conflicts stay visible, anonymous identity stays unknown", () => {
  assert.equal(getPublicAccount("public-figma").evidence.length, 0);
  for (const id of ["public-factory", "public-the-weather-company", "public-helly-hansen", "public-paige", "public-ledger"]) {
    assert.ok(getPublicAccount(id).evidence.some(item => item.cautions.length));
  }
  assert.equal(getPublicAccount("public-unnamed-sportswear-retailer").aliases.length, 0);
  assert.equal(searchPublicAccounts("notion", "Operational trust").length, 1);
  assert.equal(searchPublicAccounts("no-such-customer-987").length, 0);
});
