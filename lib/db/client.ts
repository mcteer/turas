import { neon } from "@neondatabase/serverless";

let initialized = false;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be configured in production.");
  }
  if (!url) return null;
  return neon(url);
}

export async function ensureDatabase() {
  const query = sql();
  if (!query || initialized) return;
  await query.query("CREATE TABLE IF NOT EXISTS turas_schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await query.query("SELECT id FROM turas_schema_migrations")).map((row) => String(row.id)));
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) await query.query(statement);
    await query.query("INSERT INTO turas_schema_migrations (id) VALUES ($1)", [migration.id]);
  }
  initialized = true;
}

export function database() {
  return sql();
}

const migrations = [
  {
    id: "001_conversations_and_decisions",
    statements: [
      `CREATE TABLE IF NOT EXISTS turas_conversations (
        id text PRIMARY KEY,
        environment_id text NOT NULL,
        workspace_id text NOT NULL,
        owner_user_id text NOT NULL,
        eve_session_id text UNIQUE,
        title text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_message_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz,
        version integer NOT NULL DEFAULT 1
      )`,
      "CREATE INDEX IF NOT EXISTS turas_conversations_owner_recent_idx ON turas_conversations (environment_id, workspace_id, owner_user_id, last_message_at DESC)",
      `CREATE TABLE IF NOT EXISTS turas_decisions (
        id text PRIMARY KEY,
        engagement_id text NOT NULL,
        environment_id text NOT NULL,
        workspace_id text NOT NULL,
        actor_user_id text NOT NULL,
        idempotency_key text UNIQUE NOT NULL,
        expected_version text NOT NULL,
        status text NOT NULL CHECK (status IN ('approved', 'rejected', 'deferred')),
        rationale text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      "CREATE INDEX IF NOT EXISTS turas_decisions_engagement_recent_idx ON turas_decisions (environment_id, workspace_id, engagement_id, created_at DESC)",
    ],
  },
  {
    id: "002_revocable_sessions",
    statements: [
      `CREATE TABLE IF NOT EXISTS turas_sessions (
        id text PRIMARY KEY,
        environment_id text NOT NULL,
        workspace_id text NOT NULL,
        user_id text NOT NULL,
        username text NOT NULL,
        role text NOT NULL CHECK (role IN ('owner', 'reviewer')),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      )`,
      "CREATE INDEX IF NOT EXISTS turas_sessions_active_idx ON turas_sessions (id, environment_id, workspace_id, user_id) WHERE revoked_at IS NULL",
    ],
  },
] as const;
