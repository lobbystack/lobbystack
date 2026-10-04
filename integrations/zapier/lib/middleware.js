'use strict';

// Messages for error codes where the API's own message does not tell a Zapier
// user what to change.
const CODE_MESSAGES = {
  booking_requires_confirmation:
    'This business takes booking requests that the team confirms, so Zapier cannot book appointments directly. In LobbyStack, go to Agent > Booking and set Appointments to "Books appointments", then try again.',
  booking_disabled:
    'Booking is turned off for this business. In LobbyStack, go to Agent > Booking and set Appointments to "Books appointments", then try again.',
  slot_unavailable:
    'That time is no longer available. Use the Check Availability search to pick an open time, then try again.',
  idempotency_key_reused:
    'LobbyStack already received a different request from this step with the same idempotency key. Change a field value and try again.',
  idempotency_request_in_progress:
    'LobbyStack is still processing the same request from this step. Try again in a few seconds.',
};

const addAuthHeader = (request, z, bundle) => {
  const apiKey = String((bundle.authData && bundle.authData.apiKey) || '').trim();
  request.headers = request.headers || {};
  if (apiKey) request.headers.Authorization = `Bearer ${apiKey}`;
  request.headers.Accept = 'application/json';
  return request;
};

const readError = (response) => {
  let body = response.data;
  if (body === undefined || body === null || typeof body !== 'object') {
    try {
      body = JSON.parse(response.content);
    } catch (error) {
      body = null;
    }
  }
  const error = (body && body.error) || {};
  return {
    code: typeof error.code === 'string' ? error.code : null,
    message: typeof error.message === 'string' ? error.message : null,
    details: Array.isArray(error.details) ? error.details : [],
  };
};

const detailText = (details) =>
  details
    .filter((detail) => detail && detail.message)
    .map((detail) => (detail.path && detail.path !== '(body)' ? `${detail.path}: ${detail.message}` : detail.message))
    .join('; ');

const retryAfterSeconds = (response, fallback) => {
  const value = parseInt(response.getHeader('retry-after') || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

// Turns v1 error responses into Zapier errors with messages a Zap owner can act on.
const handleErrors = (response, z) => {
  if (response.status < 400 || response.skipThrowForStatus) return response;
  const { code, message, details } = readError(response);

  if (response.status === 401) {
    throw new z.errors.ExpiredAuthError(
      'Your LobbyStack API key is invalid or was revoked. Create a new key in LobbyStack under Settings > API keys, then reconnect your account.',
    );
  }
  if (response.status === 429 || code === 'rate_limited') {
    throw new z.errors.ThrottledError(
      message || 'LobbyStack received too many requests. Zapier will retry shortly.',
      retryAfterSeconds(response, 60),
    );
  }
  if (response.status === 503 && code === 'rate_limit_unavailable') {
    throw new z.errors.ThrottledError(
      message || 'LobbyStack is temporarily unavailable. Zapier will retry shortly.',
      retryAfterSeconds(response, 5),
    );
  }
  if (response.status === 403) {
    const text =
      code === 'insufficient_scope'
        ? `${message || 'This API key is missing a permission.'} Edit the key in LobbyStack under Settings > API keys, or create a key with that scope and reconnect.`
        : message || 'This API key is not allowed to do that.';
    throw new z.errors.Error(text, code || 'forbidden', 403);
  }

  const known = code && CODE_MESSAGES[code];
  const detail = detailText(details);
  let text = known || message || `LobbyStack returned HTTP ${response.status}.`;
  if (!known && detail) text = `${text} ${detail}.`.replace(/\.\.$/, '.');
  if (response.status >= 500) {
    throw new z.errors.Error(
      `LobbyStack had a problem on its side. ${message || ''}`.trim(),
      code || 'internal_error',
      response.status,
    );
  }
  throw new z.errors.Error(text, code || 'error', response.status);
};

module.exports = {
  befores: [addAuthHeader],
  afters: [handleErrors],
};
