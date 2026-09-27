/* globals describe, it, expect, afterEach */
'use strict';

const { App, TEST_API_KEY, api, apiError, appTester, bundleWith, nock } = require('./helpers');
const { samples } = require('../lib/resources');
const { resolveBaseUrl } = require('../lib/client');

afterEach(() => nock.cleanAll());

describe('authentication', () => {
  it('tests the key with GET /business and returns the business for the label', async () => {
    const scope = api().get('/business').reply(200, { data: samples.business });
    const result = await appTester(App.authentication.test, bundleWith());
    expect(result.name).toBe('Maple Street Dental');
    expect(App.authentication.connectionLabel).toBe('{{name}}');
    scope.done();
  });

  it('uses a self-hosted base URL and ignores a trailing /api/v1', async () => {
    const scope = nock('https://lobbystack.acme.test/api/v1', { reqheaders: { authorization: `Bearer ${TEST_API_KEY}` } })
      .get('/business')
      .reply(200, { data: samples.business });
    await appTester(App.authentication.test, bundleWith({ authData: { baseUrl: 'https://lobbystack.acme.test/api/v1/' } }));
    scope.done();
  });

  it('asks the user to reconnect when the key is invalid or revoked', async () => {
    api().get('/business').reply(401, apiError('unauthorized', 'The API key is invalid or has been revoked.'));
    await expect(appTester(App.authentication.test, bundleWith())).rejects.toMatchObject({
      name: 'ExpiredAuthError',
      message: expect.stringContaining('invalid or was revoked'),
    });
  });

  it('explains a missing scope', async () => {
    api().get('/business').reply(403, apiError('insufficient_scope', 'This API key needs the business:read scope.'));
    await expect(appTester(App.authentication.test, bundleWith())).rejects.toThrow(/business:read scope/);
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
