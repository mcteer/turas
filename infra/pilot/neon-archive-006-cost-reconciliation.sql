-- Explicit independent owner migration; no request handler runs migrations.
BEGIN;
CREATE TABLE turas_backup.cost_reconciliations(
 id uuid PRIMARY KEY,reservation_id uuid NOT NULL UNIQUE REFERENCES turas_backup.cost_reservations(id),
 installation_id uuid NOT NULL,environment_id text NOT NULL,
 operation_digest text NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
 charged_micro_usd bigint NOT NULL CHECK(charged_micro_usd BETWEEN 0 AND 1000000000),
 charge_kind text NOT NULL CHECK(charge_kind='estimate'),
 charge_evidence_digest text NOT NULL CHECK(charge_evidence_digest ~ '^[a-f0-9]{64}$'),
 operator_review_digest text NOT NULL CHECK(operator_review_digest ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TRIGGER cost_reconciliation_immutable BEFORE UPDATE OR DELETE ON turas_backup.cost_reconciliations
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
CREATE FUNCTION turas_backup.unknown_cost_review_fence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state='unknown' AND NEW.state='settled' AND NOT EXISTS(
  SELECT 1 FROM turas_backup.cost_reconciliations r JOIN turas_backup.cost_budgets b ON b.id=OLD.budget_id
  WHERE r.reservation_id=OLD.id AND r.installation_id=b.installation_id AND r.environment_id=b.environment_id
   AND r.operation_digest=OLD.operation_digest AND r.charged_micro_usd=OLD.upper_bound_micro_usd
   AND NEW.charged_micro_usd=r.charged_micro_usd AND NEW.charge_kind=r.charge_kind) THEN
  RAISE EXCEPTION 'Explicit immutable work cost review required' USING ERRCODE='23514';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER unknown_cost_review_fence BEFORE UPDATE ON turas_backup.cost_reservations
 FOR EACH ROW EXECUTE FUNCTION turas_backup.unknown_cost_review_fence();
REVOKE ALL ON turas_backup.cost_reconciliations FROM PUBLIC;
REVOKE ALL ON FUNCTION turas_backup.unknown_cost_review_fence() FROM PUBLIC;
COMMIT;
