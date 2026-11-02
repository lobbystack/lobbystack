-- An archived agent answers nothing, so an agent can't be archived while a
-- channel still points at it, and the default agent can't be archived at all.
-- The same rule runs from the other side: a channel can't move to an archived
-- agent, or come back to life on one.
--
-- A channel counts until it can't answer again without someone setting it up:
-- a number until it's reclaimed or released, a widget key until it's revoked,
-- so a disabled widget still counts, and an Instagram account for as long as
-- it's connected or needs reconnecting. Disconnecting removes its row.
--
-- Two transactions can't slip past each other. An update of an agent locks its
-- row before the trigger runs, and the channel trigger takes FOR SHARE on that
-- row, so whichever comes second waits and then sees what the first committed.
--
-- Both run as their owner, so a limited operator's RLS context can't hide a
-- channel from the check. Errors name a constraint for slice 5 to translate.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION app.guard_agent_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.is_default THEN
    RAISE EXCEPTION 'The default agent can''t be archived.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agents_default_not_archived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.phone_numbers channel WHERE channel.business_id = NEW.business_id AND channel.agent_id = NEW.id AND channel.status NOT IN ('reclaimed', 'released'))
    OR EXISTS (SELECT 1 FROM public.widget_keys channel WHERE channel.business_id = NEW.business_id AND channel.agent_id = NEW.id AND channel.status <> 'revoked')
    OR EXISTS (SELECT 1 FROM public.instagram_accounts channel WHERE channel.business_id = NEW.business_id AND channel.agent_id = NEW.id)
  THEN
    RAISE EXCEPTION 'An agent with an active channel can''t be archived.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agents_archived_without_channels';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.guard_agent_archive() FROM PUBLIC;

DROP TRIGGER IF EXISTS agents_guard_archive ON public.agents;
CREATE TRIGGER agents_guard_archive
  BEFORE INSERT OR UPDATE OF archived_at, is_default ON public.agents
  FOR EACH ROW WHEN (NEW.archived_at IS NOT NULL) EXECUTE FUNCTION app.guard_agent_archive();

CREATE OR REPLACE FUNCTION app.guard_channel_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_archived_at timestamptz;
BEGIN
  IF (TG_TABLE_NAME = 'phone_numbers' AND NEW.status IN ('reclaimed', 'released'))
    OR (TG_TABLE_NAME = 'widget_keys' AND NEW.status = 'revoked')
  THEN
    RETURN NEW;
  END IF;
  SELECT agent.archived_at INTO v_archived_at FROM public.agents agent WHERE agent.id = NEW.agent_id FOR SHARE;
  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'An archived agent can''t have an active channel.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'agents_archived_without_channels';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.guard_channel_agent() FROM PUBLIC;

-- These sort after *_assign_agent, so agent_id is already filled when they run.
DROP TRIGGER IF EXISTS phone_numbers_guard_agent ON public.phone_numbers;
CREATE TRIGGER phone_numbers_guard_agent
  BEFORE INSERT OR UPDATE OF agent_id, status ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION app.guard_channel_agent();

DROP TRIGGER IF EXISTS widget_keys_guard_agent ON public.widget_keys;
CREATE TRIGGER widget_keys_guard_agent
  BEFORE INSERT OR UPDATE OF agent_id, status ON public.widget_keys
  FOR EACH ROW EXECUTE FUNCTION app.guard_channel_agent();

DROP TRIGGER IF EXISTS instagram_accounts_guard_agent ON public.instagram_accounts;
CREATE TRIGGER instagram_accounts_guard_agent
  BEFORE INSERT OR UPDATE OF agent_id, status ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION app.guard_channel_agent();
