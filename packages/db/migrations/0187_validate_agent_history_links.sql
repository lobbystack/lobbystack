-- 0185 and 0186 add these foreign keys NOT VALID. Validating them here takes
-- only a SHARE UPDATE EXCLUSIVE lock, so calls and conversations can still be
-- written meanwhile. It reads each table once, and the rows that exist before
-- the backfill have no agent_id to check. The backfill's own writes are checked
-- as they happen. A key that is already valid makes this a no-op.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.calls VALIDATE CONSTRAINT calls_agent_fk;
ALTER TABLE public.conversations VALIDATE CONSTRAINT conversations_agent_fk;
