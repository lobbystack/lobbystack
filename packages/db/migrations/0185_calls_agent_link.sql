-- Which agent answered a call. Nothing here reads the table: the column has no
-- default, and the foreign key and the check are NOT VALID, so the lock lasts
-- only as long as the catalog change, whatever the table's size. The file has
-- this table alone, so that the lock on calls ends before 0186 waits for one
-- on conversations.
--
-- Old rows keep a null agent_id until the batched backfill that `migrate` runs
-- last reaches them, or until something updates them, when the trigger fills
-- it so that the check passes. See 0184 for the deferred foreign key.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  DROP CONSTRAINT IF EXISTS calls_agent_fk,
  DROP CONSTRAINT IF EXISTS calls_agent_id_present;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT calls_agent_id_present CHECK (agent_id IS NOT NULL) NOT VALID;
DROP TRIGGER IF EXISTS calls_assign_agent ON public.calls;
CREATE TRIGGER calls_assign_agent
  BEFORE INSERT OR UPDATE ON public.calls
  FOR EACH ROW WHEN (NEW.agent_id IS NULL) EXECUTE FUNCTION app.assign_default_agent();
