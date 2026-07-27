const DEFAULT_WEB_CALL_ENDPOINT =
  "https://voice.lobbystack.com/web-call/sessions";
const LOCAL_WEB_CALL_ENDPOINT =
  "http://127.0.0.1:3001/web-call/sessions";

export const DASHBOARD_TEST_CALL_WIDGET_ID = "lobbystack-dashboard-test-call";
export const PROSPECT_DEMO_WIDGET_ID = "lobbystack-prospect-demo";

export function getWebCallEndpoint(): string {
  if (import.meta.env.VITE_WEB_CALL_ENDPOINT) {
    return import.meta.env.VITE_WEB_CALL_ENDPOINT;
  }

  if (import.meta.env.DEV) {
    return LOCAL_WEB_CALL_ENDPOINT;
  }

  return DEFAULT_WEB_CALL_ENDPOINT;
}
