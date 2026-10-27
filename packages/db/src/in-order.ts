type Results<S extends readonly (() => unknown)[]> = { -readonly [K in keyof S]: S[K] extends () => infer R ? Awaited<R> : never };

/**
 * Runs each query in turn and returns their results in order, as
 * Promise.all would. A transaction holds one connection, and node-postgres
 * queues a query sent while another is still running and warns that pg 9
 * will refuse it, so a transaction's reads go one after another.
 */
export async function inOrder<const S extends readonly (() => unknown)[]>(steps: S): Promise<Results<S>> {
  const results: unknown[] = [];
  for (const step of steps) results.push(await step());
  return results as Results<S>;
}
