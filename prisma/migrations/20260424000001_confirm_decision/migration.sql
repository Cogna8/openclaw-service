CREATE TYPE decision_resolution_t AS ENUM (
  'allow_once',
  'allow_always',
  'deny',
  'timeout',
  'cancelled'
);

ALTER TABLE evaluation_events
  ADD COLUMN resolution decision_resolution_t NULL,
  ADD COLUMN resolved_at TIMESTAMPTZ NULL;

CREATE INDEX idx_evaluation_events_confirm
  ON evaluation_events (account_id, created_at)
  WHERE decision = 'confirm';
