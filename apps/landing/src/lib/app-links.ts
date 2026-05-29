export const APP_LOGIN_URL = "https://app.lobbystack.com/login"
export const APP_SIGNUP_URL = "https://app.lobbystack.com/signup"

export const CAL_DEMO_LINK = "raphaelm/lobbystack"
export const CAL_DEMO_NAMESPACE = "lobbystack"
export const CAL_DEMO_DESTINATION = `cal.com/${CAL_DEMO_LINK}`
export const CAL_DEMO_CONFIG = {
  layout: "month_view",
  theme: "light",
  useSlotsViewOnSmallScreen: "true",
} as const
export const CAL_DEMO_EMBED_URL = `https://app.cal.com/${CAL_DEMO_LINK}/embed?${new URLSearchParams(
  {
    ...CAL_DEMO_CONFIG,
    embedType: "inline",
    embed: CAL_DEMO_NAMESPACE,
  }
).toString()}`

export const CAL_DEMO_TRIGGER_ATTRIBUTES = {
  "data-cal-demo-trigger": "true",
} as const
