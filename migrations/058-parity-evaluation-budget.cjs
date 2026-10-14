exports.up = pgm => pgm.sql(`
 CREATE TABLE parity_evaluation_budgets(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),owner_principal_id uuid NOT NULL REFERENCES principals(id),
  cap_micro_usd bigint NOT NULL CHECK(cap_micro_usd BETWEEN 1 AND 15000000),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK(reserved_micro_usd>=0 AND reserved_micro_usd<=cap_micro_usd),
  pricing jsonb NOT NULL,expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK(state IN('open','closed','overrun')));
 CREATE TABLE parity_evaluation_operations(
  id uuid PRIMARY KEY,budget_id uuid NOT NULL REFERENCES parity_evaluation_budgets(id),
  provider text NOT NULL,ceiling_micro_usd bigint NOT NULL CHECK(ceiling_micro_usd>=0),
  actual_micro_usd bigint CHECK(actual_micro_usd>=0),created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz);
 GRANT SELECT ON parity_evaluation_budgets TO turas_runtime;
 GRANT UPDATE(reserved_micro_usd,state) ON parity_evaluation_budgets TO turas_runtime;
 GRANT SELECT,INSERT ON parity_evaluation_operations TO turas_runtime;
 GRANT UPDATE(actual_micro_usd,settled_at) ON parity_evaluation_operations TO turas_runtime;
`);
exports.down = () => { throw Error('Evaluation accounting requires forward recovery'); };
