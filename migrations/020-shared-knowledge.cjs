exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE knowledge_contributions (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL,
      author_membership_id uuid NOT NULL,
      state text NOT NULL DEFAULT 'draft' CHECK
        (state IN ('draft','submitted','rejected','closed')),
      current_revision_number integer NOT NULL DEFAULT 1 CHECK (current_revision_number >= 1),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment_id,author_membership_id,idempotency_key),
      UNIQUE (id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY (author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE INDEX knowledge_contributions_author_idx ON knowledge_contributions
      (environment_id,author_membership_id,state,updated_at DESC);

    CREATE TABLE knowledge_revisions (
      id uuid PRIMARY KEY,
      contribution_id uuid NOT NULL REFERENCES knowledge_contributions(id),
      revision_number integer NOT NULL CHECK (revision_number >= 1),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      author_membership_id uuid NOT NULL REFERENCES memberships(id),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (contribution_id,revision_number),
      UNIQUE (contribution_id,author_membership_id,idempotency_key),
      UNIQUE (id,contribution_id)
    );

    CREATE FUNCTION turas_knowledge_payload_valid(payload jsonb) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$
        SELECT jsonb_typeof(payload)='object'
          AND (SELECT count(*) FROM jsonb_object_keys(payload))=9
          AND payload ?& ARRAY['title','productVersion','problem','prerequisites',
            'solution','reasoning','applicability','limitations','validation']
          AND jsonb_typeof(payload->'title')='string'
          AND length(btrim(payload->>'title')) BETWEEN 1 AND 200
          AND jsonb_typeof(payload->'productVersion')='string'
          AND length(btrim(payload->>'productVersion')) BETWEEN 1 AND 200
          AND jsonb_typeof(payload->'problem')='string'
          AND length(btrim(payload->>'problem')) BETWEEN 1 AND 2000
          AND jsonb_typeof(payload->'prerequisites')='string'
          AND length(btrim(payload->>'prerequisites')) BETWEEN 1 AND 2000
          AND jsonb_typeof(payload->'solution')='string'
          AND length(btrim(payload->>'solution')) BETWEEN 1 AND 2000
          AND jsonb_typeof(payload->'reasoning')='string'
          AND length(btrim(payload->>'reasoning')) BETWEEN 1 AND 2000
          AND jsonb_typeof(payload->'applicability')='string'
          AND length(btrim(payload->>'applicability')) BETWEEN 1 AND 2000
          AND jsonb_typeof(payload->'limitations')='string'
          AND length(btrim(payload->>'limitations')) BETWEEN 1 AND 2000
          AND jsonb_typeof(payload->'validation')='string'
          AND length(btrim(payload->>'validation')) BETWEEN 1 AND 2000;
      $$;

    CREATE TABLE knowledge_revision_payloads (
      revision_id uuid PRIMARY KEY REFERENCES knowledge_revisions(id),
      payload jsonb NOT NULL CHECK
        (octet_length(payload::text) <= 20480 AND turas_knowledge_payload_valid(payload)),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE knowledge_lineage (
      id uuid PRIMARY KEY,
      contribution_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
      source_kind text NOT NULL CHECK (source_kind IN ('accepted_profile','verified_research')),
      source_revision_id uuid NOT NULL,
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
      rights_basis text NOT NULL CHECK (length(btrim(rights_basis)) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (revision_id,ordinal),
      UNIQUE (revision_id,source_kind,source_revision_id),
      FOREIGN KEY (revision_id,contribution_id)
        REFERENCES knowledge_revisions(id,contribution_id)
    );
    CREATE INDEX knowledge_lineage_source_idx ON knowledge_lineage
      (source_kind,source_revision_id,source_generation);

    CREATE TABLE knowledge_publications (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      contribution_id uuid NOT NULL UNIQUE REFERENCES knowledge_contributions(id),
      revision_id uuid NOT NULL,
      head_generation bigint NOT NULL CHECK (head_generation >= 1),
      state text NOT NULL CHECK
        (state IN ('unpublished','published','suspended','superseded','withdrawn')),
      public_quality jsonb NOT NULL CHECK (octet_length(public_quality::text) <= 8192),
      published_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id,environment_id),
      FOREIGN KEY (revision_id,contribution_id)
        REFERENCES knowledge_revisions(id,contribution_id),
      CHECK (state <> 'published' OR published_at IS NOT NULL)
    );
    CREATE INDEX knowledge_publications_current_idx ON knowledge_publications
      (environment_id,published_at DESC,id) WHERE state='published';

    CREATE TABLE knowledge_decisions (
      id uuid PRIMARY KEY,
      contribution_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      action text NOT NULL CHECK (action IN ('publish','reject','withdraw')),
      expected_revision integer NOT NULL CHECK (expected_revision >= 1),
      expected_digest text NOT NULL CHECK (expected_digest ~ '^[0-9a-f]{64}$'),
      expected_publication_generation bigint CHECK
        (expected_publication_generation IS NULL OR expected_publication_generation >= 1),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      rights_attested boolean NOT NULL DEFAULT false,
      sanitization_rationale text NOT NULL CHECK
        (length(btrim(sanitization_rationale)) BETWEEN 1 AND 2000),
      checklist jsonb NOT NULL CHECK (jsonb_typeof(checklist)='object'),
      decided_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_membership_id,action,idempotency_key),
      FOREIGN KEY (revision_id,contribution_id)
        REFERENCES knowledge_revisions(id,contribution_id),
      CHECK (action <> 'publish' OR rights_attested),
      CHECK (action <> 'publish' OR
        checklist @> '{"namesAndDomainsRemoved":true,"repositoriesAndLinksRemoved":true,
          "peopleAndCommercialDetailsRemoved":true,"identifyingConfigurationAndOutcomesRemoved":true,
          "countsAndCombinedInferenceReviewed":true}'::jsonb)
    );

    CREATE FUNCTION turas_knowledge_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'immutable knowledge audit or revision' USING ERRCODE='23514';
    END;
    $$;
    CREATE TRIGGER knowledge_revisions_immutable BEFORE UPDATE OR DELETE ON knowledge_revisions
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_immutable();
    CREATE TRIGGER knowledge_lineage_immutable BEFORE UPDATE OR DELETE ON knowledge_lineage
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_immutable();
    CREATE TRIGGER knowledge_decisions_immutable BEFORE UPDATE OR DELETE ON knowledge_decisions
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_immutable();
    CREATE TRIGGER knowledge_payloads_no_update BEFORE UPDATE ON knowledge_revision_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_immutable();

    CREATE FUNCTION turas_knowledge_publish_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE source_count integer;
    BEGIN
      IF NEW.state='published' THEN
        SELECT count(*) INTO source_count FROM knowledge_lineage
        WHERE revision_id=NEW.revision_id AND contribution_id=NEW.contribution_id;
        IF source_count NOT BETWEEN 1 AND 20 THEN
          RAISE EXCEPTION 'publication requires 1–20 lineage sources' USING ERRCODE='23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM knowledge_revision_payloads
          WHERE revision_id=NEW.revision_id) THEN
          RAISE EXCEPTION 'publication requires retained reviewed payload' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER knowledge_publish_lineage BEFORE INSERT OR UPDATE ON knowledge_publications
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_publish_lineage();
  `);
};

exports.down = () => {
  throw new Error('Shared knowledge requires forward repair');
};
