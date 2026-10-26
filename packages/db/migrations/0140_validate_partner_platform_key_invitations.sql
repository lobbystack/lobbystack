-- The previous migration adds this check NOT VALID. Validating it here takes
-- only a SHARE UPDATE EXCLUSIVE lock, so invitations can still be written
-- meanwhile. Every invitation made before it names the person who sent it,
-- so nothing fails it, and a check that is already valid makes this a no-op.
ALTER TABLE public.business_invitations VALIDATE CONSTRAINT business_invitations_inviter_check;
