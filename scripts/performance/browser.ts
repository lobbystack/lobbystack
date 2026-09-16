import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { benchmarkMetadata } from "./metadata";

type Config = {
  environment: "local" | "staging";
  baseUrl: string;
  storageState?: string;
  scenarios: Array<{ name: string; path: string; readySelector: string; clicks?: string[] }>;
};
if (!process.argv[2]) throw new Error("Usage: tsx scripts/performance/browser.ts <config.json> [output-directory]");
const config = JSON.parse(await readFile(process.argv[2], "utf8")) as Config;
if (!["local", "staging"].includes(config.environment)) throw new Error("Use a local or staging environment.");
const base = new URL(config.baseUrl);
const output = resolve(process.argv[3] ?? `/tmp/lobbystack-browser-${Date.now()}`);
const metadata = await benchmarkMetadata(config.environment);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: unknown[] = [];
try {
  for (const scenario of config.scenarios) for (const mobile of [false, true]) for (let repeat = 0; repeat < 5; repeat++) {
    if (!/^[a-z0-9-]+$/.test(scenario.name) || new URL(scenario.path, base).origin !== base.origin) throw new Error("Invalid browser scenario.");
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, ...(config.storageState ? { storageState: config.storageState } : {}) });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Performance.enable");
    if (mobile) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 });
    }
    await page.addInitScript(() => {
      const state = { lcpMs: null as number | null, cls: 0, longTaskCount: 0, blockingTimeMs: 0, maxInteractionDurationMs: null as number | null };
      Object.assign(window, { __performanceMeasurement: state });
      let sessionStart = 0, lastShift = 0, sessionValue = 0;
      const observe = (type: string, callback: (entry: PerformanceEntry & { value?: number; hadRecentInput?: boolean; interactionId?: number }) => void) => {
        if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
        new PerformanceObserver(list => list.getEntries().forEach(callback)).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
      };
      observe("largest-contentful-paint", entry => { state.lcpMs = entry.startTime; });
      observe("layout-shift", entry => {
        if (entry.hadRecentInput) return;
        if (entry.startTime - lastShift > 1000 || entry.startTime - sessionStart > 5000) { sessionStart = entry.startTime; sessionValue = 0; }
        lastShift = entry.startTime;
        sessionValue += entry.value ?? 0;
        state.cls = Math.max(state.cls, sessionValue);
      });
      observe("longtask", entry => { state.longTaskCount++; state.blockingTimeMs += Math.max(0, entry.duration - 50); });
      observe("event", entry => { if (entry.interactionId) state.maxInteractionDurationMs = Math.max(state.maxInteractionDurationMs ?? 0, entry.duration); });
    });
    try {
      for (const cache of ["cold", "warm"]) {
        await page.goto(new URL(scenario.path, base).href, { waitUntil: "load" });
        await page.locator(scenario.readySelector).first().waitFor({ timeout: 30000 });
        const readyMs = await page.evaluate(() => performance.now());
        for (const selector of scenario.clicks ?? []) await page.locator(selector).first().click();
        await page.waitForTimeout(1000);
        const measured = await page.evaluate(() => {
          const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
          return {
            ...(window as unknown as { __performanceMeasurement: object }).__performanceMeasurement,
            fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
            resourceCount: resources.length,
            transferBytes: resources.reduce((sum, resource) => sum + resource.transferSize, 0),
            // Numeric timings only: no token-bearing URLs, DOM, or response bodies.
            waterfall: resources.map(resource => ({ type: resource.initiatorType, startMs: resource.startTime, durationMs: resource.duration, transferBytes: resource.transferSize })),
            translationRequests: resources.filter(resource => new URL(resource.name).pathname.startsWith("/locales/")).length,
          };
        });
        const runtime = await cdp.send("Performance.getMetrics");
        results.push({ scenario: scenario.name, mobile, repeat, cache, readyMs, ...measured, heapUsedBytes: runtime.metrics.find(metric => metric.name === "JSHeapUsedSize")?.value ?? null });
        await writeFile(resolve(output, "browser.json"), JSON.stringify({ ...metadata, origin: base.origin, metricNotes: "maxInteractionDurationMs is a lab proxy, not field INP; blockingTimeMs covers the observation window, not Lighthouse TBT. Cross-origin resource bytes may be unavailable.", results }, null, 2));
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(`Browser measurements: ${resolve(output, "browser.json")}`);
