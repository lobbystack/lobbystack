-- Questions the receptionist looked up in a business's knowledge and found
-- nothing for, on a call or in a chat. The business's team sees the open ones
-- on the knowledge page, answers each once, which saves the answer as a text
-- entry, or dismisses it. The same question, compared by normalized_question,
-- counts again on its open or dismissed row instead of adding one, so a
-- dismissed question stays dismissed until it expires with other caller
-- content; asked after that, it opens a new row. An answered one that is
-- asked again opens a new row: the answer didn't reach the receptionist.
--
-- The question comes from what a caller or visitor said, so it expires like a
-- follow-up: content_expires_at moves with each ask, and the privacy sweep
-- deletes rows past it.

CREATE TABLE IF NOT EXISTS public.unanswered_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  normalized_question text NOT NULL CHECK (char_length(normalized_question) BETWEEN 1 AND 500),
  -- The channel of the latest ask: voice, web_voice, web_chat or instagram.
  last_channel varchar(32) NOT NULL,
  times_asked integer NOT NULL DEFAULT 1 CHECK (times_asked > 0),
  first_asked_at timestamptz NOT NULL DEFAULT now(),
  last_asked_at timestamptz NOT NULL DEFAULT now(),
  last_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  last_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'dismissed')),
  answered_at timestamptz,
  dismissed_at timestamptz,
  -- The text entry the answer was saved as.
  knowledge_snippet_id uuid REFERENCES public.knowledge_snippets(id) ON DELETE SET NULL,
  resolved_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  content_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS unanswered_questions_business_question_unique
  ON public.unanswered_questions (business_id, normalized_question)
  WHERE status IN ('open', 'dismissed');
CREATE INDEX IF NOT EXISTS unanswered_questions_business_status_idx
  ON public.unanswered_questions (business_id, status, times_asked DESC, last_asked_at DESC);
CREATE INDEX IF NOT EXISTS unanswered_questions_business_expiry_idx
  ON public.unanswered_questions (business_id, content_expires_at)
  WHERE content_expires_at IS NOT NULL;

ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unanswered_questions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unanswered_questions_tenant_isolation ON public.unanswered_questions;
CREATE POLICY unanswered_questions_tenant_isolation ON public.unanswered_questions
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
-- The dashboard reads and resolves questions; calls and chats record them.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unanswered_questions TO lobbystack_app, lobbystack_worker;
GRANT SELECT ON public.unanswered_questions TO lobbystack_readonly;
