'use strict';

const crypto = require('crypto');

// Standard Webhooks verification for REST hook deliveries. LobbyStack signs
// `${webhook-id}.${webhook-timestamp}.${raw body}` with HMAC-SHA256, keyed by
// the base64 part of the endpoint's whsec_ secret, and sends one or more
// space-separated `v1,<base64>` values in webhook-signature.
//
// Zapier passes the delivery to perform as bundle.rawRequest. Its docs say
// headers other than Content-Length and Content-Type arrive prefixed with
// "Http-" and in Camel-Case (Http-Webhook-Id), and content is the raw body.
// The lookup below also accepts unprefixed and lower-case names.
//
// No timestamp window is enforced: Zapier can run perform some time after the
// delivery arrives, and a stale-timestamp check could drop real events.

const SECRET_PREFIX = 'whsec_';

const header = (headers, name) => {
  if (!headers || typeof headers !== 'object') return undefined;
  const wanted = [name, `http-${name}`];
  for (const [key, value] of Object.entries(headers)) {
    if (wanted.includes(key.toLowerCase())) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
};

const sign = (secret, id, timestamp, body) => {
  const key = Buffer.from(secret.slice(SECRET_PREFIX.length), 'base64');
  return crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
};

const safeEqual = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

/**
 * Returns { ok: true } when rawRequest carries a valid signature for secret,
 * or { ok: false, reason } otherwise.
 */
const verifyDelivery = (secret, rawRequest) => {
  if (typeof secret !== 'string' || !secret.startsWith(SECRET_PREFIX)) return { ok: false, reason: 'no signing secret' };
  const raw = rawRequest || {};
  const id = header(raw.headers, 'webhook-id');
  const timestamp = header(raw.headers, 'webhook-timestamp');
  const signatures = header(raw.headers, 'webhook-signature');
  const body = typeof raw.content === 'string' ? raw.content : undefined;
  if (!id || !timestamp || !signatures || body === undefined) return { ok: false, reason: 'missing signature headers or body' };
  const expected = sign(secret, id, timestamp, body);
  const matched = String(signatures)
    .split(' ')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .some((part) => safeEqual(part.slice(3), expected));
  return matched ? { ok: true } : { ok: false, reason: 'signature mismatch' };
};

module.exports = { verifyDelivery, sign };
