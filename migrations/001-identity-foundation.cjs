exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE turas_environment (
      singleton_id boolean PRIMARY KEY DEFAULT true CHECK (singleton_id),
      environment_id text NOT NULL UNIQUE CHECK (length(environment_id) > 0),
      schema_version integer NOT NULL CHECK (schema_version >= 1)
    );

    CREATE TABLE principals (
      id uuid PRIMARY KEY,
      login_name text NOT NULL UNIQUE CHECK (length(trim(login_name)) > 0),
      display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
      active boolean NOT NULL DEFAULT true,
      revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE workspaces (
      id uuid PRIMARY KEY,
      name text NOT NULL CHECK (length(trim(name)) > 0),
      active boolean NOT NULL DEFAULT true
    );

    CREATE TABLE partner_organizations (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      name text NOT NULL CHECK (length(trim(name)) > 0),
      active boolean NOT NULL DEFAULT true,
      UNIQUE (id, workspace_id)
    );

    CREATE TABLE memberships (
      id uuid PRIMARY KEY,
      principal_id uuid NOT NULL REFERENCES principals(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      kind text NOT NULL CHECK (kind IN ('internal', 'partner')),
      partner_org_id uuid,
      role text NOT NULL CHECK (role IN ('admin', 'member')),
      active boolean NOT NULL DEFAULT true,
      revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
      UNIQUE (principal_id, workspace_id),
      FOREIGN KEY (partner_org_id, workspace_id)
        REFERENCES partner_organizations(id, workspace_id),
      CHECK ((kind = 'partner') = (partner_org_id IS NOT NULL)),
      CHECK (role <> 'admin' OR kind = 'internal')
    );

    CREATE INDEX memberships_workspace_active_idx
      ON memberships (workspace_id, active, principal_id);
    CREATE INDEX partner_organizations_workspace_active_idx
      ON partner_organizations (workspace_id, active);
  `);
};
