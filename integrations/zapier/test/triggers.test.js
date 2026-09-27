/* globals describe, it, expect, afterEach */
'use strict';

const { App, api, appTester, bundleWith, nock, page } = require('./helpers');
const { samples } = require('../lib/resources');
const { cursorPage } = require('../triggers/dropdowns');

afterEach(() => nock.cleanAll());

const hookTriggers = [
  { key: 'new_call', event: 'call.completed', resource: 'call', list: ['/calls', {}] },
  { key: 'new_appointment', event: 'appointment.booked', resource: 'appointment', list: ['/appointments', { status: 'confirmed' }] },
  { key: 'appointment_rescheduled', event: 'appointment.rescheduled', resource: 'appointment', list: ['/appointments', { status: 'confirmed' }] },
  { key: 'appointment_cancelled', event: 'appointment.cancelled', resource: 'appointment', list: ['/appointments', { status: 'cancelled' }] },
  { key: 'new_message', event: 'message.taken', resource: 'message', list: ['/messages', {}] },
  { key: 'new_contact', event: 'contact.created', resource: 'contact', list: ['/contacts', {}] },
];

const HOOK_URL = 'https://hooks.zapier.com/hooks/standard/1/abc/';
const WEBHOOK_ID = '11111111-2222-4333-8444-555555555555';

describe.each(hookTriggers)('$key trigger', ({ key, event, resource, list }) => {
  const trigger = App.triggers[key];

  it('is a REST hook with a sample whose keys are all output fields', () => {
    expect(trigger.operation.type).toBe('hook');
    const outputKeys = trigger.operation.outputFields.map((field) => field.key);
    expect(Object.keys(trigger.operation.sample).sort()).toEqual([...outputKeys].sort());
    expect(trigger.display.description).toMatch(/^Triggers when .+\.$/);
  });

  it('subscribes a webhook endpoint for its event and keeps only the id', async () => {
    const scope = api()
      .post('/webhooks', { url: HOOK_URL, events: [event], description: `Zapier: ${trigger.display.label}` })
      .reply(201, { data: { id: WEBHOOK_ID, url: HOOK_URL, events: [event], secret: 'whsec_notreal' } });
    const result = await appTester(trigger.operation.performSubscribe, bundleWith({ targetUrl: HOOK_URL }));
    expect(result).toEqual({ id: WEBHOOK_ID });
    scope.done();
  });

  it('unsubscribes by deleting the endpoint', async () => {
    const scope = api().delete(`/webhooks/${WEBHOOK_ID}`).reply(200, { data: { id: WEBHOOK_ID, deleted: true } });
    const result = await appTester(trigger.operation.performUnsubscribe, bundleWith({ subscribeData: { id: WEBHOOK_ID } }));
    expect(result).toEqual({ id: WEBHOOK_ID, deleted: true });
    scope.done();
  });

  it('treats an endpoint that is already gone as unsubscribed', async () => {
    api().delete(`/webhooks/${WEBHOOK_ID}`).reply(404, { error: { code: 'not_found', message: 'Webhook endpoint not found.' } });
    const result = await appTester(trigger.operation.performUnsubscribe, bundleWith({ subscribeData: { id: WEBHOOK_ID } }));
    expect(result).toEqual({ id: WEBHOOK_ID, deleted: true });
  });

  it('returns the payload data for its event', async () => {
    const payload = {
      id: 'e0000000-0000-4000-8000-000000000001',
      type: event,
      api_version: 'v1',
      created_at: '2026-09-22T15:05:16Z',
      business_id: samples.business.id,
      data: samples[resource],
    };
    const results = await appTester(trigger.operation.perform, bundleWith({ cleanedRequest: payload }));
    expect(results).toEqual([samples[resource]]);
  });

  it('ignores test events and other event types', async () => {
    const results = await appTester(
      trigger.operation.perform,
      bundleWith({ cleanedRequest: { type: 'webhook.test', data: { endpoint_id: WEBHOOK_ID, message: 'Test' } } }),
    );
    expect(results).toEqual([]);
  });

  it('lists recent items from the matching endpoint for samples', async () => {
    const [path, params] = list;
    const scope = api()
      .get(path)
      .query({ limit: '25', ...params })
      .reply(200, page([samples[resource]]));
    const results = await appTester(trigger.operation.performList, bundleWith());
    expect(results).toEqual([samples[resource]]);
    scope.done();
  });
});

describe('new_call performList', () => {
  it('leaves out calls that are still in progress', async () => {
    api()
      .get('/calls')
      .query({ limit: '25' })
      .reply(200, page([{ ...samples.call, id: 'live', status: 'in_progress' }, samples.call]));
    const results = await appTester(App.triggers.new_call.operation.performList, bundleWith());
    expect(results.map((call) => call.id)).toEqual([samples.call.id]);
  });
});

describe('dropdown triggers', () => {
  it('lists services', async () => {
    api().get('/services').reply(200, page([samples.service]));
    const results = await appTester(App.triggers.service_list.operation.perform, bundleWith());
    expect(results).toEqual([samples.service]);
  });

  it('lists contacts with a readable label', async () => {
    api().get('/contacts').query({ limit: '100' }).reply(200, page([samples.contact, { ...samples.contact, id: 'x', name: null, email: null }]));
    const results = await appTester(App.triggers.contact_list.operation.perform, bundleWith());
    expect(results[0].label).toBe('Jordan Lee · +14165550134 · jordan.lee@example.com');
    expect(results[1].label).toBe('+14165550134');
  });

  it('lists upcoming confirmed appointments with the local start time', async () => {
    api()
      .get('/appointments')
      .query((query) => query.status === 'confirmed' && query.limit === '100' && Boolean(Date.parse(query.starts_after)))
      .reply(200, page([samples.appointment]));
    const results = await appTester(App.triggers.appointment_list.operation.perform, bundleWith());
    expect(results[0].label).toBe('Sep 29, 2026, 10:00 AM · Cleaning · Jordan Lee');
  });

  it('pages with the API cursor between dropdown pages', async () => {
    const stored = [];
    let cursor = '';
    const z = {
      request: async ({ params }) => ({
        data: params.cursor ? page([{ id: 'second' }]) : page([{ id: 'first' }], { next_cursor: 'c2', has_more: true }),
      }),
      cursor: { get: async () => cursor, set: async (value) => { stored.push(value); cursor = value; } },
    };
    const first = await cursorPage(z, bundleWith({ meta: { page: 0 } }), '/contacts', {});
    const second = await cursorPage(z, bundleWith({ meta: { page: 1 } }), '/contacts', {});
    const third = await cursorPage(z, bundleWith({ meta: { page: 2 } }), '/contacts', {});
    expect([first, second, third]).toEqual([[{ id: 'first' }], [{ id: 'second' }], []]);
    expect(stored).toEqual(['c2', '']);
  });
});
