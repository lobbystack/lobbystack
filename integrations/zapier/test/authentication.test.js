/* globals describe, it, expect, afterEach */
'use strict';

const { App, TEST_API_KEY, api, apiError, appTester, bundleWith, nock } = require('./helpers');
const { samples } = require('../lib/resources');
const { resolveBaseUrl } = require('../lib/client');

afterEach(() => nock.cleanAll());

// GET /me for a key that only has knowledge:write.
const me = {
  api_key: { id: '8c7b6a59-4837-4261-9150-0f1e2d3c4b5a', name: 'Zapier', prefix: 'lsk_1a2b3c4d', scopes: ['knowledge:write'], created_at: '2026-09-20T12:00:00Z' },
  business: { id: samples.business.id, name: samples.business.name },
};

describe('authentication', () => {
  it('tests the key with GET /me, whatever its scopes, and labels the connection with the business name', async () => {
    const scope = api().get('/me').reply(200, { data: me });
    const result = await appTester(App.authentication.test, bundleWith());
    expect(result).toEqual({
      business_id: samples.business.id,
      business_name: 'Maple Street Dental',
      api_key_id: me.api_key.id,
      api_key_name: 'Zapier',
      api_key_prefix: 'lsk_1a2b3c4d',
      scopes: ['knowledge:write'],
    });
    expect(App.authentication.connectionLabel).toBe('{{business_name}}');
    scope.done();
  });

  it('uses a self-hosted base URL and ignores a trailing /api/v1', async () => {
    const scope = nock('https://lobbystack.acme.test/api/v1', { reqheaders: { authorization: `Bearer ${TEST_API_KEY}` } })
      .get('/me')
      .reply(200, { data: me });
    await appTester(App.authentication.test, bundleWith({ authData: { baseUrl: 'https://lobbystack.acme.test/api/v1/' } }));
    scope.done();
  });

  it('asks the user to reconnect when the key is invalid or revoked', async () => {
    api().get('/me').reply(401, apiError('unauthorized', 'The API key is invalid or has been revoked.'));
    await expect(appTester(App.authentication.test, bundleWith())).rejects.toMatchObject({
      name: 'ExpiredAuthError',
      message: expect.stringContaining('invalid or was revoked'),
    });
  });

});

describe('base URL', () => {
  it('defaults to LobbyStack Cloud', () => {
    expect(resolveBaseUrl({})).toBe('https://app.lobbystack.com');
    expect(resolveBaseUrl({ baseUrl: '  ' })).toBe('https://app.lobbystack.com');
  });

  it('adds https to a bare host and keeps a path prefix', () => {
    expect(resolveBaseUrl({ baseUrl: 'lobbystack.example.org' })).toBe('https://lobbystack.example.org');
    expect(resolveBaseUrl({ baseUrl: 'https://example.org/lobby/' })).toBe('https://example.org/lobby');
  });

  it('rejects plain HTTP except for a local development server', () => {
    expect(() => resolveBaseUrl({ baseUrl: 'http://lobbystack.example.org' })).toThrow(/https/);
    expect(resolveBaseUrl({ baseUrl: 'http://localhost:3000' })).toBe('http://localhost:3000');
    expect(resolveBaseUrl({ baseUrl: 'http://127.0.0.1:3000' })).toBe('http://127.0.0.1:3000');
  });

  it('rejects credentials in the URL and other schemes', () => {
    expect(() => resolveBaseUrl({ baseUrl: 'https://user:pass@example.org' })).toThrow(/username or password/);
    expect(() => resolveBaseUrl({ baseUrl: 'javascript:alert(1)' })).toThrow();
  });
});
