---
name: LobbyStack
description: An open-source AI receptionist platform for small businesses
colors:
  neutral-background: "oklch(1 0 0)"
  neutral-foreground: "oklch(0.145 0 0)"
  neutral-primary: "oklch(0.205 0 0)"
  neutral-primary-foreground: "oklch(0.985 0 0)"
  neutral-muted: "oklch(0.97 0 0)"
  neutral-border: "oklch(0.922 0 0)"
  neutral-destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "var(--font-geist), sans-serif"
    fontSize: "clamp(1.875rem, 5vw, 2.75rem)"
    fontWeight: "500"
    letterSpacing: "-0.05em"
  body:
    fontFamily: "var(--font-geist), sans-serif"
    fontSize: "1rem"
    fontWeight: "400"
    lineHeight: "1.625"
rounded:
  base: "10px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  base: "4px"
  major: "8px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.neutral-primary}"
    textColor: "{colors.neutral-primary-foreground}"
    rounded: "9999px"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.neutral-background}"
    textColor: "{colors.neutral-foreground}"
    rounded: "21.6px"
    padding: "32px"
---

# Design System: LobbyStack

## 1. Overview

**Creative North Star: "The Utilitarian Operator"**

This system is built for calm confidence. It is direct, reassuring, and exceptionally professional, acting as a trusted operational partner rather than a flashy tech toy. The aesthetic relies on an extremely restrained, purely achromatic palette (black, white, and warm grays) and rigorous typography to communicate reliability. It explicitly rejects highly colorful, cluttered SaaS interfaces, bubbly consumer-app aesthetics, and generic AI templates. 

**Key Characteristics:**
- Purely achromatic palette.
- Technical, precise typography using Geist Variable.
- Soft, responsible components based on the shadcn `base-maia` preset.
- Generous whitespace and a strict 4px/8px baseline grid.

## 2. Colors

A purely achromatic scale focused on clarity and contrast.

### Primary
- **Neutral Primary** (oklch(0.205 0 0)): Used for primary actions, buttons, and high-emphasis UI elements.
- **Neutral Foreground** (oklch(0.145 0 0)): The near-black text color used for all primary reading material.

### Neutral
- **Neutral Background** (oklch(1 0 0)): Pure white. The canvas.
- **Neutral Muted** (oklch(0.97 0 0)): Very light gray, used for secondary backgrounds and subdued containers.
- **Neutral Border** (oklch(0.922 0 0)): Used for subtle structural boundaries.

### State / Semantic
- **Destructive** (oklch(0.577 0.245 27.325)): A muted red reserved strictly for destructive actions or critical errors.

**The Achromatic Rule.** The brand identity relies on the absence of color. No accent hues are permitted. Hierarchy is established strictly through typographic scale, weight, and layout spacing.

## 3. Typography

**Display Font:** Geist Variable
**Body Font:** Geist Variable

**Character:** Technical, clean, and highly legible.

### Hierarchy
- **Display** (500 weight, clamp(1.875rem, 5vw, 2.75rem), -0.05em tracking): Used exclusively for hero headlines and major section titles (`.section-heading`).
- **Headline** (600 weight, 1.5rem to 2.25rem): Secondary headings (`h2`, `h3` in legal/blog copy).
- **Body** (400 weight, 1rem, 1.625 line-height): The default reading text. Capped at max 75ch width (`max-w-3xl`) for readability.
- **Label** (500 weight, 0.875rem): Used for metadata, badges, and utility text.

**The One Font Rule.** Geist Variable is the only permitted font family. Do not mix with serif or display faces.

## 4. Elevation

Surfaces are predominantly flat by default, relying on tonal layering (light gray backgrounds on white) or subtle borders (`1px solid oklch(0.922 0 0)`) to separate content.

### Shadow Vocabulary
- **Browser Frame Drop Shadow** (`0 1px 3px oklch(0 0 0 / 4%), 0 8px 32px oklch(0 0 0 / 6%), 0 24px 60px oklch(0 0 0 / 4%)`): A deep, diffused shadow used exclusively to lift hero product mockups and browser frames off the page.

**The Structural Lift Rule.** Shadows are not used for decoration. They are used only for modals, popovers, and the main product showcase frame.

## 5. Components

Components are soft and responsible, strictly adhering to the `shadcn` `base-maia` preset with a `neutral` base color.

### Buttons
- **Shape:** Fully rounded pills (`rounded-full`) for primary CTAs.
- **Primary:** Dark gray (`oklch(0.205 0 0)`) background with near-white text. Generous internal padding (12px vertical, 16px horizontal).
- **Secondary:** Light gray or ghost styles for lower-priority actions.

### Cards / Containers
- **Corner Style:** Large radii, often `rounded-[1.35rem]` (21.6px) for major layout blocks.
- **Background:** White or very light gray.
- **Internal Padding:** Generous, typically `p-8 md:p-10` (32px to 40px).

### Badges / Labels
- **Style:** Small, subdued.
- **Rule:** Never use badges or pills as decorative section headers.

## 6. Do's and Don'ts

### Do:
- **Do** use the established spacing scale (`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128`).
- **Do** compose existing `shadcn/ui` primitives over building custom wrappers.
- **Do** use underlines (`<span className="underline underline-offset-4 decoration-2">`) to accent key words in headings.
- **Do** use real product screenshots (from `public/screenshots/`) for marketing imagery.

### Don't:
- **Don't** use highly colorful, multi-hue, or cluttered SaaS layouts (like upfirst.ai or myaifrontdesk.com).
- **Don't** use bubbly, overly energetic consumer-app aesthetics.
- **Don't** use `<Badge>` components or pill labels as decorative section headers. Let the headings speak for themselves.
- **Don't** use the hero-metric template (big number, small label, supporting stats, gradient accent).
- **Don't** use gradient text (`background-clip: text`) combined with a gradient background.
- **Don't** use side-stripe borders (`border-left` or `border-right` greater than 1px) as colored accents.
