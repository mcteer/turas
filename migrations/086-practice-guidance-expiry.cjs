exports.up=pgm=>pgm.sql(`
 -- Active freshness accounting is separate from the append-only withdrawal ledger.
 -- No source prose, company name, URL or private research query is stored here.
 CREATE TABLE ordinary_practice_guidance_reads(
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customer_references(id),
  scope_key text GENERATED ALWAYS AS(COALESCE(customer_id::text,'workspace')) STORED,
  snapshot_id text NOT NULL CHECK(snapshot_id ~ '^[a-f0-9]{64}$'),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id) ON DELETE CASCADE,
  valid_until timestamptz NOT NULL,
  retired_refresh_id uuid REFERENCES ordinary_context_refreshes(id),
  PRIMARY KEY(conversation_id,scope_key,snapshot_id)
 );
 CREATE INDEX ordinary_practice_guidance_active ON ordinary_practice_guidance_reads(conversation_id,valid_until)
  WHERE retired_refresh_id IS NULL;
 -- Pre086 readers did not record current-vs-history intent. Conservatively
 -- request a fresh read before reusing their retained tool text as current.
 INSERT INTO ordinary_practice_guidance_reads(conversation_id,customer_id,snapshot_id,attempt_id,valid_until)
  SELECT d.conversation_id,d.customer_id,substring(d.citation_id FROM 17),a.id,clock_timestamp()-interval '1 second'
  FROM ordinary_named_content_dependencies d
  JOIN LATERAL(SELECT id FROM response_attempts WHERE conversation_id=d.conversation_id
   ORDER BY (id=d.first_attempt_id) DESC,created_at,id LIMIT 1) a ON true
  WHERE d.citation_id LIKE 'public_practice:%';
 CREATE FUNCTION turas_practice_guidance_capacity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF(SELECT count(*) FROM ordinary_practice_guidance_reads WHERE conversation_id=NEW.conversation_id)>1000 THEN
   RAISE EXCEPTION 'Practice guidance context capacity exceeded' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_practice_guidance_capacity() FROM PUBLIC;
 CREATE TRIGGER practice_guidance_capacity AFTER INSERT ON ordinary_practice_guidance_reads
  FOR EACH ROW EXECUTE FUNCTION turas_practice_guidance_capacity();
 REVOKE ALL ON ordinary_practice_guidance_reads FROM turas_runtime;
 GRANT SELECT,INSERT,UPDATE ON ordinary_practice_guidance_reads TO turas_runtime;
 UPDATE turas_environment SET schema_version=86 WHERE schema_version=85;
`);
exports.down=()=>{throw Error('Practice guidance expiry requires explicit forward recovery');};
