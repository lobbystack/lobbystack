-- Until #165, every recurring maintenance job recorded a workflow.started
-- product event on each tick, about 59k rows a day across tenants. The flood
-- stopped on 2026-09-21, but its rows, already delivered to PostHog, still make
-- up almost all of product_events. Deleting them would not shrink the table's
-- files, and the host bills the cached pages of those files as Postgres memory,
-- so this copies the rows worth keeping, truncates the table, and puts them back.
--
-- The rewrite needs a role that sees every row. Under row-level security the
-- copy would hold a filtered subset and TRUNCATE would lose the rest, so any
-- other role skips it. Production migrates as the table owner's superuser.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the product_events rewrite: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  -- Writers wait for the few milliseconds the copy takes instead of inserting
  -- rows the TRUNCATE would drop.
  LOCK TABLE public.product_events IN ACCESS EXCLUSIVE MODE;

  CREATE TEMP TABLE product_events_keep ON COMMIT DROP AS
    SELECT * FROM public.product_events
    WHERE NOT (
      name = 'workflow.started'
      AND sent_at IS NOT NULL
      AND properties->>'workflowName' IN (
        'privacy.scrubMessage',
        'privacy.cleanupPendingUpload',
        'calendar.reconcileBusiness',
        'phoneNumber.reclaim',
        'notification.dailySummary',
        'telemetry.flush',
        'outbox.backlogSample',
        'billing.refreshUnitEconomics',
        'api.retention'
      )
    );

  TRUNCATE public.product_events;
  INSERT INTO public.product_events SELECT * FROM product_events_keep;
END $$;
