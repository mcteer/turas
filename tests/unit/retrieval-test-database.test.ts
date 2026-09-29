import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";

const preview = "postgresql://owner:synthetic@ep-preview-pooler.us-east-2.aws.neon.tech/turas_preview_005";
const test = "postgresql://owner:synthetic@ep-preview.us-east-2.aws.neon.tech/turas_test_005_neon";
const production = "postgresql://owner:synthetic@ep-production-pooler.us-east-2.aws.neon.tech/legacy";
const environment = {
  DATABASE_URL: "postgresql://runtime:synthetic@ep-preview-pooler.us-east-2.aws.neon.tech/turas_preview_005",
  DATABASE_URL_UNPOOLED: preview.replace("-pooler.", "."),
  NEON_PREVIEW_DB: preview,
  NEON_PROD_DB: production,
  TURAS_TEST_DATABASE_URL: test,
  TURAS_TEST_ENVIRONMENT_ID: "test-neon-005",
};

describe("disposable database selection", () => {
  it("accepts a distinct test database in the selected Preview branch", () => {
    expect(requireTestDatabaseUrl(environment)).toBe(test);
  });

  it("rejects the app database, another branch and a credential change", () => {
    expect(() => requireTestDatabaseUrl({ ...environment,
      TURAS_TEST_DATABASE_URL: environment.DATABASE_URL_UNPOOLED })).toThrow();
    expect(() => requireTestDatabaseUrl({ ...environment,
      TURAS_TEST_DATABASE_URL: test.replace("ep-preview.", "ep-production.") })).toThrow();
    expect(() => requireTestDatabaseUrl({ ...environment,
      TURAS_TEST_DATABASE_URL: test.replace(":synthetic@", ":different@") })).toThrow();
  });
});
