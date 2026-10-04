'use strict';

const crypto = require('crypto');

const DEFAULT_BASE_URL = 'https://app.lobbystack.com';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// Returns the origin of the LobbyStack install, without a trailing slash or
// /api/v1 suffix. Self-hosted installs must use HTTPS; plain HTTP is accepted
// only for a local development server on this machine.
const resolveBaseUrl = (authData = {}) => {
  const raw = String(authData.baseUrl || '').trim() || DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch (error) {
    throw new Error(`The LobbyStack URL "${raw}" is not a valid web address.`);
  }
  const local = LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('The LobbyStack URL must start with https://.');
  }
  if (url.username || url.password) {
    throw new Error('The LobbyStack URL must not contain a username or password.');
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return `${url.origin}${path}`;
};

const apiUrl = (bundle, path) => `${resolveBaseUrl(bundle.authData)}/api/v1${path}`;

// Stable JSON so the same input always hashes to the same key.
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};

// Zapier does not give non-buffered actions a per-run id, so the key is a
// hash of the Zap (when Zapier sends its id), the action and the request body.
// Zapier's own retries and replays of a step send the same key, and the API
// returns the first result instead of creating a duplicate. The API keeps keys
// for 24 hours.
const idempotencyKey = (bundle, action, body) => {
  const meta = bundle.meta || {};
  const runId = meta.id || (meta.zap && meta.zap.id) || null;
  const hash = crypto
    .createHash('sha256')
    .update(stableStringify({ action, runId, body }))
    .digest('hex');
  return `zapier_${action}_${hash.slice(0, 48)}`;
};

// Drops undefined, null and empty-string values so optional fields that the
// user left blank are not sent.
const compact = (object) =>
  Object.fromEntries(
    Object.entries(object).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );

// Accepts common phone formats and returns E.164. Ten-digit numbers are read
// as North American numbers; other countries need a leading + and country code.
const normalizePhone = (value) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const digits = text.replace(/[^\d]/g, '');
  if (text.startsWith('+')) return `+${digits}`;
  if (text.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
};

// Zapier sends datetime fields as ISO 8601 with an offset. Anything else is
// passed through so the API can explain what is wrong with it.
const isoDate = (value) => {
  const text = String(value || '').trim();
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) && /T/.test(text) ? parsed.toISOString() : text;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return undefined;
  return ['true', 'yes', '1', 'on'].includes(String(value).trim().toLowerCase());
};

// Reads one page of a v1 list endpoint and returns the items.
const listPage = async (z, bundle, path, params = {}) => {
  const response = await z.request({
    url: apiUrl(bundle, path),
    method: 'GET',
    params: compact(params),
  });
  return response.data;
};

module.exports = {
  DEFAULT_BASE_URL,
  apiUrl,
  compact,
  idempotencyKey,
  isoDate,
  listPage,
  normalizePhone,
  resolveBaseUrl,
  toBoolean,
};
