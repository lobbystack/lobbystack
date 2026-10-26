-- Whether a partner shares product telemetry from its console, as a
-- business's telemetry_enabled does from its dashboard. It starts on, as a
-- business's does, so a new partner's signup event reaches the host when the
-- default allows it. The console's pages ask this setting for consent; a
-- business's pages keep asking the business's.
--
-- A constant default adds the column without rewriting the table.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS telemetry_enabled boolean NOT NULL DEFAULT true;

-- Owners and admins change it on the console's Settings page, under 0131's
-- partners_admin_update policy, as a business's owners and admins change the
-- business's. Members only read it.
GRANT UPDATE (telemetry_enabled) ON public.partners TO lobbystack_app;
