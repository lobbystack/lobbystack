'use strict';

const { DEFAULT_BASE_URL, apiUrl } = require('./lib/client');

const test = async (z, bundle) => {
  const response = await z.request({ url: apiUrl(bundle, '/business'), method: 'GET' });
  return response.data.data;
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
        'In LobbyStack, go to **Settings > API keys** and create a key for Zapier. It starts with `lsk_`. Give it the scopes for the steps you plan to use, including `webhooks:manage` for triggers. [Learn more](https://docs.lobbystack.com/api/authentication).',
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
  connectionLabel: '{{name}}',
};
