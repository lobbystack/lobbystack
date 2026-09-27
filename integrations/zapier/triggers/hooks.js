'use strict';

const { apiUrl, listPage } = require('../lib/client');
const { verifyDelivery } = require('../lib/signature');
const { outputFields, samples } = require('../lib/resources');

const SAMPLE_PAGE_SIZE = 25;

// Builds a REST hook trigger. Subscribing creates a v1 webhook endpoint for one
// event; the payload's `data` is the same object the list endpoint returns, so
// performList gives Zapier real sample data in the same shape.
const createHookTrigger = ({ key, noun, label, description, event, resource, listPath, listParams = {}, filter }) => {
  const performSubscribe = async (z, bundle) => {
    const response = await z.request({
      url: apiUrl(bundle, '/webhooks'),
      method: 'POST',
      body: {
        url: bundle.targetUrl,
        events: [event],
        description: `Zapier: ${label}`,
      },
    });
    // Zapier stores subscribeData with the Zap, so perform can check each
    // delivery's signature against this endpoint's secret.
    return { id: response.data.data.id, secret: response.data.data.secret };
  };

  const performUnsubscribe = async (z, bundle) => {
    const id = bundle.subscribeData && bundle.subscribeData.id;
    if (!id) return {};
    const response = await z.request({
      url: apiUrl(bundle, `/webhooks/${encodeURIComponent(id)}`),
      method: 'DELETE',
      skipThrowForStatus: true,
    });
    // The endpoint may already be gone if someone deleted it in LobbyStack.
    if (response.status === 404) return { id, deleted: true };
    if (response.status >= 400) response.throwForStatus();
    return response.data.data;
  };

  const perform = async (z, bundle) => {
    const secret = bundle.subscribeData && bundle.subscribeData.secret;
    let payload = bundle.cleanedRequest || {};
    // Subscriptions made before signatures were checked have no secret.
    // LOBBYSTACK_SKIP_WEBHOOK_SIGNATURE=1 (zapier-platform env:set) turns the
    // check off without a new version if Zapier ever changes rawRequest.
    if (secret && process.env.LOBBYSTACK_SKIP_WEBHOOK_SIGNATURE !== '1') {
      const result = verifyDelivery(secret, bundle.rawRequest);
      if (!result.ok) {
        throw new z.errors.Error(`Ignored a webhook delivery that LobbyStack did not sign (${result.reason}).`, 'invalid_signature', 401);
      }
      // Read the event from the exact bytes that were verified.
      payload = JSON.parse(bundle.rawRequest.content);
    }
    // Ignore test pings and anything that is not the subscribed event.
    if (!payload || payload.type !== event || !payload.data || typeof payload.data !== 'object') return [];
    return [payload.data];
  };

  const performList = async (z, bundle) => {
    const body = await listPage(z, bundle, listPath, { limit: SAMPLE_PAGE_SIZE, ...listParams });
    const items = Array.isArray(body.data) ? body.data : [];
    return filter ? items.filter(filter) : items;
  };

  return {
    key,
    noun,
    display: { label, description },
    operation: {
      type: 'hook',
      performSubscribe,
      performUnsubscribe,
      perform,
      performList,
      sample: samples[resource],
      outputFields: outputFields[resource],
    },
  };
};

module.exports = { createHookTrigger };
