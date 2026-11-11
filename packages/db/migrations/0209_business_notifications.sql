-- The dashboard's notification bell. Each row is one thing a business's team
-- should know about: an account or setup problem to fix (category 'action'),
-- or news such as a finished website import or a product update ('update').
-- The worker or the domain writes a row where the event happens; the
-- dashboard reads them. Copy isn't stored: the dashboard writes the title and
-- line from the kind and params in the reader's language. A product update
-- carries its own title and line in each interface language in params.
--
-- dedupe_key names the condition, such as calendar_sync:<connection id>. A
-- business has at most one row per key, so posting the same condition again
-- while it's open changes nothing. Once resolved_at is set, posting it again
-- opens the row anew with a new occurred_at, which makes it unread again.
-- An action row stays listed until it's resolved or expires; reading it
-- doesn't hide it.
CREATE TABLE IF NOT EXISTS public.business_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind varchar(48) NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{0,47}$'),
  category varchar(16) NOT NULL CHECK (category IN ('action', 'update')),
  dedupe_key varchar(255) NOT NULL,
  -- Only this person sees the row, such as the teammate whose invite was accepted. Null: everyone the kind allows.
  recipient_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- A dashboard path, or for a product update the changelog's address.
  href text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  -- Past this time the row no longer shows, such as a month's minutes alert once the month ends.
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_notifications_business_key_unique ON public.business_notifications(business_id, dedupe_key);
CREATE INDEX IF NOT EXISTS business_notifications_business_occurred_idx ON public.business_notifications(business_id, occurred_at DESC);

ALTER TABLE public.business_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_notifications FORCE ROW LEVEL SECURITY;

-- The business's team reads its rows. The worker and the app's system actor
-- write them where the event happens, and an operator's own action, such as
-- reconnecting Instagram, resolves them, so the team may update rows too.
DROP POLICY IF EXISTS business_notifications_tenant_isolation ON public.business_notifications;
CREATE POLICY business_notifications_tenant_isolation ON public.business_notifications
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker') OR app.has_business_membership(business_id)));

GRANT SELECT, INSERT, UPDATE ON public.business_notifications TO lobbystack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_notifications TO lobbystack_worker;
GRANT SELECT ON public.business_notifications TO lobbystack_readonly;

-- When each person last read each row. Read state belongs to the person, not
-- the business: one teammate reading an item leaves it unread for the rest.
-- A row is unread for a person while they have no read here at or after its
-- occurred_at, so a condition that comes back reads as new.
CREATE TABLE IF NOT EXISTS public.business_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.business_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS business_notification_reads_business_user_idx ON public.business_notification_reads(business_id, user_id);

ALTER TABLE public.business_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_notification_reads FORCE ROW LEVEL SECURITY;

-- A person reads and writes only their own reads, in a business they can open, as the operator signed in.
DROP POLICY IF EXISTS business_notification_reads_self ON public.business_notification_reads;
CREATE POLICY business_notification_reads_self ON public.business_notification_reads
  USING (business_id = app.current_business_id() AND app.current_actor_type() = 'operator' AND user_id = app.current_user_id() AND app.has_business_membership(business_id))
  WITH CHECK (business_id = app.current_business_id() AND app.current_actor_type() = 'operator' AND user_id = app.current_user_id() AND app.has_business_membership(business_id));

GRANT SELECT, INSERT, UPDATE ON public.business_notification_reads TO lobbystack_app;
GRANT SELECT ON public.business_notification_reads TO lobbystack_readonly;
