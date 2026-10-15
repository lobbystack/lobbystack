-- RSD and HUF prices now take decimals like other currencies, so their
-- smallest unit is a hundredth, not a whole dinar or forint. Existing prices
-- were stored in whole units; store them in hundredths. A database that ran
-- this before it was renumbered (as 0109) already converted them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.__lobbystack_migrations WHERE name = '0109_service_price_whole_unit_decimals.sql') THEN
    RETURN;
  END IF;
  UPDATE public.services AS s
  SET price_minor = s.price_minor * 100,
      price_max_minor = s.price_max_minor * 100
  FROM public.businesses AS b
  WHERE b.id = s.business_id
    AND b.currency IN ('RSD', 'HUF')
    AND (s.price_minor IS NOT NULL OR s.price_max_minor IS NOT NULL);
END
$$;
