CREATE OR REPLACE FUNCTION app.resolve_business_by_message_id(p_message_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT business_id FROM public.messages WHERE id = p_message_id LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_message_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_message_id(uuid) TO lobbystack_app, lobbystack_worker;

CREATE OR REPLACE FUNCTION app.resolve_business_by_notification_id(p_notification_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT business_id FROM public.notifications WHERE id = p_notification_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.resolve_business_by_operator_delivery_id(p_delivery_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT business_id FROM public.operator_notification_deliveries WHERE id = p_delivery_id LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_notification_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_business_by_operator_delivery_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_notification_id(uuid) TO lobbystack_app, lobbystack_worker;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_operator_delivery_id(uuid) TO lobbystack_app, lobbystack_worker;

CREATE OR REPLACE FUNCTION app.resolve_business_by_email_provider_id(p_email_provider_id text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT business_id FROM public.notifications WHERE provider_message_id = p_email_provider_id
  UNION ALL
  SELECT business_id FROM public.operator_notification_deliveries WHERE provider_message_id = p_email_provider_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.resolve_business_by_email_provider_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_business_by_email_provider_id(text) TO lobbystack_app, lobbystack_worker;

GRANT SELECT, INSERT, UPDATE ON public.provider_events TO lobbystack_dispatcher;
