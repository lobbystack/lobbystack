import type { CSSProperties } from "react";

// A partner's color takes the place of the dashboard's primary color: buttons,
// links and focus rings. The text on it is the dashboard's own light or dark
// foreground, whichever reads better against that color.

const LIGHT_FOREGROUND = "oklch(0.985 0 0)";
const DARK_FOREGROUND = "oklch(0.205 0 0)";
// The relative luminance of those two foregrounds, near enough.
const LIGHT_LUMINANCE = 0.96;
const DARK_LUMINANCE = 0.019;

function channel(hex: string): number {
  const value = Number.parseInt(hex, 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** The WCAG relative luminance of a #rrggbb color. */
export function relativeLuminance(color: string): number {
  return 0.2126 * channel(color.slice(1, 3)) + 0.7152 * channel(color.slice(3, 5)) + 0.0722 * channel(color.slice(5, 7));
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The foreground that reads better on a #rrggbb color. */
export function foregroundOn(color: string): string {
  const luminance = relativeLuminance(color);
  return contrast(luminance, LIGHT_LUMINANCE) >= contrast(luminance, DARK_LUMINANCE) ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

/** The theme variables a partner's #rrggbb color sets, in light and dark themes alike, or none without a color. */
export function brandColorStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return { "--primary": color, "--primary-foreground": foregroundOn(color), "--ring": color } as CSSProperties;
}
