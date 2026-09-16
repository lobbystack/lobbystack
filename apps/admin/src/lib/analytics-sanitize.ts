export function sanitizeAnalyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/^\/(demo|reset-password)\/[^/]+/, "/$1/[token]");
    return url.toString();
  } catch { return ""; }
}

export function sanitizeAnalyticsProperties(properties: Record<string, unknown>): void {
  for (const key of Object.keys(properties)) {
    if (!/^\$web_vitals_(LCP|INP|CLS|FCP)_event$/.test(key)) continue;
    const metric = properties[key];
    if (!metric || typeof metric !== "object") { delete properties[key]; continue; }
    // Web-vitals entries/attribution can contain resource URLs and DOM details.
    // Keep only the numeric metric and its non-content correlation fields.
    properties[key] = Object.fromEntries(Object.entries(metric).filter(([name]) =>
      ["id", "name", "value", "delta", "rating", "navigationType", "timestamp", "$session_id", "$window_id"].includes(name),
    ));
  }
  for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
    if (typeof properties[key] === "string") properties[key] = sanitizeAnalyticsUrl(properties[key]);
  }
  for (const key of ["$set", "$set_once"]) {
    const values = properties[key];
    if (values && typeof values === "object" && !Array.isArray(values)) {
      for (const urlKey of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
        const record = values as Record<string, unknown>;
        if (typeof record[urlKey] === "string") record[urlKey] = sanitizeAnalyticsUrl(record[urlKey]);
      }
    }
  }
}
