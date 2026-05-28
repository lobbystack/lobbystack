export const APP_LOGIN_URL = "https://app.lobbystack.com/login"
export const APP_SIGNUP_URL = "https://app.lobbystack.com/signup"

export const CAL_DEMO_LINK = "raphaelm/lobbystack"
export const CAL_DEMO_NAMESPACE = "lobbystack"
export const CAL_DEMO_CONFIG = JSON.stringify({
  layout: "month_view",
  theme: "light",
  useSlotsViewOnSmallScreen: "true",
})

export const CAL_DEMO_TRIGGER_ATTRIBUTES = {
  "data-cal-link": CAL_DEMO_LINK,
  "data-cal-namespace": CAL_DEMO_NAMESPACE,
  "data-cal-config": CAL_DEMO_CONFIG,
} as const
