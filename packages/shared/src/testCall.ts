/**
 * The widget the operator's own test call runs through, in the dashboard
 * utility bar. A customer calling the business through the embedded website
 * widget produces a `web_voice` call too, so activation counts this id rather
 * than the transport: otherwise a real customer's call would be mistaken for
 * the operator having heard their agent.
 */
export const DASHBOARD_TEST_CALL_WIDGET_ID = "lobbystack-dashboard-test-call";

/** The widget behind a prospect demo, which is a visitor rather than an operator. */
export const PROSPECT_DEMO_WIDGET_ID = "lobbystack-prospect-demo";
