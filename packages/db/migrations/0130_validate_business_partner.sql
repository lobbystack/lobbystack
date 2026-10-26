-- 0128 adds this foreign key NOT VALID. Validating it here takes only a SHARE
-- UPDATE EXCLUSIVE lock, so businesses can still be written meanwhile, and the
-- index from 0129 finds the few rows with a partner. A key that is already
-- valid makes this a no-op.
ALTER TABLE public.businesses VALIDATE CONSTRAINT businesses_partner_id_fkey;
