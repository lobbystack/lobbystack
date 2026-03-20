# Security Best Practices Report

Date: 2026-03-20

Scope reviewed:
- Frontend: `apps/web`
- Voice gateway: `apps/voice-gateway`
- Backend and file handling: `convex`
- Dependency tree: `package.json`, `pnpm-lock.yaml`

## Executive Summary

This audit found 4 actionable security issues: 2 high severity, 1 medium severity, and 1 low severity. The most important risks are an unauthenticated websocket upgrade path on the Twilio media-stream endpoint and an untrusted image preview pipeline that currently depends on a vulnerable transitive parser. I did not find an obvious broken authorization boundary in the reviewed dashboard-facing Convex functions; the strongest issues are around ingress hardening, file processing, and secure authentication defaults.

## High Severity

### S-001: Validate Twilio signatures before accepting `/media-stream` websocket upgrades

Severity: High

Evidence:
- `apps/voice-gateway/src/http/server.ts:25-41` upgrades any request whose path is `/media-stream` by calling `mediaStreamServer.handleUpgrade(...)` immediately after the pathname check.
- `apps/voice-gateway/src/telephony/mediaStream.ts:984-988` performs `ensureMediaStreamRequestIsAllowed()` only after the websocket is already established and the first message arrives.
- `apps/voice-gateway/src/telephony/mediaStream.ts:1115-1137` contains the actual Twilio signature validation and closes invalid sockets after the upgrade has already consumed a websocket connection.
- `apps/voice-gateway/src/telephony/twilioRequest.ts:35-62` shows the signature helper only needs the URL and header, so this validation can happen during the HTTP upgrade phase.

Why this matters:
An unauthenticated internet client can complete the websocket upgrade and hold an idle `/media-stream` connection open without ever sending a valid Twilio-signed frame. That creates an avoidable socket and memory exhaustion path on the voice gateway, especially if the service is directly reachable from the public internet.

Recommended fix:
- Validate the `X-Twilio-Signature` inside the `upgrade` handler before calling `handleUpgrade(...)`.
- Reject invalid or missing signatures with an HTTP error response and destroy the socket immediately.
- Keep the in-session validation as defense in depth if desired, but do not rely on message-time validation as the first gate.

### S-002: Remove the vulnerable `file-type` parser from the untrusted image preview path

Severity: High

Evidence:
- `package.json:18-33` pulls in `jimp` as a production dependency.
- `pnpm-lock.yaml:2896-2898` locks `file-type@16.5.4`.
- `convex/integrations/messageMedia.ts:32-45` fetches stored user/Twilio media and passes it into the preview pipeline.
- `convex/lib/node/imagePreviews.ts:30-45` decodes untrusted blobs with `Jimp.fromBuffer(...)`.
- `pnpm audit --prod` reports `GHSA-5v7r-6r5c-r473` for `file-type >=13.0.0 <21.3.1`, and `pnpm why file-type` shows that dependency is brought in through `jimp`.

Why this matters:
The application decodes untrusted uploaded images and inbound message media in a production code path, and that path currently depends on a transitive parser version with a published infinite-loop advisory. A malformed file can therefore tie up preview generation workers and degrade attachment handling availability.

Recommended fix:
- Upgrade or replace the preview stack so the vulnerable `file-type` version is no longer reachable from production code.
- Add an explicit dependency override if needed to force a patched version while evaluating a longer-term library change.
- Keep strict file-size and image-dimension limits ahead of decode so malformed inputs are rejected before expensive parsing work begins.

## Medium Severity

### S-003: Enforce server-side per-file upload limits before storage and preview generation

Severity: Medium

Evidence:
- `convex/dashboard/messages.ts:582-590` issues upload URLs for attachments without attaching or checking any byte-size constraint.
- `apps/web/src/features/messages/MessagesPage.tsx:476-535` uploads each selected file as-is and does not apply a client-side size gate before sending it to storage.
- `convex/dashboard/messages.ts:618-626` reads the uploaded object metadata, but only returns the size instead of enforcing one.
- `convex/dashboard/messages.ts:693-726` validates content type and immediately generates previews for images, even though no hard per-file limit has been enforced.
- `convex/lib/messageAttachments.ts:115-150` enforces Twilio's 5 MB MMS total only later when resolving delivery modes, after storage and optional preview work have already happened.

Why this matters:
Any authenticated operator can upload arbitrarily large supported files into storage, and images can then be fed into the preview decoder before the system ever rejects them for delivery. That increases storage costs and creates an easy resource-exhaustion path against the preview pipeline, especially when combined with the parser issue above.

Recommended fix:
- Add a hard server-side per-file maximum in the finalize path and delete oversized blobs immediately.
- Mirror the same limit in the web client for better UX, but keep the server-side check authoritative.
- Consider separate limits for image previews versus link-only document attachments.

## Low Severity

### S-004: Strengthen the password policy beyond a bare 8-character minimum

Severity: Low

Evidence:
- `convex/lib/passwordPolicy.ts:1-4` accepts any non-empty password with length 8 or more.
- `convex/auth.ts:1-10` wires that check directly into the live password provider.

Why this matters:
The current rule allows extremely weak passwords such as common dictionary words or low-entropy repeated characters. That leaves account security overly dependent on users choosing strong secrets on their own and weakens the baseline protection against credential stuffing and password reuse.

Recommended fix:
- Raise the minimum length and add a blocklist or strength check for common and compromised passwords.
- Consider adding rate limiting and MFA in the authentication flow if those controls are not already enforced outside this repo.

## Runtime Verification Notes

These items were not scored as formal findings because they may be enforced outside this repository, but they should be verified explicitly:

- I did not find repo-visible configuration for `Content-Security-Policy`, `frame-ancestors` / `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, or `X-Content-Type-Options`. `apps/web/index.html:1-12` contains no meta-based fallback either. If these headers are set at the CDN or hosting layer, document that ownership; if not, add them there.
- `apps/voice-gateway/src/http/server.ts:12-24` creates the Fastify server without repo-visible hardening middleware such as `@fastify/helmet`. If the gateway is directly internet-facing, verify that equivalent headers and request size limits are enforced upstream.

## Suggested Remediation Order

1. Fix S-001 by validating Twilio signatures before websocket upgrade.
2. Fix S-002 by removing or overriding the vulnerable parser chain in the preview pipeline.
3. Fix S-003 by adding authoritative server-side upload size limits and early cleanup.
4. Fix S-004 by hardening password policy and confirming authentication rate-limiting controls.
