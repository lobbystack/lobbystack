import { readFile } from "node:fs/promises";

type Row = { scenario: string; fixtureSize: number; concurrency: number; repeat: number; variant: "before" | "after"; errors: number; sampleCount: number; successful: { p95: number | null } };
const path = process.argv[2];
if (!path) throw new Error("Usage: tsx scripts/performance/compare.ts <analytics-comparison.json>");
const report = JSON.parse(await readFile(path, "utf8")) as { schemaVersion: number; results: Row[] };
if (report.schemaVersion !== 1) throw new Error("Unsupported performance report version.");
const rows = report.results.filter(row => row.variant === "before" || row.variant === "after");
const scenarios = new Map<string, Row[]>();
for (const row of rows) {
  const key = `${row.scenario}:${row.fixtureSize}:${row.concurrency}`;
  scenarios.set(key, [...(scenarios.get(key) ?? []), row]);
}
if (!scenarios.size) throw new Error("No before/after samples found.");
let regression = false, improvement = false;
for (const [scenario, samples] of scenarios) {
  const comparisons = [0, 1, 2].map(repeat => {
    const before = samples.find(row => row.variant === "before" && row.repeat === repeat);
    const after = samples.find(row => row.variant === "after" && row.repeat === repeat);
    if (!before || !after || before.errors || after.errors || before.sampleCount < 10 || after.sampleCount < 10 || !before.successful.p95 || after.successful.p95 === null) return null;
    return 1 - after.successful.p95 / before.successful.p95;
  });
  const complete = comparisons.every(value => value !== null);
  const improved = complete && comparisons.every(value => value! >= .15);
  const regressed = !complete || comparisons.every(value => value! < -.05);
  improvement ||= improved;
  regression ||= regressed;
  console.log(JSON.stringify({ scenario, p95ImprovementFractions: comparisons, complete, improved, regressed }));
}
// At least one targeted scenario must improve in all repeats. Incomplete data
// or a repeatable >5% regression in any protected scenario rejects acceptance.
if (regression || !improvement) process.exitCode = 1;
