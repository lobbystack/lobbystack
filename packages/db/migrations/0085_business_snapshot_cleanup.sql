-- Every snapshot refresh inserted a new business_context_snapshots row and kept
-- the old ones, though readers only use the newest row per business. A website
-- import added one row per page, and the older rows kept snippets the operator
-- had deleted. Refreshes now delete the older rows; this removes the ones left
-- by earlier refreshes. Running this file again changes nothing.
--
-- The cleanup needs a role that sees every row, like 0072.
DO $$
DECLARE
  removed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE NOTICE 'Skipping the business snapshot cleanup: % is subject to row-level security.', current_user;
    RETURN;
  END IF;

  DELETE FROM public.business_context_snapshots older
  WHERE EXISTS (
    SELECT 1 FROM public.business_context_snapshots newer
    WHERE newer.business_id = older.business_id
      AND newer.generated_at > older.generated_at
  );
  GET DIAGNOSTICS removed = ROW_COUNT;

  RAISE NOTICE 'Business context snapshots: % older rows deleted.', removed;
END
$$;
