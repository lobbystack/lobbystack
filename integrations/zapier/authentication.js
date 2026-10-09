'use strict';

const { DEFAULT_BASE_URL, apiUrl } = require('./lib/client');

// GET /me works for any valid key, whatever its scopes, so a key made only
// for one action can still connect.
const test = async (z, bundle) => {
  const response = await z.request({ url: apiUrl(bundle, '/me'), method: 'GET' });
  const me = response.data.data;
  return {
    business_id: me.business.id,
    business_name: me.business.name,
    api_key_id: me.api_key.id,
    api_key_name: me.api_key.name,
    api_key_prefix: me.api_key.prefix,
    scopes: me.api_key.scopes,
  };
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'In LobbyStack, go to **Settings > API keys** and create a key for Zapier. It starts with `lsk_`. Any key connects; give it the scopes for the steps you plan to use. Triggers need `webhooks:manage` plus the read scope for their data, such as `calls:read` for new calls. [Learn more](https://docs.lobbystack.com/api/authentication).',
    },
    {
      key: 'baseUrl',
      label: 'LobbyStack URL',
      type: 'string',
      required: false,
      default: DEFAULT_BASE_URL,
      helpText:
        'Leave as is for LobbyStack Cloud. If you host LobbyStack yourself, enter the address you use to sign in, for example `https://lobbystack.yourcompany.com`.',
    },
  ],
  test,
  connectionLabel: '{{business_name}}',
};
