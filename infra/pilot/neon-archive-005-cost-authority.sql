-- Explicit independent operator installation; never run inside a handler.
BEGIN;
CREATE TABLE turas_backup.cost_budgets (
 id uuid PRIMARY KEY,installation_id uuid NOT NULL,environment_id text NOT NULL,
 category text NOT NULL CHECK(category IN('hosting','blob')),
 authorization_digest text NOT NULL CHECK(authorization_digest ~ '^[a-f0-9]{64}$'),
 scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),
 pricing_digest text NOT NULL CHECK(pricing_digest ~ '^[a-f0-9]{64}$'),
 cap_micro_usd bigint NOT NULL CHECK(cap_micro_usd BETWEEN 1 AND 1000000000),
 expires_at timestamptz NOT NULL,
 UNIQUE(authorization_digest,category)
);
CREATE TABLE turas_backup.cost_reservations (
 id uuid PRIMARY KEY,budget_id uuid NOT NULL REFERENCES turas_backup.cost_budgets(id),
 operation_digest text NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
 upper_bound_micro_usd bigint NOT NULL CHECK(upper_bound_micro_usd BETWEEN 0 AND 1000000000),
 state text NOT NULL CHECK(state IN('reserved','dispatched','unknown','settled','released')),
 charged_micro_usd bigint CHECK(charged_micro_usd BETWEEN 0 AND 1000000000),
 charge_kind text CHECK(charge_kind IN('actual','estimate')),
 UNIQUE(budget_id,operation_digest),
 CHECK((state='settled' AND charged_micro_usd IS NOT NULL AND charge_kind IS NOT NULL)
  OR (state<>'settled' AND charged_micro_usd IS NULL AND charge_kind IS NULL))
);
CREATE TRIGGER cost_budget_immutable BEFORE UPDATE OR DELETE ON turas_backup.cost_budgets
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
CREATE FUNCTION turas_backup.cost_reservation_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.budget_id<>OLD.budget_id
  OR NEW.operation_digest<>OLD.operation_digest OR NEW.upper_bound_micro_usd<>OLD.upper_bound_micro_usd
  OR NOT ((OLD.state='reserved' AND NEW.state IN('dispatched','released'))
   OR (OLD.state='dispatched' AND NEW.state IN('settled','unknown'))
   OR (OLD.state='unknown' AND NEW.state='settled')) THEN
  RAISE EXCEPTION 'Work cost reconciliation boundary required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_reservation_fence BEFORE UPDATE OR DELETE ON turas_backup.cost_reservations
 FOR EACH ROW EXECUTE FUNCTION turas_backup.cost_reservation_fence();
REVOKE ALL ON turas_backup.cost_budgets,turas_backup.cost_reservations FROM PUBLIC;
REVOKE ALL ON FUNCTION turas_backup.cost_reservation_fence() FROM PUBLIC;
COMMIT;
