-- A released number keeps its row with status 'reclaimed', and Twilio can sell
-- the same number again later. The old unique index covered reclaimed rows, so
-- buying that number again failed after Twilio had charged for it. Only numbers
-- a business still holds need to be unique. phone_numbers is small, so the
-- build is quick; inbound calls read it, so give up quickly on a lock wait.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_e164_unreclaimed_unique
  ON public.phone_numbers (e164)
  WHERE status <> 'reclaimed';
DROP INDEX IF EXISTS public.phone_numbers_e164_unique;
