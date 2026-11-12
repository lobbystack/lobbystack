-- A person's choice to stop the host's marketing emails: the onboarding
-- welcome and the plan reminders, which MARKETING_EMAIL_TEMPLATES in
-- packages/providers lists. Null means they get them. The unsubscribe link in
-- each of those emails, and the switch under Account > Notifications, set and
-- clear it through the auth role, which already reads and writes users.
--
-- The column is nullable with no default, so adding it rewrites nothing, and
-- the previous release, which never reads it, keeps sending as before.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS marketing_emails_unsubscribed_at timestamptz;

-- Whom a marketing email goes to, and whether they unsubscribed. The worker
-- checks it when it sends one, with no business or user in its context, and
-- knows only the address it was queued for, which is how an email queued by
-- the previous release names its recipient too. It reads no other column.
CREATE OR REPLACE FUNCTION app.marketing_email_recipient(p_normalized_email text)
RETURNS TABLE (
  user_id uuid,
  unsubscribed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT person.id, person.marketing_emails_unsubscribed_at IS NOT NULL
  FROM public.users person
  WHERE person.normalized_email = p_normalized_email
$$;
REVOKE ALL ON FUNCTION app.marketing_email_recipient(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.marketing_email_recipient(text) TO lobbystack_worker;
