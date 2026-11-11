-- The dashboard shows a short intro card the first time a person opens some
-- of its pages. Each row is one card the person has closed, so it stays closed
-- on every device they sign in on. The row named 'dashboard' records their
-- first dashboard visit, which never shows a card. The ids match
-- PAGE_INTRO_KEYS in @lobbystack/shared.
CREATE TABLE IF NOT EXISTS public.user_page_intros (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  intro text NOT NULL CHECK (intro ~ '^[a-z][a-z_]{0,39}$'),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, intro)
);

ALTER TABLE public.user_page_intros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_page_intros FORCE ROW LEVEL SECURITY;

-- A person reads and adds only their own rows, as the operator signed in.
DROP POLICY IF EXISTS user_page_intros_self ON public.user_page_intros;
CREATE POLICY user_page_intros_self ON public.user_page_intros
  USING (app.current_actor_type() = 'operator' AND user_id = app.current_user_id())
  WITH CHECK (app.current_actor_type() = 'operator' AND user_id = app.current_user_id());

-- A card closes once and stays closed, so nothing updates or deletes a row.
GRANT SELECT, INSERT ON public.user_page_intros TO lobbystack_app;
GRANT SELECT ON public.user_page_intros TO lobbystack_readonly;
