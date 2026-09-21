-- lobbystack:concurrent-index product_events_business_sent_idx
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_events_business_sent_idx
ON public.product_events (business_id, sent_at, id)
WHERE sent_at IS NOT NULL;
