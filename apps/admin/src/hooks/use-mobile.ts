import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768

let mql: MediaQueryList | undefined

// Built on first client use; the server snapshot never reaches it.
function mobileQuery() {
  return (mql ??= window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`))
}

function subscribe(onChange: () => void) {
  const query = mobileQuery()
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => mobileQuery().matches, () => false)
}
