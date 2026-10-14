// Legacy research cache DDL moved to an explicit release migration.
exports.up = pgm => pgm.sql(`
CREATE TABLE IF NOT EXISTS turas_evidence_fetches (
        environment_id text NOT NULL, workspace_id text NOT NULL, key text NOT NULL,
        value jsonb, checked_at timestamptz, expires_at timestamptz NOT NULL DEFAULT now(),
        lease_id uuid, lease_until timestamptz, failed boolean NOT NULL DEFAULT false,
        PRIMARY KEY(environment_id,workspace_id,key));
CREATE TABLE IF NOT EXISTS turas_evidence_snapshots (
        environment_id text NOT NULL, workspace_id text NOT NULL, id text NOT NULL,
        fetch_key text NOT NULL, url text NOT NULL, content_hash text NOT NULL, source jsonb NOT NULL,
        truncated boolean NOT NULL, checked_at timestamptz NOT NULL, refresh_after timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), index_state text NOT NULL DEFAULT 'pending',
        index_attempts integer NOT NULL DEFAULT 0, index_after timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(environment_id,workspace_id,id));
CREATE INDEX IF NOT EXISTS turas_evidence_snapshots_url_idx
        ON turas_evidence_snapshots(environment_id,workspace_id,url,checked_at DESC);
CREATE TABLE IF NOT EXISTS turas_evidence_passages (
        environment_id text NOT NULL, workspace_id text NOT NULL, snapshot_id text NOT NULL,
        ordinal integer NOT NULL, text text NOT NULL, model text NOT NULL, embedding vector(1536),
        search_text tsvector GENERATED ALWAYS AS (to_tsvector('english',text)) STORED,
        PRIMARY KEY(environment_id,workspace_id,snapshot_id,ordinal),
        FOREIGN KEY(environment_id,workspace_id,snapshot_id)
          REFERENCES turas_evidence_snapshots(environment_id,workspace_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS turas_evidence_passages_text_idx ON turas_evidence_passages USING gin(search_text);
CREATE TABLE IF NOT EXISTS turas_evidence_accounts (
        environment_id text NOT NULL, workspace_id text NOT NULL, owner_user_id text NOT NULL,
        account_id text NOT NULL, workload text NOT NULL, snapshot_id text NOT NULL,
        PRIMARY KEY(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id),
        FOREIGN KEY(environment_id,workspace_id,snapshot_id)
          REFERENCES turas_evidence_snapshots(environment_id,workspace_id,id) ON DELETE CASCADE);
ALTER TABLE turas_evidence_accounts ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public'));
CREATE TABLE IF NOT EXISTS turas_public_learning (
        environment_id text NOT NULL, workspace_id text NOT NULL, account_id text NOT NULL, id text NOT NULL,
        source_id text NOT NULL, snapshot_id text NOT NULL, url text NOT NULL, title text NOT NULL,
        passage_id text NOT NULL, quote text NOT NULL, published_at date, source_type text NOT NULL,
        first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL, refresh_attempt_at timestamptz,
        search_text tsvector GENERATED ALWAYS AS(to_tsvector('english',title || ' ' || quote)) STORED,
        PRIMARY KEY(environment_id,workspace_id,account_id,id));
ALTER TABLE turas_public_learning ADD COLUMN IF NOT EXISTS refresh_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS turas_public_learning_text_idx ON turas_public_learning USING gin(search_text);
CREATE TABLE IF NOT EXISTS turas_vercel_practice_sources (
        environment_id text NOT NULL, workspace_id text NOT NULL, product text NOT NULL, topic text NOT NULL,
        snapshot_id text NOT NULL, url text NOT NULL, title text NOT NULL, source_type text NOT NULL,
        information_type text NOT NULL, published_at date, checked_at timestamptz NOT NULL,
        refresh_after timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(environment_id,workspace_id,product,url),
        FOREIGN KEY(environment_id,workspace_id,snapshot_id)
          REFERENCES turas_evidence_snapshots(environment_id,workspace_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS turas_vercel_practice_sources_topic_idx ON turas_vercel_practice_sources(environment_id,workspace_id,product,topic,refresh_after);
CREATE TABLE IF NOT EXISTS turas_vercel_practice_runs (
        id text PRIMARY KEY, environment_id text NOT NULL, workspace_id text NOT NULL, product text NOT NULL,
        topic text NOT NULL, brief jsonb NOT NULL, source_urls jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now(), refresh_after timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS turas_vercel_practice_runs_lookup_idx ON turas_vercel_practice_runs(environment_id,workspace_id,product,created_at DESC);
CREATE TABLE IF NOT EXISTS turas_research_requests (
        environment_id text NOT NULL, workspace_id text NOT NULL, owner_user_id text NOT NULL,
        key text NOT NULL, account_id text NOT NULL, scope jsonb NOT NULL, context_hash text NOT NULL,
        lease_id uuid NOT NULL, lease_until timestamptz NOT NULL, refresh boolean NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
        receipt jsonb, dependencies jsonb NOT NULL DEFAULT '[]', refresh_after timestamptz,
        PRIMARY KEY(environment_id,workspace_id,owner_user_id,key));
ALTER TABLE turas_research_requests ADD COLUMN IF NOT EXISTS parent_session_id text;
ALTER TABLE turas_research_requests ADD COLUMN IF NOT EXISTS worker_session_id text;
ALTER TABLE turas_research_requests ADD COLUMN IF NOT EXISTS recon_reference jsonb;
CREATE INDEX IF NOT EXISTS turas_research_requests_retention_idx ON turas_research_requests(started_at);
CREATE TABLE turas_research_artifacts(id text PRIMARY KEY,environment_id text NOT NULL,workspace_id text NOT NULL,owner_user_id text NOT NULL,account_id text NOT NULL,receipt jsonb NOT NULL,expires_at timestamptz NOT NULL);
GRANT SELECT,INSERT,UPDATE,DELETE ON turas_evidence_fetches,turas_evidence_snapshots,turas_evidence_passages,turas_evidence_accounts,turas_public_learning,turas_vercel_practice_sources,turas_vercel_practice_runs,turas_research_requests,turas_research_artifacts TO turas_runtime;
`);
exports.down = () => { throw Error("Specialist research requires forward recovery"); };
