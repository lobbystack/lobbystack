-- lobbystack:concurrent-index provider_events_partner_idx
-- A partner's Polar events, for the reconcile's check that no newer snapshot
-- of its subscription already applied, and for the key from 0144 when a
-- partner is deleted. Only a partner's events have one, so the index stays
-- small.
CREATE INDEX CONCURRENTLY IF NOT EXISTS provider_events_partner_idx
ON public.provider_events (partner_id, created_at)
WHERE partner_id IS NOT NULL;
