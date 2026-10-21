// The website chat widget's positions, allowed origins and script tag, which
// the dashboard and the API share.

import { z } from "zod";

export type WidgetPosition = "bottom-right" | "bottom-left";

/** A CSS hex color: 3, 4, 6 or 8 digits. Five or seven digits look like one but browsers ignore them. */
export const WIDGET_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const widgetPositions = [
  "bottom-right",
  "bottom-left",
] as const satisfies ReadonlyArray<WidgetPosition>;

// Bottom center was dropped; widgets saved with it, and API callers that still send it, get bottom right.
export const widgetPositionSchema = z.preprocess((value) => value === "bottom-center" ? "bottom-right" : value, z.enum(widgetPositions));

/**
 * A website origin as widget keys keep it: scheme, host and port, with no
 * trailing slash. A bare host, as people type it, means its https origin;
 * without that it would never match a browser's Origin header.
 */
export function normalizeWidgetOrigin(value: string): string {
  const trimmed = value.trim();
  // A sandboxed page sends the opaque origin null, which is no host.
  if (trimmed === "null") return trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const origin = new URL(withScheme).origin;
    if (origin !== "null") return origin.replace(/\/$/, "");
  } catch {
    // Kept as typed below.
  }
  return trimmed.replace(/\/$/, "");
}

/**
 * The script tag that puts the chat widget on a website, served from the
 * dashboard's origin. The loader URL names the key, so the loader arrives with
 * the bubble's color and position as last saved.
 */
export function widgetEmbedSnippet(appOrigin: string, key: string): string {
  return `<script src="${appOrigin}/embed.js?key=${encodeURIComponent(key)}" data-widget-key="${key}" defer></script>`;
}
