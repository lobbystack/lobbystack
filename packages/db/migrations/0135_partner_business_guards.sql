-- Two rules keep a partner's business where it belongs until later work
-- takes them over: it stays with its partner, and on the cloud it gets no
-- phone number until the partner's tier counts the numbers its businesses
-- hold.

-- 0127 keeps a direct business direct. This keeps a partner's business with
-- its partner: only the system actor, which releasing a business will run
-- as, may clear its partner or give it another. Both runtime roles may update
-- businesses, and a business's own operators pass its RLS policy, so without
-- this they could make it direct and give themselves billing, API keys and
-- MCP, which a partner's business leaves out.
CREATE OR REPLACE FUNCTION app.keep_partner_business_with_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF current_user IN ('lobbystack_app', 'lobbystack_worker') AND app.current_actor_type() <> 'system' THEN
    RAISE EXCEPTION 'business_partner_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.keep_partner_business_with_partner() FROM PUBLIC;

DROP TRIGGER IF EXISTS businesses_keep_partner_before_update ON public.businesses;
CREATE TRIGGER businesses_keep_partner_before_update
BEFORE UPDATE OF partner_id ON public.businesses
FOR EACH ROW
WHEN (OLD.partner_id IS NOT NULL AND OLD.partner_id IS DISTINCT FROM NEW.partner_id)
EXECUTE FUNCTION app.keep_partner_business_with_partner();

-- A partner's business holds a live entitlement (0132), which lets the number
-- claims buy it a dedicated number. A partner's tier sets how many numbers
-- its businesses may hold, and tiers don't count them yet, so on the cloud a
-- partner's business gets none. Every claim, from onboarding, a replacement,
-- a trial or the API, reserves itself with a row here, so this one check
-- covers them all. It reads the business as the table's owner, whatever role
-- inserts the row.
CREATE OR REPLACE FUNCTION app.refuse_partner_number_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses business WHERE business.id = NEW.business_id AND business.partner_id IS NOT NULL AND business.deployment_mode = 'cloud') THEN
    RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.refuse_partner_number_claim() FROM PUBLIC;

DROP TRIGGER IF EXISTS onboarding_number_claim_events_refuse_partner_before_insert ON public.onboarding_number_claim_events;
CREATE TRIGGER onboarding_number_claim_events_refuse_partner_before_insert
BEFORE INSERT ON public.onboarding_number_claim_events
FOR EACH ROW
EXECUTE FUNCTION app.refuse_partner_number_claim();
