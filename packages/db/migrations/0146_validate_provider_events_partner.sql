-- 0144 adds this foreign key and check NOT VALID. Validating them here takes
-- only a SHARE UPDATE EXCLUSIVE lock, so provider events can still be written
-- meanwhile. Keys and checks that are already valid make this a no-op.
ALTER TABLE public.provider_events VALIDATE CONSTRAINT provider_events_partner_id_fkey;
ALTER TABLE public.provider_events VALIDATE CONSTRAINT provider_events_one_owner;
