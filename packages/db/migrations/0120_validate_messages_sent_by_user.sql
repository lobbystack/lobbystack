-- 0110 adds this foreign key NOT VALID. Validating it here takes only a SHARE
-- UPDATE EXCLUSIVE lock, so messages can still be written meanwhile, and the
-- index from 0119 finds the few rows with a sender. A key that is already
-- valid makes this a no-op.
ALTER TABLE public.messages VALIDATE CONSTRAINT messages_sent_by_user_id_fkey;
