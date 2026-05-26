# Repository Guidelines

## Project Structure & Module Organization
This app is a small Astro landing site with React islands and shadcn/ui components. Keep page routes in `src/pages/`, shared layouts in `src/layouts/`, reusable UI in `src/components/`, and helpers in `src/lib/`. Global styles live in `src/styles/global.css`, while static assets such as icons belong in `public/`. Use the `@/` alias for imports from `src/`.

## Build, Test, and Development Commands
Use the workspace `pnpm` lockfile from the repository root.

- `pnpm dev:landing` starts the Astro dev server from the repository root.
- `pnpm landing:build` creates the production build in `apps/landing/dist/`.
- `pnpm landing:preview` serves the built site locally for a final check.
- `pnpm --filter @lobbystack/landing lint` runs ESLint on TypeScript and TSX files.
- `pnpm landing:typecheck` runs `astro check` with the strict TypeScript config.
- `pnpm --filter @lobbystack/landing format` formats `*.ts`, `*.tsx`, and `*.astro` files with Prettier.

## Coding Style & Naming Conventions
Follow the existing style in the repo: TypeScript with strict checking, Astro for routes and layouts, and TSX for interactive components. Prefer PascalCase for components (`Button.tsx`), camelCase for utilities, and lowercase route filenames such as `src/pages/index.astro`. Use utility-first styling in Tailwind classes and keep theme tokens in `src/styles/global.css`. Let Prettier and ESLint enforce formatting and basic correctness before you open a PR.

## Testing Guidelines
There is no dedicated automated test suite yet. Until one is added, treat `pnpm lint`, `pnpm typecheck`, and `pnpm build` as the minimum verification set for every change. For UI updates, also verify the affected page in `pnpm dev` and include a short note on what you checked manually.

## Commit & Pull Request Guidelines
Git history currently uses conventional commit style (`feat: initial commit`). Keep that format and include the Linear issue key when relevant, for example `OPE-19 feat: refine landing hero`. Use one branch per Linear issue, keep Linear as the source of truth for status, and move the issue through `In Progress` to `In Review` as work advances. PRs should link the Linear issue, summarize behavior changes, list verification steps, and include screenshots for visible UI changes.

## Design Conventions

### No pill label badges
Do **not** use `<Badge>` components as section-label pills (e.g. "Core Features", "How it works", "FAQ"). These decorative labels add visual clutter and a generic SaaS feel. Let section headings speak for themselves.

Specifically forbidden patterns:
```tsx
// ❌ Never do this
<Badge variant="secondary" className="rounded-full ...">Section Label</Badge>
<Badge className="rounded-full ...">Tag</Badge>
```

The `Badge` component may still be used for functional indicators (e.g. status tags, counts, state labels in app UI), but **never as decorative section headers** on the marketing site.

### Typography
- Headings and body copy both use `font-sans` (Geist Variable). The project no longer uses Instrument Serif.
- For accenting key words in headings, use an underline instead of italics: `<span className="underline underline-offset-4 decoration-2">accent word</span>`.
- Never use hardcoded font families in component styles — always use the design system tokens.

### Images
- Never generate fake/AI product screenshots for marketing. Use real product screenshots placed in `public/screenshots/`.

## Design System Guidelines
- Treat `shadcn/ui` as the default UI system for `apps/landing`. Prefer composing existing shadcn primitives over custom wrappers when the primitive already solves the problem well.
- Preserve shadcn component structure, variants, accessibility, and interaction behavior. Do not restyle component internals unless the change is clearly about spacing or consistency.
- Use Geist Sans as the primary sans-serif font across the web app.
- Use Lucide as the only icon set in `apps/landing`. Do not introduce Tabler, Heroicons, or mixed icon families for marketing UI work.
- Keep the UI on a 4px base grid with an 8px default major rhythm.
- Use this spacing scale for layout and component spacing: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128`.
- Prefer Tailwind spacing utilities from that scale. Avoid arbitrary spacing values like `p-[3px]`, `top-[0.3rem]`, or one-off offsets unless geometry or animation truly requires them.
- Normalize spacing decisions across the app:
  - icon gap: `8`
  - button horizontal padding: `16`
  - button vertical padding: `12`
  - input padding: `12` or `16`
  - card padding: `24`
  - internal card gaps: `12` or `16`
  - section spacing: `64` or `96`
- Keep page-level rhythm consistent across dashboard surfaces. Similar pages should use the same top spacing, bottom spacing, section gaps, and card gutters unless there is a clear product reason not to.
- When adjusting existing UI, prioritize consistency over pixel-perfect preservation of older bespoke spacing.
- Do not redesign pages during spacing cleanup. Preserve colors, typography choices, copy, logic, responsiveness, and route architecture unless the task explicitly asks for a broader visual change.

## Configuration Notes
Do not commit secrets. Project configuration lives in `astro.config.mjs`, `tsconfig.json`, `eslint.config.js`, and `components.json`; update these intentionally and mention config changes in your PR.
