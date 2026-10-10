-- business_memberships_business_user_unique starts with business_id, so it
-- already serves every lookup by business. Every access check reads this
-- table, so give up quickly rather than queue requests behind the lock.
SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS public.business_memberships_business_idx;
