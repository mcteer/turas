exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE artifact_context_tool_reads (
      attempt_id uuid PRIMARY KEY REFERENCES response_attempts(id),
      read_count integer NOT NULL CHECK (read_count BETWEEN 1 AND 5),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

exports.down = () => {
  throw new Error('Artifact tool read budget requires forward repair');
};
