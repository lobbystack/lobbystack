import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { rlsContextStatement } from "./context";

describe("rlsContextStatement", () => {
  it("sets all four settings transaction-locally in one statement", () => {
    const query = new PgDialect().sqlToQuery(
      rlsContextStatement({ userId: "u1", businessId: "b1", actorType: "operator" }),
    );
    expect(query.sql).toBe(
      "select set_config('app.user_id', $1, true), set_config('app.business_id', $2, true), set_config('app.actor_type', $3, true), set_config('app.platform_key_id', $4, true)",
    );
    expect(query.params).toEqual(["u1", "b1", "operator", ""]);
  });

  it("clears missing ids instead of keeping a previous value", () => {
    const query = new PgDialect().sqlToQuery(rlsContextStatement({ actorType: "system" }));
    expect(query.params).toEqual(["", "", "system", ""]);
  });

  it("names a partner's platform key when a transaction acts for one", () => {
    const query = new PgDialect().sqlToQuery(rlsContextStatement({ platformKeyId: "k1", actorType: "operator" }));
    expect(query.params).toEqual(["", "", "operator", "k1"]);
  });
});
