-- 0132 adds this check NOT VALID. Validating it here takes only a SHARE
-- UPDATE EXCLUSIVE lock, so businesses can still be written meanwhile. Every
-- business already holds the column's default, so nothing fails it, and a
-- check that is already valid makes this a no-op.
ALTER TABLE public.businesses VALIDATE CONSTRAINT businesses_partner_access_level_check;
