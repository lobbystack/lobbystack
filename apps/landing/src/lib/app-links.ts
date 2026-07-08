export const APP_LOGIN_URL = "https://app.lobbystack.com/login"
export const APP_SIGNUP_URL = "https://app.lobbystack.com/signup"
export const APP_AFFILIATE_URL = "https://app.lobbystack.com/affiliate"

const affiliateReturnTo = encodeURIComponent("/affiliate")

export const APP_AFFILIATE_LOGIN_URL = `${APP_LOGIN_URL}?returnTo=${affiliateReturnTo}`
export const APP_AFFILIATE_SIGNUP_URL = `${APP_SIGNUP_URL}?returnTo=${affiliateReturnTo}`
