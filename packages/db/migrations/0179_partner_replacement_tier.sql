-- A partner's business stays live for about 30 days after its tier ends (0150),
-- and the claim check (0154) held only new numbers to the tier. So a business on
-- an unpaid tier could replace a number it held: the worker bought the number and
-- wrote a charge row, but Free is never charged (0147), so the host paid for it.
--
-- A claim for a replacement now needs a paid tier wherever the deployment bills
-- tiers, however it was made. Platform keys already did (0178). Without tier
-- billing there's no tier to check, so a replacement works as it did.
--
-- A running trial number stays refused with active_number_required. It's set
-- for release, so each claim function refuses it before this trigger runs.
CREATE OR REPLACE FUNCTION app.check_partner_number_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_catalog
AS $$
DECLARE
  claim_partner_id uuid;
  claim_deployment_mode text;
  tier_billing boolean;
  included integer;
  daily_quota integer;
  monthly_quota integer;
BEGIN
  SELECT business.partner_id, business.deployment_mode INTO claim_partner_id, claim_deployment_mode FROM public.businesses business WHERE business.id = NEW.business_id;
  IF claim_partner_id IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('partner-numbers:' || claim_partner_id::text, 0));
  tier_billing := app.partner_tier_billing();
  included := app.partner_included_numbers(claim_partner_id);
  daily_quota := CASE WHEN tier_billing THEN GREATEST(2, included) ELSE 2 END;
  monthly_quota := CASE WHEN tier_billing THEN GREATEST(5, 2 * included) ELSE 5 END;

  IF NEW.purpose = 'onboarding' THEN
    IF NOT tier_billing AND claim_deployment_mode = 'cloud' THEN
      RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(NEW.selection_context->>'trial', '') = 'true' THEN
      -- The partner's own trial number, never the host's: a cloud business,
      -- live, of a partner on Free that hasn't had its trial. A business
      -- paused with its partner's other businesses isn't live (0150). A demo
      -- nobody claimed yet (0149) expires, so it would spend the partner's
      -- one trial on a business nobody keeps.
      IF NOT tier_billing OR claim_deployment_mode <> 'cloud' OR NOT app.has_live_entitlement(NEW.business_id)
        OR EXISTS (SELECT 1 FROM public.prospect_demos demo WHERE demo.business_id = NEW.business_id AND demo.status <> 'claimed') THEN
        RAISE EXCEPTION 'partner_numbers_unavailable' USING ERRCODE = 'P0001';
      END IF;
      IF app.partner_paid_tier(claim_partner_id) THEN
        RAISE EXCEPTION 'trial_not_needed' USING ERRCODE = 'P0001';
      END IF;
      -- A trial claim that stalled in another of the partner's businesses
      -- would hold the partner's one trial until someone retried there, so
      -- it expires here as it would in its own business: reserved for 15
      -- minutes, or provisioning for 30. That business's own claim takes
      -- its rows before the partner's lock, so rows it holds now are
      -- skipped rather than waited on, and the check below then refuses
      -- this claim until that one finishes.
      UPDATE public.onboarding_number_claim_events claim
      SET status = 'failed', completed_at = now(), last_error = CASE WHEN claim.status = 'reserved' THEN 'Number claim reservation expired.' ELSE 'Number provisioning stalled.' END, updated_at = now()
      WHERE claim.id IN (
        SELECT stale.id
        FROM public.onboarding_number_claim_events stale
        INNER JOIN public.number_trials trial ON trial.claim_id = stale.id
        WHERE trial.partner_id = claim_partner_id
          AND trial.status = 'reserved'
          AND stale.purpose = 'onboarding'
          AND ((stale.status = 'reserved' AND stale.reserved_at <= now() - interval '15 minutes') OR (stale.status = 'provisioning' AND stale.updated_at <= now() - interval '30 minutes'))
        FOR UPDATE OF stale SKIP LOCKED
      );
      UPDATE public.number_trials trial SET status = 'failed', updated_at = now()
      WHERE trial.id IN (
        SELECT reserved.id
        FROM public.number_trials reserved
        INNER JOIN public.onboarding_number_claim_events claim ON claim.id = reserved.claim_id
        WHERE reserved.partner_id = claim_partner_id
          AND reserved.status = 'reserved'
          AND claim.status = 'failed'
        FOR UPDATE OF reserved SKIP LOCKED
      );
      IF app.partner_number_trial_used(claim_partner_id)
        OR EXISTS (SELECT 1 FROM public.number_trials trial WHERE trial.partner_id = claim_partner_id AND trial.status <> 'failed') THEN
        RAISE EXCEPTION 'partner_trial_used' USING ERRCODE = 'P0001';
      END IF;
    ELSIF tier_billing
      AND app.count_partner_numbers(claim_partner_id) >= included
      AND NOT app.partner_paid_tier(claim_partner_id) THEN
      RAISE EXCEPTION 'partner_number_limit_reached' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.purpose = 'replacement' AND tier_billing AND NOT app.partner_paid_tier(claim_partner_id) THEN
    RAISE EXCEPTION 'partner_number_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT count(*) FROM public.onboarding_number_claim_events claim WHERE claim.business_id = NEW.business_id AND claim.reserved_at >= now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'number_claim_rate_limited' USING ERRCODE = 'P0001';
  END IF;
  IF app.count_partner_bought_claims(claim_partner_id, now() - interval '1 day') >= daily_quota THEN
    RAISE EXCEPTION 'daily_claim_quota_reached' USING ERRCODE = 'P0001';
  END IF;
  IF app.count_partner_bought_claims(claim_partner_id, now() - interval '30 days') >= monthly_quota THEN
    RAISE EXCEPTION 'monthly_claim_quota_reached' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.check_partner_number_claim() FROM PUBLIC;
