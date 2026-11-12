-- Slice 8 of docs/specs/multi-agent-build.md removes what kept older releases
-- working while agents arrived. This file removes the parts that the previous
-- release no longer needs, and makes the channel and rule links NOT NULL, the
-- second half of the two-release NOT NULL that 0184 started.
--
-- What stays, and why: the previous release inserts phone numbers, widget keys
-- and Instagram accounts without agent_id, and may insert a call whose
-- conversation has none, so the triggers that fill agent_id on those tables
-- stay until the release after this one. calls and conversations may still hold
-- rows from before 0185 and 0186 in production, so their checks stay NOT VALID,
-- and businesses_assign_agent_before_delete and the batched backfill stay until
-- `db:backfill-agent-links` reports none left.

SET LOCAL lock_timeout = '5s';

-- Nothing has called the two-argument alias since the founder check-in
-- stopped, and the previous release doesn't either.
DROP FUNCTION IF EXISTS app.resolve_onboarding_followup_recipient(uuid, timestamptz);

-- 0208 kept pages that the release before it crawled in their import's scope.
-- The previous release names the website and agent on every page it saves.
DROP TRIGGER IF EXISTS knowledge_documents_scope_crawled_page ON public.knowledge_documents;
DROP FUNCTION IF EXISTS app.scope_crawled_page_like_its_import();

-- 0184 filled these four tables in the migration, and the trigger has filled
-- every write since, so no row is null. Validating reads each table under a
-- lock that lets writes through. With the check valid, SET NOT NULL skips its
-- own scan, so its stronger lock lasts only as long as the catalog change.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['phone_numbers', 'widget_keys', 'instagram_accounts', 'agent_rules'] LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', v_table)::regclass AND conname = v_table || '_agent_id_present') THEN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', v_table, v_table || '_agent_id_present');
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN agent_id SET NOT NULL', v_table);
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_table || '_agent_id_present');
    END IF;
  END LOOP;
END
$$;

-- Every rule insert in the previous release names its agent: the rules API,
-- a new business's channel rules, a new agent's copied rules, and 0203's
-- functions. So agent_rules no longer needs its trigger.
DROP TRIGGER IF EXISTS agent_rules_assign_agent ON public.agent_rules;
