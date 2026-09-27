exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE login_sessions (
      id uuid PRIMARY KEY,
      principal_id uuid NOT NULL REFERENCES principals(id),
      token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      CHECK (expires_at > created_at),
      CHECK (revoked_at IS NULL OR revoked_at >= created_at)
    );
    CREATE INDEX login_sessions_principal_active_idx
      ON login_sessions (principal_id, expires_at) WHERE revoked_at IS NULL;

    CREATE TABLE rate_windows (
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
      category text NOT NULL CHECK (length(category) > 0),
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
      expires_at timestamptz NOT NULL,
      PRIMARY KEY (environment_id, key_hash, category, window_start),
      CHECK (expires_at > window_start)
    );
    CREATE INDEX rate_windows_expiry_idx ON rate_windows (expires_at);
  `);
};
