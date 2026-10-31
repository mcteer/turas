-- Explicit owner installation in a separate work-controlled recovery database.
-- Never execute this file from a request or against Turas's primary database.
BEGIN;
CREATE SCHEMA turas_backup;
CREATE TABLE turas_backup.contract (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version text NOT NULL CHECK(version='pilot-neon-archive-v1'),
 installation_id uuid NOT NULL,
 maximum_bytes bigint NOT NULL CHECK(maximum_bytes BETWEEN 1048576 AND 209715200)
);
CREATE TABLE turas_backup.archives (
 id uuid PRIMARY KEY,environment_id text NOT NULL,
 captured_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 ciphertext_digest text NOT NULL CHECK(ciphertext_digest ~ '^[a-f0-9]{64}$'),
 header_digest text NOT NULL CHECK(header_digest ~ '^[a-f0-9]{64}$'),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 68 AND 67108864),
 chunk_count integer NOT NULL CHECK(chunk_count BETWEEN 1 AND 64),
 CHECK(expires_at=captured_at+interval '168 hours')
);
CREATE TABLE turas_backup.chunks (
 archive_id uuid NOT NULL REFERENCES turas_backup.archives(id),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 63),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 1 AND 1048576),
 PRIMARY KEY(archive_id,ordinal)
);
CREATE FUNCTION turas_backup.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recovery archive bytes are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER archive_immutable BEFORE UPDATE ON turas_backup.archives
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
CREATE TRIGGER archive_chunk_immutable BEFORE UPDATE ON turas_backup.chunks
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
CREATE FUNCTION turas_backup.expiry_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expiry timestamptz;
BEGIN
 IF TG_TABLE_NAME='archives' THEN expiry:=OLD.expires_at;
 ELSE SELECT expires_at INTO STRICT expiry FROM turas_backup.archives WHERE id=OLD.archive_id; END IF;
 IF expiry>clock_timestamp() THEN RAISE EXCEPTION 'Managed recovery archive has not expired' USING ERRCODE='23514'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER archive_expiry BEFORE DELETE ON turas_backup.archives
 FOR EACH ROW EXECUTE FUNCTION turas_backup.expiry_fence();
CREATE TRIGGER archive_chunk_expiry BEFORE DELETE ON turas_backup.chunks
 FOR EACH ROW EXECUTE FUNCTION turas_backup.expiry_fence();
REVOKE ALL ON SCHEMA turas_backup FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA turas_backup FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA turas_backup FROM PUBLIC;
COMMIT;
