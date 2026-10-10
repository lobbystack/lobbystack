# Follow the admin API contracts

Admin routes use the following response conventions:

- Errors are JSON objects with `error` and an optional machine-readable `code`.
- List responses include `pagination.limit`, `pagination.offset`, and `pagination.hasNext`; `pagination.total` is included when counting is inexpensive.
- Successful mutations return `ok: true` and may include resource identifiers or updated state.
- Every business-scoped route derives authorization from the authenticated session and verifies membership inside the domain transaction. Client-provided `businessId` values never grant access.
- Mutating routes require `business_admin` or `business_owner` unless a route explicitly documents a narrower role such as `scheduler`.
- Viewer requests may read tenant-scoped data but receive a server-side authorization error for mutations.

## Write an operator route

Wrap a dashboard route in `operatorRoute` from `apps/admin/src/lib/operator-request.ts`. For a route that doesn't act on one business, such as `/api/account`, use `signedInRoute`. Your handler gets the verified session, the JSON body, the business ID and the domain context:

- A request can name its business in `?businessId=`, in the `x-business-id` header or in a `businessId` body field. Each name must be a UUID and all of them must match, or the route answers 400. A request that names no business acts on the user's active business.
- The body must be a JSON object. An empty body reads as `{}`.
- `transaction` runs your callback in the business's transaction once the user's membership, and an optional minimum role, check out.

The route turns an error you throw into a response:

- An error with a numeric `status` keeps that status, its message and its `code`.
- A failed Zod schema check returns 400.
- Any other error returns 500 with `Request failed.` and an `errorId`, and the server reports it.

`apps/admin/src/lib/api-helpers.ts` holds the database clients, `jsonError` and `asApiResponse`. Public routes such as `/api/widget/config` and `/api/voice/live/session` call `asApiResponse` for the same error mapping.
