-- Call recordings were uploaded between two transactions, and the first one
-- inserted the 'pending' row without an expiry. When the second transaction
-- failed after the upload, the job retried with a new copy, and the first
-- copy stayed 'pending' with no expiry and no call pointing at it. A retried
-- or concurrent job that did finish relinked the call to its own copy and
-- left the earlier one 'ready' with nothing pointing at it. No sweep ever
-- selected either kind, so they were kept past the plan's retention.
--
-- New recording rows get the 24-hour upload expiry until they are linked,
-- and only the copy that is linked becomes 'ready'. Give the existing orphans
-- the same expiry, counted from when they were created, and move the 'ready'
-- ones back to 'pending', so the expired-upload sweep deletes the object and
-- the row. A row created just before this migration still gets a full day to
-- be linked. Running this file again changes nothing.
--
-- The backfill needs a role that sees every row, like 0076.
DO $$
DECLARE
  expiring integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the orphaned recording expiry backfill: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  UPDATE public.storage_objects orphan
  SET status = 'pending', expires_at = orphan.created_at + interval '24 hours', updated_at = now()
  WHERE orphan.purpose = 'recording'
    AND orphan.status IN ('pending', 'ready')
    AND orphan.expires_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.calls c WHERE c.recording_object_id = orphan.id);
  GET DIAGNOSTICS expiring = ROW_COUNT;

  RAISE NOTICE 'Call recordings: % orphaned copies given an upload expiry.', expiring;
END
$$;
