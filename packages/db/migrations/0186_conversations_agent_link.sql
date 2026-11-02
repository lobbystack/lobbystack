-- Which agent holds a conversation, added as 0185 adds it to calls.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  DROP CONSTRAINT IF EXISTS conversations_agent_fk,
  DROP CONSTRAINT IF EXISTS conversations_agent_id_present;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_agent_fk FOREIGN KEY (business_id, agent_id) REFERENCES public.agents (business_id, id) DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT conversations_agent_id_present CHECK (agent_id IS NOT NULL) NOT VALID;
DROP TRIGGER IF EXISTS conversations_assign_agent ON public.conversations;
CREATE TRIGGER conversations_assign_agent
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW WHEN (NEW.agent_id IS NULL) EXECUTE FUNCTION app.assign_default_agent();

-- Deleting a business sets contact_id and conversation_id to null on calls and
-- conversations that the same delete hasn't reached yet. On a row the backfill
-- hasn't filled, by which time the agent may be gone, the check would refuse
-- that update and stop the deletion. So the rows get their agent first. Once
-- the backfill is done this finds nothing. Slice 8 drops it with the trigger.
CREATE OR REPLACE FUNCTION app.assign_agent_before_business_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE public.calls SET agent_id = app.default_agent_id(OLD.id) WHERE business_id = OLD.id AND agent_id IS NULL;
  UPDATE public.conversations SET agent_id = app.default_agent_id(OLD.id) WHERE business_id = OLD.id AND agent_id IS NULL;
  RETURN OLD;
END
$$;
REVOKE ALL ON FUNCTION app.assign_agent_before_business_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_assign_agent_before_delete ON public.businesses;
CREATE TRIGGER businesses_assign_agent_before_delete
  BEFORE DELETE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION app.assign_agent_before_business_delete();
