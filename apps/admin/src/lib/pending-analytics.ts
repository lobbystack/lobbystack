// A queued event waits in sessionStorage for the next identify, and after signup
// that only happens once the first workspace exists, however long the operator
// takes. The tab already bounds the wait; the one-day cap only drops a record
// left in a restored or forgotten tab rather than crediting it to whoever signs
// in there days later. Consuming a record removes it, so it is sent at most once.
const maxAgeMs = 24 * 60 * 60_000;

export function isFreshPendingRecord(record: { createdAt?: unknown }): boolean {
  if (typeof record.createdAt !== "number") return false;
  const age = Date.now() - record.createdAt;
  return age >= 0 && age <= maxAgeMs;
}
