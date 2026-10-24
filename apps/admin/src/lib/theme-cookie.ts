// The marketing site and the dashboard run on different hosts, so localStorage
// can't share the theme; a cookie on the parent domain carries it across.
const THEME_COOKIE = "theme";
const THEME_STORAGE_KEY = "theme";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Runs in <head> before next-themes' own script, so the shared choice wins over a stale local one. */
export const themeCookieScript = `try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)(?:;|$)/);if(m)localStorage.setItem("${THEME_STORAGE_KEY}",m[1])}catch(e){}`;

function parentDomain(hostname: string): string | null {
  const labels = hostname.split(".");
  if (labels.length < 2 || /^[\d.]+$/.test(hostname) || hostname.includes(":")) return null;
  return labels.slice(-2).join(".");
}

export function writeThemeCookie(theme: string) {
  if (!/^(light|dark|system)$/.test(theme)) return;
  const base = `${THEME_COOKIE}=${theme}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  const domain = parentDomain(location.hostname);
  if (domain) {
    document.cookie = `${base}; domain=${domain}`;
    if (document.cookie.includes(`${THEME_COOKIE}=${theme}`)) return;
  }
  // The browser refuses public suffixes such as ngrok-free.app; keep the choice on this host.
  document.cookie = base;
}
