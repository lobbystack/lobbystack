-- lobbystack:concurrent-index businesses_partner_idx
-- A partner's businesses, for its console, and the check that a partner has
-- none left before it's deleted. Only a partner's businesses have one, so the
-- index stays small.
CREATE INDEX CONCURRENTLY IF NOT EXISTS businesses_partner_idx
ON public.businesses (partner_id)
WHERE partner_id IS NOT NULL;
