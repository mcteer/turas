import { beforeEach } from "vitest";
import { Client } from "pg";
import { requireTestDatabaseUrl } from "./database";

/** The 002–005 suites share synthetic identities in an owned disposable test
 * clone. Capture the guarded URL before individual suites temporarily override
 * their in-process environment for route tests. */
const url = requireTestDatabaseUrl();
if (!/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(url).pathname))
  throw new Error("Regression rate reset requires the owned disposable test clone");

/** Reset only between independent cases; enforcement within each case remains intact. */
beforeEach(async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("DELETE FROM rate_windows WHERE environment_id=$1 AND category IN ('profile_read','profile_write')",
      [process.env.TURAS_TEST_ENVIRONMENT_ID]);
  } finally { await db.end(); }
});
