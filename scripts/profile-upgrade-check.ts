import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";
import { runner } from "node-pg-migrate";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { getServerConfig } from "../lib/server/config";

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--disposable" || args[1] !== "--container" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(args[2])) {
  throw new Error("Use --disposable --container <local-postgres-container>");
}
const container = args[2];
const config = getServerConfig();
if (!config.DATABASE_URL_UNPOOLED) throw new Error("Direct migration URL required");
const source = new URL(config.DATABASE_URL_UNPOOLED);
if (!["127.0.0.1", "localhost"].includes(source.hostname)) {
  throw new Error("Upgrade check requires local PostgreSQL");
}
const username = decodeURIComponent(source.username);
if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username)) {
  throw new Error("Unsupported database username");
}
const cloneName = `turas_upgrade_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const marker = `test-upgrade-${randomUUID().slice(0, 8)}`;
const cloneUrl = new URL(source);
cloneUrl.pathname = `/${cloneName}`;
let created = false;
const client = new Client({ connectionString: cloneUrl.toString() });
try {
  execFileSync("docker", ["exec", container, "createdb", "-U", username, cloneName]);
  created = true;
  await client.connect();
  const base = { dbClient: client, dir: resolve("migrations"),
    migrationsTable: "turas_migrations", ignorePattern: "manifest\\.json",
    direction: "up" as const, singleTransaction: true,
    advisoryLockMode: "wait" as const };
  await runner({ ...base, count: 1 });
  await client.query("INSERT INTO turas_environment(environment_id,schema_version) VALUES($1,1)", [marker]);
  await runner({ ...base, count: 5 });
  await client.query("UPDATE turas_environment SET schema_version=6 WHERE environment_id=$1", [marker]);
  const isolatedEnvironment = { ...process.env, DATABASE_URL: cloneUrl.toString(),
    DATABASE_URL_UNPOOLED: cloneUrl.toString(), TURAS_ENVIRONMENT_ID: marker };
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/bootstrap-demo.ts"], {
    cwd: resolve("."), env: isolatedEnvironment, stdio: "pipe",
  });
  const conversationId = randomUUID(), messageId = randomUUID();
  await client.query(`INSERT INTO conversations
    (id,environment_id,workspace_id,customer_id,owner_principal_id,
     creation_operation_id,binding_state,title)
    VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic pre-upgrade conversation')`,
  [conversationId, marker, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer,
    DEMO_IDS.panel, randomUUID()]);
  await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text)
    VALUES($1,$2,$3,$4,'Synthetic pre-upgrade message')`,
  [messageId, conversationId, randomUUID(), "a".repeat(64)]);
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/db-migrate.ts"], {
    cwd: resolve("."), env: isolatedEnvironment, stdio: "pipe",
  });
  const schema = await client.query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1", [marker]);
  if (schema.rows[0]?.schema_version !== 13) throw new Error("Upgrade did not reach profile schema 13");
  const grants = await client.query<{ state: string }>(
    "SELECT state FROM customer_grants WHERE id=$1 AND membership_id=$2 AND customer_id=$3",
    [DEMO_IDS.partnerSharedGrant, DEMO_IDS.partnerMembership, DEMO_IDS.sharedCustomer]);
  if (grants.rows[0]?.state !== "active") throw new Error("Partner grant changed during upgrade");
  const chat = await client.query<{ title: string; text: string }>(`
    SELECT c.title,m.text FROM conversations c JOIN submitted_messages m ON m.conversation_id=c.id
    WHERE c.id=$1 AND m.id=$2 AND c.owner_principal_id=$3`,
  [conversationId, messageId, DEMO_IDS.panel]);
  if (chat.rows[0]?.title !== "Synthetic pre-upgrade conversation" ||
      chat.rows[0]?.text !== "Synthetic pre-upgrade message") {
    throw new Error("Conversation changed during upgrade");
  }
  await client.query("BEGIN");
  try {
    const recordId = randomUUID(), revisionId = randomUUID();
    await client.query(`INSERT INTO profile_records
      (id,workspace_id,customer_id,kind,canonical_key,created_by)
      VALUES($1,$2,$3,'product_use',$4,$5)`,
    [recordId, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer,
      `upgrade-${randomUUID()}`, DEMO_IDS.panelMembership]);
    await client.query(`INSERT INTO profile_revisions
      (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
       payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
      VALUES($1,$2,$3,$4,1,'profile-v1','{}'::jsonb,'{}'::jsonb,$5,'manual',
        'internal','other_internal',$6)`,
    [revisionId, recordId, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer,
      DEMO_IDS.panelMembership, "b".repeat(64)]);
    await client.query("SAVEPOINT immutable_check");
    let blocked = false;
    try { await client.query("UPDATE profile_revisions SET payload='{}'::jsonb WHERE id=$1", [revisionId]); }
    catch (error) { blocked = (error as { code?: string }).code === "23514"; }
    await client.query("ROLLBACK TO SAVEPOINT immutable_check");
    if (!blocked) throw new Error("Profile revision history became mutable");
  } finally { await client.query("ROLLBACK"); }
  console.log(JSON.stringify({ upgradedFrom: 6, schemaVersion: 13,
    grantPreserved: true, conversationPreserved: true, revisionImmutable: true }));
} finally {
  await client.end().catch(() => undefined);
  if (created) execFileSync("docker", ["exec", container, "dropdb", "-U", username,
    "--if-exists", cloneName]);
}
