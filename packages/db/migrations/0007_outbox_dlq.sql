ALTER TABLE outbox_messages ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;
CREATE INDEX IF NOT EXISTS outbox_dead_letter_idx ON outbox_messages (dead_lettered_at, created_at);
