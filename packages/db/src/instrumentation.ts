import type { Pool, PoolClient } from "pg";

type Attributes = { role: string; operation?: string; outcome: "success" | "error" };
type Recorder = { record(value: number, attributes: Attributes): void };
type Callback = (...args: unknown[]) => unknown;

// Never use SQL text, table names, bind values, or error messages as metric labels.
export function queryOperation(query: unknown): string {
  const text = typeof query === "string" ? query : (query as { text?: unknown } | null)?.text;
  if (typeof text !== "string") return "other";
  const operation = /^\s*(select|insert|update|delete|with|begin|commit|rollback|set)\b/i.exec(text)?.[1]?.toLowerCase();
  return operation ?? "other";
}

export function instrumentPool(pool: Pool, role: string, metrics: { query: Recorder; wait: Recorder }): void {
  const instrumented = new WeakSet<PoolClient>();
  pool.on("connect", (client: PoolClient) => {
    if (instrumented.has(client)) return;
    instrumented.add(client);
    const query = client.query;
    client.query = function (this: PoolClient, ...args: unknown[]) {
      // Cursor/submittable APIs have a separate lifecycle; do not alter it.
      if (typeof (args[0] as { submit?: unknown } | null)?.submit === "function") {
        return Reflect.apply(query, this, args);
      }
      const start = performance.now();
      const operation = queryOperation(args[0]);
      let recorded = false;
      const finish = (error?: unknown) => {
        if (recorded) return;
        recorded = true;
        metrics.query.record(performance.now() - start, { role, operation, outcome: error ? "error" : "success" });
      };
      const callback = args.at(-1);
      if (typeof callback === "function") {
        args[args.length - 1] = function (this: unknown, ...values: unknown[]) {
          finish(values[0]);
          return Reflect.apply(callback, this, values);
        };
      }
      try {
        const result = Reflect.apply(query, this, args);
        if (result && typeof result.then === "function") {
          return result.then((value: unknown) => { finish(); return value; }, (error: unknown) => { finish(error); throw error; });
        }
        return result;
      } catch (error) { finish(error); throw error; }
    } as PoolClient["query"];
  });

  const connect = pool.connect;
  pool.connect = function (this: Pool, callback?: Callback) {
    const start = performance.now();
    const finish = (error?: unknown) => metrics.wait.record(performance.now() - start, { role, outcome: error ? "error" : "success" });
    if (callback) {
      return Reflect.apply(connect, this, [(...args: unknown[]) => { finish(args[0]); return callback(...args); }]);
    }
    return Reflect.apply(connect, this, []).then(
      (client: PoolClient) => { finish(); return client; },
      (error: unknown) => { finish(error); throw error; },
    );
  } as Pool["connect"];
}
