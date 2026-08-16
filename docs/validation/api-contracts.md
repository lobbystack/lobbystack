# Admin API Contracts

Admin routes use the following response conventions:

- Errors are JSON objects with `error` and an optional machine-readable `code`.
- List responses include `pagination.limit`, `pagination.offset`, and `pagination.hasNext`; `pagination.total` is included when counting is inexpensive.
- Successful mutations return `ok: true` and may include resource identifiers or updated state.
- Every business-scoped route derives authorization from the authenticated session and verifies membership inside the domain transaction. Client-provided `businessId` values never grant access.
- Mutating routes require `business_admin` or `business_owner` unless a route explicitly documents a narrower role such as `scheduler`.
- Viewer requests may read tenant-scoped data but receive a server-side authorization error for mutations.

The shared TypeScript definitions and helpers live in `apps/admin/src/lib/api-helpers.ts`.
