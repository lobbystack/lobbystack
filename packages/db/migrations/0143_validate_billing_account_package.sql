-- 0142 adds this foreign key NOT VALID. Validating it here takes only a SHARE
-- UPDATE EXCLUSIVE lock, so billing accounts can still be written meanwhile,
-- and only the few rows with a package have anything to check. A key that is
-- already valid makes this a no-op.
ALTER TABLE public.billing_accounts VALIDATE CONSTRAINT billing_accounts_package_id_fkey;
