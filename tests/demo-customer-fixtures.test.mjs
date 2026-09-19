import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_DATA } from "../lib/demo/fixtures.ts";

test("fictional customer names and aliases cannot resolve the real companies previously used", () => {
  const names = DEMO_DATA.customers.flatMap(({ name, aliases }) => [name, ...aliases].map(value => value.toLowerCase()));
  for (const realName of ["Notion", "Notion Labs", "Linear", "LinearWorks", "Coda", "Coda Collective"]) {
    assert.equal(names.some(name => name.includes(realName.toLowerCase())), false, realName);
  }
  for (const name of ["alderwick labs", "brindlepath software", "morrowfen media"]) {
    assert.equal(names.includes(name), true);
  }
  assert.equal(DEMO_DATA.customers.every(customer => customer.name.includes("fictional company")), true);
});

test("customer rename preserves existing engagement and decision references", () => {
  const customers = new Map(DEMO_DATA.customers.map(customer => [customer.id, customer]));
  for (const engagement of DEMO_DATA.engagements) assert.ok(customers.has(engagement.accountId));
  assert.equal(customers.get("acct-notion-labs")?.aliases.includes("Alderwick"), true);
  assert.ok(DEMO_DATA.engagements.some(engagement => engagement.id === "eng-notion-pilot"));
});
