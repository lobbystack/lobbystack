-- lobbystack:concurrent-index billing_usage_events_period_idx
CREATE INDEX CONCURRENTLY IF NOT EXISTS billing_usage_events_period_idx
ON public.billing_usage_events (business_id, period_key, created_at);
