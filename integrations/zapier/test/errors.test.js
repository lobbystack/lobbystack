/* globals describe, it, expect, afterEach */
'use strict';

const { App, api, apiError, appTester, bundleWith, nock } = require('./helpers');
const { normalizePhone, idempotencyKey } = require('../lib/client');

afterEach(() => nock.cleanAll());

const listContacts = App.triggers.new_contact.operation.performList;

describe('error mapping', () => {
  it('throws ThrottledError with the Retry-After delay on 429', async () => {
    api()
      .get('/contacts')
      .query(true)
      .reply(429, apiError('rate_limited', 'Too many requests. Retry in 17 seconds.'), { 'Retry-After': '17' });
    const error = await appTester(listContacts, bundleWith()).catch((caught) => caught);
    expect(error.name).toBe('ThrottledError');
    expect(JSON.parse(error.message).delay).toBe(17);
  });

  it('throws ThrottledError when the rate limiter is unavailable', async () => {
    api()
      .get('/contacts')
      .query(true)
      .reply(503, apiError('rate_limit_unavailable', 'The API is temporarily unavailable. Retry shortly.'), { 'Retry-After': '5' });
    const error = await appTester(listContacts, bundleWith()).catch((caught) => caught);
    expect(error.name).toBe('ThrottledError');
    expect(JSON.parse(error.message).delay).toBe(5);
  });

  it('throws ExpiredAuthError on 401', async () => {
    api().get('/contacts').query(true).reply(401, apiError('unauthorized', 'The API key is invalid or has been revoked.'));
    await expect(appTester(listContacts, bundleWith())).rejects.toMatchObject({ name: 'ExpiredAuthError' });
  });

  it('tells the user which scope to add on 403 insufficient_scope', async () => {
    api().get('/contacts').query(true).reply(403, apiError('insufficient_scope', 'This API key needs the contacts:read scope.'));
    const error = await appTester(listContacts, bundleWith()).catch((caught) => caught);
    const body = JSON.parse(error.message);
    expect(body).toMatchObject({ code: 'insufficient_scope', status: 403 });
    expect(body.message).toMatch(/contacts:read scope.*Settings > API keys/);
  });

  it('keeps the error reference on 500', async () => {
    api().get('/contacts').query(true).reply(500, apiError('internal_error', 'Something went wrong on our side. Reference: abc.'));
    await expect(appTester(listContacts, bundleWith())).rejects.toThrow(/Reference: abc/);
  });

  it('handles a non-JSON error body', async () => {
    api().get('/contacts').query(true).reply(502, '<html>Bad gateway</html>', { 'Content-Type': 'text/html' });
    await expect(appTester(listContacts, bundleWith())).rejects.toThrow(/LobbyStack had a problem/);
  });
});

describe('helpers', () => {
  it.each([
    ['+1 (416) 555-0134', '+14165550134'],
    ['416-555-0134', '+14165550134'],
    ['14165550134', '+14165550134'],
    ['0033 1 23 45 67 89', '+33123456789'],
    ['+33 1 23 45 67 89', '+33123456789'],
    ['', undefined],
  ])('normalizes phone %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('builds idempotency keys that depend on the action, the Zap and the input', () => {
    const base = { meta: { zap: { id: '1' } } };
    const key = idempotencyKey(base, 'create_contact', { phone: '+1' });
    expect(key.length).toBeLessThanOrEqual(255);
    expect(idempotencyKey(base, 'create_contact', { phone: '+1' })).toBe(key);
    expect(idempotencyKey(base, 'create_contact', { phone: '+2' })).not.toBe(key);
    expect(idempotencyKey(base, 'add_knowledge', { phone: '+1' })).not.toBe(key);
    expect(idempotencyKey({ meta: { zap: { id: '2' } } }, 'create_contact', { phone: '+1' })).not.toBe(key);
  });
});
