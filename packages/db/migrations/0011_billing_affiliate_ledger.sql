CREATE TABLE IF NOT EXISTS billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  source_id text NOT NULL,
  status varchar(32) NOT NULL,
  amount_cents integer NOT NULL,
  currency varchar(8) NOT NULL,
  description text,
  invoice_url text,
  order_id text,
  subscription_id text,
  polar_customer_id text,
  occurred_at timestamptz NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_transactions_kind_source_unique UNIQUE (kind, source_id)
);
CREATE INDEX IF NOT EXISTS billing_transactions_business_occurred_idx ON billing_transactions (business_id, occurred_at);

ALTER TABLE affiliate_attributions
  ADD COLUMN IF NOT EXISTS referral_code varchar(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attributed_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS affiliate_profile_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id uuid NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  click_count integer NOT NULL DEFAULT 0,
  referral_count integer NOT NULL DEFAULT 0,
  conversion_count integer NOT NULL DEFAULT 0,
  pending_commission_cents integer NOT NULL DEFAULT 0,
  paid_commission_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_profile_stats_profile_unique UNIQUE (affiliate_profile_id)
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id uuid NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  referral_code varchar(64) NOT NULL,
  visitor_id text,
  source_url text,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_clicks_profile_clicked_idx ON affiliate_clicks (affiliate_profile_id, clicked_at);
CREATE INDEX IF NOT EXISTS affiliate_clicks_code_clicked_idx ON affiliate_clicks (referral_code, clicked_at);

CREATE TABLE IF NOT EXISTS affiliate_payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key varchar(16) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  total_cents integer NOT NULL DEFAULT 0,
  currency varchar(8) NOT NULL DEFAULT 'usd',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_payout_runs_period_unique UNIQUE (period_key)
);
CREATE INDEX IF NOT EXISTS affiliate_payout_runs_status_created_idx ON affiliate_payout_runs (status, created_at);

CREATE TABLE IF NOT EXISTS affiliate_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_run_id uuid NOT NULL REFERENCES affiliate_payout_runs(id) ON DELETE CASCADE,
  affiliate_profile_id uuid NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency varchar(8) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  payout_email text NOT NULL,
  affiliate_email text,
  affiliate_name text,
  paid_at timestamptz,
  external_reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_payout_items_run_profile_unique UNIQUE (payout_run_id, affiliate_profile_id)
);
CREATE INDEX IF NOT EXISTS affiliate_payout_items_profile_created_idx ON affiliate_payout_items (affiliate_profile_id, created_at);
CREATE INDEX IF NOT EXISTS affiliate_payout_items_run_status_idx ON affiliate_payout_items (payout_run_id, status);

CREATE TABLE IF NOT EXISTS affiliate_voided_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key varchar(255) NOT NULL UNIQUE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  billing_transaction_id uuid NOT NULL REFERENCES billing_transactions(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency varchar(8) NOT NULL,
  status varchar(32) NOT NULL,
  reason varchar(64) NOT NULL,
  voided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_voided_sources_business_idx ON affiliate_voided_sources (business_id);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_profile_id uuid NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  referred_business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_key varchar(255) NOT NULL UNIQUE,
  billing_transaction_id uuid NOT NULL REFERENCES billing_transactions(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  commission_cents integer NOT NULL,
  currency varchar(8) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  payout_state varchar(32) NOT NULL DEFAULT 'unassigned',
  occurred_at timestamptz NOT NULL,
  clears_at timestamptz NOT NULL,
  payout_item_id uuid,
  voided_at timestamptz,
  void_reason varchar(64),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_commissions_profile_status_idx ON affiliate_commissions (affiliate_profile_id, status);
CREATE INDEX IF NOT EXISTS affiliate_commissions_status_clears_idx ON affiliate_commissions (status, payout_state, clears_at);
CREATE INDEX IF NOT EXISTS affiliate_commissions_business_idx ON affiliate_commissions (referred_business_id);

ALTER TABLE affiliate_profile_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_profile_stats FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payout_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payout_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payout_items FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_voided_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_voided_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_profiles_access ON affiliate_profiles;
CREATE POLICY affiliate_profiles_access ON affiliate_profiles
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR user_id = app.current_user_id())
  WITH CHECK (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR user_id = app.current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_profiles TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS billing_transactions_tenant_isolation ON billing_transactions;
CREATE POLICY billing_transactions_tenant_isolation ON billing_transactions
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_transactions TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_attributions_tenant_isolation ON affiliate_attributions;
CREATE POLICY affiliate_attributions_tenant_isolation ON affiliate_attributions
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING ((business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))) OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()))
  WITH CHECK ((business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id))) OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_attributions TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_voided_sources_tenant_isolation ON affiliate_voided_sources;
CREATE POLICY affiliate_voided_sources_tenant_isolation ON affiliate_voided_sources
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)))
  WITH CHECK (business_id = app.current_business_id() AND (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR app.has_business_membership(business_id)));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_voided_sources TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_commissions_tenant_isolation ON affiliate_commissions;
CREATE POLICY affiliate_commissions_tenant_isolation ON affiliate_commissions
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR (referred_business_id = app.current_business_id() AND app.has_business_membership(referred_business_id)) OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()))
  WITH CHECK (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR (referred_business_id = app.current_business_id() AND app.has_business_membership(referred_business_id)) OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_commissions TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_profile_stats_access ON affiliate_profile_stats;
CREATE POLICY affiliate_profile_stats_access ON affiliate_profile_stats
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()))
  WITH CHECK (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_profile_stats TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_clicks_access ON affiliate_clicks;
CREATE POLICY affiliate_clicks_access ON affiliate_clicks
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()))
  WITH CHECK (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_clicks TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_payout_items_access ON affiliate_payout_items;
CREATE POLICY affiliate_payout_items_access ON affiliate_payout_items
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()))
  WITH CHECK (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_profiles profile WHERE profile.id = affiliate_profile_id AND profile.user_id = app.current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_payout_items TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;

DROP POLICY IF EXISTS affiliate_payout_runs_access ON affiliate_payout_runs;
CREATE POLICY affiliate_payout_runs_access ON affiliate_payout_runs
  FOR ALL TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher
  USING (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_payout_items item JOIN affiliate_profiles profile ON profile.id = item.affiliate_profile_id WHERE item.payout_run_id = affiliate_payout_runs.id AND profile.user_id = app.current_user_id()))
  WITH CHECK (app.current_actor_type() IN ('system', 'worker', 'dispatcher') OR EXISTS (SELECT 1 FROM affiliate_payout_items item JOIN affiliate_profiles profile ON profile.id = item.affiliate_profile_id WHERE item.payout_run_id = affiliate_payout_runs.id AND profile.user_id = app.current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_payout_runs TO lobbystack_app, lobbystack_worker, lobbystack_dispatcher;
