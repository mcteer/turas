exports.up = pgm => pgm.sql(`
 ALTER TABLE memberships ADD CONSTRAINT mcp_membership_identity UNIQUE(id,principal_id,workspace_id);
 CREATE TABLE mcp_connections(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),principal_id uuid NOT NULL,membership_id uuid NOT NULL,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  categories text[] NOT NULL CHECK(cardinality(categories) BETWEEN 1 AND 5 AND categories <@ ARRAY['profiles','evidence','knowledge','plans','reports']::text[]),
  scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),
  credential_hash text CHECK(credential_hash ~ '^[a-f0-9]{64}$'),
  creation_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  revoked_at timestamptz,revoker_membership_id uuid,last_used_at timestamptz,
  FOREIGN KEY(membership_id,principal_id,workspace_id) REFERENCES memberships(id,principal_id,workspace_id),
  FOREIGN KEY(revoker_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
  UNIQUE(id,environment_id,workspace_id,principal_id,membership_id),UNIQUE(id,workspace_id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days'),
  CHECK((revoked_at IS NULL)=(revoker_membership_id IS NULL)));
 CREATE INDEX mcp_active_connections ON mcp_connections(environment_id,workspace_id,membership_id,expires_at) WHERE revoked_at IS NULL;
 CREATE FUNCTION turas_mcp_connection_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MCP identity is permanent' USING ERRCODE='23514';END IF;
  IF (to_jsonb(NEW)-ARRAY['credential_hash','revoked_at','revoker_membership_id','last_used_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['credential_hash','revoked_at','revoker_membership_id','last_used_at']) OR
     (OLD.credential_hash IS NULL AND NEW.credential_hash IS NOT NULL) OR
     (NEW.credential_hash IS NOT NULL AND NEW.credential_hash IS DISTINCT FROM OLD.credential_hash) OR
     (OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoker_membership_id IS DISTINCT FROM OLD.revoker_membership_id)) THEN
   RAISE EXCEPTION 'MCP authority cannot be widened or restored' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER mcp_connection_identity BEFORE UPDATE OR DELETE ON mcp_connections FOR EACH ROW EXECUTE FUNCTION turas_mcp_connection_identity();
 CREATE TABLE mcp_connection_customers(
  connection_id uuid NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,
  PRIMARY KEY(connection_id,customer_id),FOREIGN KEY(connection_id,workspace_id) REFERENCES mcp_connections(id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id));
 CREATE FUNCTION turas_mcp_customer_ceiling() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM mcp_connections WHERE id=NEW.connection_id AND workspace_id=NEW.workspace_id AND creation_xid=pg_current_xact_id())
   OR(SELECT count(*) FROM mcp_connection_customers WHERE connection_id=NEW.connection_id)>=100 THEN
   RAISE EXCEPTION 'MCP ceiling is sealed or exceeds its bound' USING ERRCODE='23514';END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER mcp_customer_ceiling BEFORE INSERT ON mcp_connection_customers FOR EACH ROW EXECUTE FUNCTION turas_mcp_customer_ceiling();
 CREATE FUNCTION turas_mcp_scope_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF cardinality(NEW.categories)<>(SELECT count(DISTINCT category) FROM unnest(NEW.categories) AS category)
   OR(NEW.categories<>ARRAY['knowledge']::text[] AND NOT EXISTS(SELECT 1 FROM mcp_connection_customers WHERE connection_id=NEW.id)) THEN
   RAISE EXCEPTION 'MCP requires distinct complete scope' USING ERRCODE='23514';END IF;RETURN NEW;
 END $$;
 CREATE CONSTRAINT TRIGGER mcp_scope_complete AFTER INSERT ON mcp_connections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION turas_mcp_scope_complete();
 CREATE TABLE mcp_handles(
  handle_hash text PRIMARY KEY CHECK(handle_hash ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK(kind IN('cursor','citation')),environment_id text NOT NULL,workspace_id uuid NOT NULL,
  principal_id uuid NOT NULL,membership_id uuid NOT NULL,connection_id uuid NOT NULL,
  category text NOT NULL CHECK(category IN('profiles','evidence','knowledge','plans','reports')),
  customer_id uuid,section text NOT NULL CHECK(length(section) BETWEEN 1 AND 80),
  scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),filter_digest text NOT NULL CHECK(filter_digest ~ '^[a-f0-9]{64}$'),
  position_id uuid,revision_id uuid,generation bigint CHECK(generation BETWEEN 1 AND 9007199254740991),
  passage_id uuid,content_digest text CHECK(content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  FOREIGN KEY(connection_id,environment_id,workspace_id,principal_id,membership_id) REFERENCES mcp_connections(id,environment_id,workspace_id,principal_id,membership_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'));
 CREATE INDEX mcp_handle_expiry ON mcp_handles(expires_at);
 CREATE TABLE mcp_rate_windows(
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  bucket text NOT NULL CHECK(bucket IN('connection','member','workspace','management_member','management_workspace')),
  subject_id uuid NOT NULL,window_start timestamptz NOT NULL,count integer NOT NULL CHECK(count BETWEEN 0 AND 241),
  PRIMARY KEY(environment_id,workspace_id,bucket,subject_id,window_start));
 CREATE TABLE mcp_read_leases(
  id uuid PRIMARY KEY,connection_id uuid NOT NULL,environment_id text NOT NULL,workspace_id uuid NOT NULL,principal_id uuid NOT NULL,membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  FOREIGN KEY(connection_id,environment_id,workspace_id,principal_id,membership_id) REFERENCES mcp_connections(id,environment_id,workspace_id,principal_id,membership_id),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 seconds'));
 CREATE INDEX mcp_lease_admission ON mcp_read_leases(environment_id,workspace_id,expires_at,membership_id,connection_id);
 CREATE TABLE mcp_management_receipts(
  request_key uuid NOT NULL,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,connection_id uuid NOT NULL,action text NOT NULL CHECK(action IN('create','revoke')),
  request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,workspace_id,actor_membership_id,request_key),
  FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
  FOREIGN KEY(connection_id,workspace_id) REFERENCES mcp_connections(id,workspace_id));
 CREATE TABLE mcp_access_receipts(
  id uuid PRIMARY KEY,connection_id uuid NOT NULL,environment_id text NOT NULL,workspace_id uuid NOT NULL,principal_id uuid NOT NULL,membership_id uuid NOT NULL,
  operation text NOT NULL CHECK(operation IN('identity','customers','profiles','evidence','knowledge','plans','reports','discovery','denied')),
  result text NOT NULL CHECK(result IN('available','empty','unavailable','invalid_input','forbidden','limited','failed')),
  duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 10000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(connection_id,environment_id,workspace_id,principal_id,membership_id) REFERENCES mcp_connections(id,environment_id,workspace_id,principal_id,membership_id));
 CREATE INDEX mcp_audit_owner ON mcp_access_receipts(connection_id,created_at,id);
 CREATE TABLE mcp_management_cursors(
  handle_hash text PRIMARY KEY CHECK(handle_hash ~ '^[a-f0-9]{64}$'),environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL,principal_id uuid NOT NULL,membership_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('own','admin','usage')),connection_id uuid,position_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  FOREIGN KEY(membership_id,principal_id,workspace_id) REFERENCES memberships(id,principal_id,workspace_id),
  FOREIGN KEY(connection_id,workspace_id) REFERENCES mcp_connections(id,workspace_id),
  CHECK((kind='usage')=(connection_id IS NOT NULL)),CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'));
 CREATE FUNCTION turas_mcp_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'MCP binding is immutable' USING ERRCODE='23514';
 END $$;
 CREATE TRIGGER mcp_management_cursor_immutable BEFORE UPDATE ON mcp_management_cursors FOR EACH ROW EXECUTE FUNCTION turas_mcp_immutable();
 CREATE TRIGGER mcp_customer_immutable BEFORE UPDATE OR DELETE ON mcp_connection_customers FOR EACH ROW EXECUTE FUNCTION turas_mcp_immutable();
 CREATE TRIGGER mcp_handle_immutable BEFORE UPDATE ON mcp_handles FOR EACH ROW EXECUTE FUNCTION turas_mcp_immutable();
 CREATE TRIGGER mcp_management_immutable BEFORE UPDATE OR DELETE ON mcp_management_receipts FOR EACH ROW EXECUTE FUNCTION turas_mcp_immutable();
 CREATE TRIGGER mcp_access_immutable BEFORE UPDATE ON mcp_access_receipts FOR EACH ROW EXECUTE FUNCTION turas_mcp_immutable();
`);
