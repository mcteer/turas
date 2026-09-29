exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE retrieval_passages ADD CONSTRAINT retrieval_passage_exact_unique
      UNIQUE (id,source_id,passage_digest);
    ALTER TABLE retrieval_sources ADD CONSTRAINT retrieval_source_exact_unique
      UNIQUE (id,source_kind,source_revision_id,source_generation,projection_contract);

    CREATE FUNCTION turas_retrieval_locators_valid(value jsonb) RETURNS boolean
      LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE locator jsonb;
    BEGIN
      IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value) NOT BETWEEN 1 AND 50 THEN
        RETURN false;
      END IF;
      FOR locator IN SELECT item FROM jsonb_array_elements(value) AS item LOOP
        IF jsonb_typeof(locator) <> 'object' OR locator->>'kind' NOT IN
          ('profile_field','artifact_unit','research_passage','shared_field') THEN
          RETURN false;
        END IF;
        IF locator->>'kind' IN ('profile_field','shared_field') AND
          coalesce(length(locator->>'fieldPath'),0) NOT BETWEEN 1 AND 300 THEN
          RETURN false;
        END IF;
        IF locator->>'kind' IN ('artifact_unit','research_passage','shared_field') THEN
          IF (locator->>'start') !~ '^[0-9]+$' OR
            (locator->>'end') !~ '^[0-9]+$' OR
            (locator->>'start')::integer >= (locator->>'end')::integer THEN
            RETURN false;
          END IF;
        END IF;
        IF locator->>'kind'='artifact_unit' AND
          (coalesce(locator->>'unitId','') !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
            jsonb_typeof(locator->'original') <> 'object') THEN
          RETURN false;
        END IF;
        IF locator->>'kind'='research_passage' AND
          coalesce(locator->>'canonicalUrl','') !~ '^https://[^/ ]+' THEN
          RETURN false;
        END IF;
      END LOOP;
      RETURN true;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN false;
    END;
    $$;

    CREATE TABLE retrieval_receipts (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      conversation_id uuid REFERENCES conversations(id),
      scope text NOT NULL CHECK (scope IN ('customer','shared','combined')),
      workspace_id uuid REFERENCES workspaces(id),
      customer_id uuid,
      mode text NOT NULL CHECK (mode IN ('hybrid','lexical_degraded')),
      embedding_contract text CHECK
        (embedding_contract IS NULL OR embedding_contract='embedding-v1'),
      citation_ids jsonb NOT NULL CHECK
        (jsonb_typeof(citation_ids)='array' AND jsonb_array_length(citation_ids) <= 10),
      as_of timestamptz NOT NULL,
      valid_until timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (customer_id,workspace_id)
        REFERENCES customer_references(id,workspace_id),
      CHECK ((scope='shared' AND workspace_id IS NULL AND customer_id IS NULL)
        OR (scope IN ('customer','combined') AND workspace_id IS NOT NULL
          AND customer_id IS NOT NULL)),
      CHECK (valid_until > as_of)
    );
    CREATE INDEX retrieval_receipts_actor_idx ON retrieval_receipts
      (environment_id,actor_membership_id,created_at DESC);

    CREATE TABLE retrieval_receipt_sources (
      id uuid PRIMARY KEY,
      receipt_id uuid NOT NULL REFERENCES retrieval_receipts(id),
      ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 10),
      source_id uuid NOT NULL,
      passage_id uuid NOT NULL,
      source_kind text NOT NULL CHECK
        (source_kind IN ('accepted_profile','approved_excerpt','verified_research','published_shared')),
      source_revision_id uuid NOT NULL,
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      passage_digest text NOT NULL CHECK (passage_digest ~ '^[0-9a-f]{64}$'),
      projection_contract text NOT NULL CHECK (length(projection_contract) BETWEEN 1 AND 128),
      locators jsonb NOT NULL CHECK (turas_retrieval_locators_valid(locators)),
      valid_until timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (receipt_id,ordinal),
      UNIQUE (receipt_id,source_id,passage_id),
      FOREIGN KEY (source_id,source_kind,source_revision_id,source_generation,projection_contract)
        REFERENCES retrieval_sources(id,source_kind,source_revision_id,source_generation,projection_contract)
    );
    CREATE INDEX retrieval_receipt_sources_source_idx ON retrieval_receipt_sources
      (source_id,source_generation,valid_until);

    CREATE FUNCTION turas_retrieval_receipt_source_checked() RETURNS trigger
      LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM retrieval_passages p
        WHERE p.id=NEW.passage_id AND p.source_id=NEW.source_id
          AND p.passage_digest=NEW.passage_digest AND p.locators=NEW.locators)
        OR NOT EXISTS (SELECT 1 FROM retrieval_sources s
          WHERE s.id=NEW.source_id AND s.lifecycle_state='current') THEN
        RAISE EXCEPTION 'retrieval citation source changed' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER retrieval_receipt_source_checked
      BEFORE INSERT ON retrieval_receipt_sources FOR EACH ROW
      EXECUTE FUNCTION turas_retrieval_receipt_source_checked();

    CREATE TABLE session_evidence_dependencies (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      session_id text NOT NULL CHECK (length(session_id) BETWEEN 1 AND 300),
      receipt_id uuid NOT NULL REFERENCES retrieval_receipts(id),
      source_kind text NOT NULL CHECK
        (source_kind IN ('accepted_profile','approved_excerpt','verified_research','published_shared')),
      source_revision_id uuid NOT NULL,
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
      valid_until timestamptz NOT NULL,
      consumed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (session_id,source_kind,source_revision_id,source_generation),
      CHECK (valid_until > consumed_at)
    );
    CREATE INDEX session_evidence_dependencies_conversation_idx ON
      session_evidence_dependencies(conversation_id,valid_until);

    CREATE FUNCTION turas_retrieval_session_matches() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM conversations c
        WHERE c.id=NEW.conversation_id AND c.eve_session_id=NEW.session_id
          AND c.environment_id=NEW.environment_id) THEN
        RAISE EXCEPTION 'retrieval dependency session mismatch' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER retrieval_session_matches BEFORE INSERT ON session_evidence_dependencies
      FOR EACH ROW EXECUTE FUNCTION turas_retrieval_session_matches();

    CREATE FUNCTION turas_retrieval_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'retrieval receipt is append-only' USING ERRCODE='23514';
    END;
    $$;
    CREATE TRIGGER retrieval_receipts_immutable BEFORE UPDATE OR DELETE ON retrieval_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_retrieval_receipt_immutable();
    CREATE TRIGGER retrieval_receipt_sources_immutable BEFORE UPDATE OR DELETE ON retrieval_receipt_sources
      FOR EACH ROW EXECUTE FUNCTION turas_retrieval_receipt_immutable();
    CREATE TRIGGER session_evidence_dependencies_immutable BEFORE UPDATE OR DELETE ON session_evidence_dependencies
      FOR EACH ROW EXECUTE FUNCTION turas_retrieval_receipt_immutable();
  `);
};

exports.down = () => {
  throw new Error('Retrieval context fences require forward repair');
};
