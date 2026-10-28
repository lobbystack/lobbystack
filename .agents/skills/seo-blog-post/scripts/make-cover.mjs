// Renders a blog cover: light beige card, small dot pattern, black title text.
// Usage (from the repo root):
//   node .agents/skills/seo-blog-post/scripts/make-cover.mjs <slug> "<title>" ["<kicker>"]
// Writes apps/admin/public/illustrations/<slug>-hero.webp at 1672x941, the size the comparison tests check.
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [slug, title, kicker = "LobbyStack"] = process.argv.slice(2);
if (!slug || !title) {
  console.error('usage: make-cover.mjs <slug> "<title>" ["<kicker>"]');
  process.exit(1);
}

const root = resolve(import.meta.dirname, "../../../..");
const pnpm = join(root, "node_modules/.pnpm");
const newest = (prefix) => readdirSync(pnpm).filter((d) => d.startsWith(prefix)).sort().at(-1);
const sharp = createRequire(join(root, "apps/admin/package.json"))("sharp");
const { chromium } = createRequire(join(pnpm, newest("playwright@"), "node_modules/playwright/package.json"))("playwright");
const font = readFileSync(join(pnpm, newest("@fontsource-variable+geist@"), "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")).toString("base64");

const W = 1672;
const H = 941;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
* { margin: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; background: #f7f0e1; font-family: Geist, sans-serif; color: #111; position: relative; overflow: hidden; }
.dots { position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(17,17,17,.13) 1.6px, transparent 1.8px); background-size: 28px 28px; background-position: 14px 14px; }
.card { position: absolute; left: 112px; top: 112px; right: 112px; bottom: 112px; background: #f7f0e1; border: 2px solid #111; border-radius: 28px; padding: 88px 96px; display: flex; flex-direction: column; justify-content: space-between; }
.kicker { font-size: 30px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; gap: 16px; }
.kicker::before { content: ""; width: 14px; height: 14px; background: #111; border-radius: 50%; }
h1 { font-weight: 650; letter-spacing: -0.035em; line-height: 1.04; max-width: 1240px; }
</style></head><body><div class="dots"></div><div class="card"><div class="kicker">${esc(kicker)}</div><h1 id="t">${esc(title)}</h1></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  // Largest size that keeps the title within three lines.
  await page.evaluate(() => {
    const t = document.getElementById("t");
    for (let size = 112; size >= 56; size -= 2) {
      t.style.fontSize = `${size}px`;
      if (t.scrollHeight <= size * 1.04 * 3 + 2) break;
    }
  });
  const png = await page.screenshot({ type: "png" });
  const out = join(root, "apps/admin/public/illustrations", `${slug}-hero.webp`);
  await sharp(png).webp({ quality: 90 }).toFile(out);
  const meta = await sharp(out).metadata();
  if (meta.width !== W || meta.height !== H) throw new Error(`cover is ${meta.width}x${meta.height}, expected ${W}x${H}`);
  console.log(out);
} finally {
  await browser.close();
}
