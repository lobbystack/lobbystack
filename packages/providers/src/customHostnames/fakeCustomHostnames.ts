import type { CustomHostnameProvider, CustomHostnameStatus, DnsRecord, TxtLookup } from "./customHostnames";

// A custom hostname provider that lives in memory, for tests of everything
// behind the CustomHostnameProvider interface. Each hostname waits until a
// test activates or fails it, as the partner's DNS and the provider's
// certificate would, and registering one twice finds the first, as Cloudflare
// for SaaS's adapter does. FakeTxtRecords stands in for the DNS that holds
// the partner's verification record.

type FakeHostname = { hostname: string } & CustomHostnameStatus;

export class FakeCustomHostnames implements CustomHostnameProvider {
  readonly hostnames = new Map<string, FakeHostname>();
  /** Every hostname registered, in order. */
  readonly created: string[] = [];
  /** Every id removed, in order, ones it never had included. */
  readonly removed: string[] = [];
  private failure: Error | null = null;
  private next = 0;

  constructor(readonly kind: "cloudflare" | "caddy" = "cloudflare", readonly target = "edge.portal.example.test") {}

  /** Makes the next call throw, as the provider does when it's down or refuses a request. */
  failNextCall(error: Error = new Error("The hostname provider is unavailable.")): void {
    this.failure = error;
  }

  private takeFailure(): void {
    const failure = this.failure;
    this.failure = null;
    if (failure) throw failure;
  }

  private find(hostname: string): [string, FakeHostname] {
    const found = [...this.hostnames].find(([, entry]) => entry.hostname === hostname);
    if (!found) throw new Error(`No such hostname: ${hostname}`);
    return found;
  }

  /** The id the provider gave a hostname. */
  idOf(hostname: string): string {
    return this.find(hostname)[0];
  }

  private records(hostname: string, verified: boolean): DnsRecord[] {
    return [{ type: "CNAME", name: hostname, value: this.target, verified }];
  }

  /** The partner's CNAME reaches the provider and its certificate is issued. */
  activate(hostname: string): void {
    const [id, entry] = this.find(hostname);
    this.hostnames.set(id, { ...entry, state: "active", records: this.records(hostname, true), errors: [] });
  }

  /** The provider gives up on the hostname, saying why. */
  fail(hostname: string, errors: string[]): void {
    const [id, entry] = this.find(hostname);
    this.hostnames.set(id, { ...entry, state: "failed", errors });
  }

  async create(hostname: string): Promise<{ id: string }> {
    this.takeFailure();
    this.created.push(hostname);
    const existing = [...this.hostnames].find(([, entry]) => entry.hostname === hostname);
    if (existing) return { id: existing[0] };
    const id = `fake-hostname-${++this.next}`;
    this.hostnames.set(id, { hostname, state: "pending", records: this.records(hostname, false), errors: [] });
    return { id };
  }

  async status(id: string): Promise<CustomHostnameStatus> {
    this.takeFailure();
    const entry = this.hostnames.get(id);
    if (!entry) return { state: "failed", records: [], errors: ["The provider no longer has this hostname."] };
    return { state: entry.state, records: entry.records.map((record) => ({ ...record })), errors: [...entry.errors] };
  }

  async remove(id: string): Promise<void> {
    this.takeFailure();
    this.removed.push(id);
    this.hostnames.delete(id);
  }
}

/** DNS TXT records in memory, as a partner's DNS provider would publish them. */
export class FakeTxtRecords {
  readonly records = new Map<string, string[]>();
  private failure: Error | null = null;

  /** Publishes a value at a name, beside any already there. */
  add(name: string, value: string): void {
    this.records.set(name, [...(this.records.get(name) ?? []), value]);
  }

  /** Makes the next lookup throw, as a resolver does when the domain's DNS can't answer. */
  failNextLookup(error: Error = new Error("queryTxt ESERVFAIL")): void {
    this.failure = error;
  }

  readonly lookup: TxtLookup = async (name) => {
    const failure = this.failure;
    this.failure = null;
    if (failure) throw failure;
    return [...(this.records.get(name) ?? [])];
  };
}
