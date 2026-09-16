CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_email text,
  user_name text,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  business_name text,
  message text NOT NULL,
  page_path text,
  user_agent text,
  email_status varchar(32) NOT NULL DEFAULT 'pending_email',
  recipient_email text,
  provider_message_id text,
  email_error text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_submissions_business_submitted_idx ON public.feedback_submissions(business_id, submitted_at);
CREATE INDEX IF NOT EXISTS feedback_submissions_user_submitted_idx ON public.feedback_submissions(user_id, submitted_at);
CREATE INDEX IF NOT EXISTS feedback_submissions_status_submitted_idx ON public.feedback_submissions(email_status, submitted_at);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_submissions_access ON public.feedback_submissions;
CREATE POLICY feedback_submissions_access ON public.feedback_submissions
  USING (
    app.current_actor_type() IN ('system', 'worker')
    OR (user_id = app.current_user_id() AND (business_id IS NULL OR (business_id = app.current_business_id() AND app.has_business_membership(business_id))))
  )
  WITH CHECK (
    app.current_actor_type() IN ('system', 'worker')
    OR (user_id = app.current_user_id() AND (business_id IS NULL OR (business_id = app.current_business_id() AND app.has_business_membership(business_id))))
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_submissions TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.feedback_submissions TO lobbystack_readonly;
