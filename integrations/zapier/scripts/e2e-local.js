'use strict';

// Runs the integration against a local LobbyStack dev stack through Zapier's
// app tester, the same harness `zapier-platform test` uses. It never talks to
// Zapier and refuses any base URL that is not on this machine.
//
//   LOBBYSTACK_BASE_URL=http://localhost:3000 \
//   LOBBYSTACK_API_KEY=<local test key from scripts/seed-zapier-local.ts> \
//   node scripts/e2e-local.js
//
// Set ZAPIER_E2E_EVENTS_FROM_DB=1 (with DATABASE_URL for the same local stack)
// to also read the webhook events the API recorded and run each trigger's
// perform on the real payload.

const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const zapier = require('zapier-platform-core');

const App = require('../index');
const { resolveBaseUrl, apiUrl } = require('../lib/client');

const baseUrl = process.env.LOBBYSTACK_BASE_URL;
const apiKey = process.env.LOBBYSTACK_API_KEY;
if (!baseUrl || !apiKey) throw new Error('Set LOBBYSTACK_BASE_URL and LOBBYSTACK_API_KEY.');
const host = new URL(resolveBaseUrl({ baseUrl })).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new Error('e2e-local only runs against a local LobbyStack.');

const appTester = zapier.createAppTester(App);
const authData = { apiKey, baseUrl };
const bundle = (extra = {}) => ({ authData, inputData: {}, meta: {}, ...extra });
const run = (method, extra) => appTester(method, bundle(extra));

const log = (step, detail) => console.log(`ok  ${step}${detail ? `  ${detail}` : ''}`);

const hookKeys = ['new_call', 'new_appointment', 'appointment_rescheduled', 'appointment_cancelled', 'new_message', 'new_contact'];

const listWebhooks = () =>
  run(async (z, b) => (await z.request({ url: apiUrl(b, '/webhooks') })).data.data);

const latestEvent = (type) => {
  const root = path.resolve(__dirname, '../../..');
  const out = execFileSync('pnpm', ['--silent', 'zapier:seed-local', 'latest-event', type], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.trim().split('\n').pop());
};

const main = async () => {
  const business = await run(App.authentication.test);
  assert.ok(business.name);
  log('authentication.test', `connection label: ${business.name}`);

  const badKey = await appTester(App.authentication.test, { authData: { apiKey: 'lsk_00000000_notARealKeyNotARealKeyNotARealK', baseUrl }, inputData: {}, meta: {} }).catch((error) => error);
  assert.equal(badKey.name, 'ExpiredAuthError');
  log('authentication.test with a revoked or unknown key', 'ExpiredAuthError');

  // Subscribe every REST hook. Deliveries to this .invalid host fail at DNS,
  // so no event leaves the machine.
  const subscriptions = {};
  for (const key of hookKeys) {
    const targetUrl = `https://zapier-e2e.invalid/hooks/${key}`;
    subscriptions[key] = await run(App.triggers[key].operation.performSubscribe, { targetUrl });
    assert.match(subscriptions[key].id, /^[0-9a-f-]{36}$/);
  }
  const endpoints = await listWebhooks();
  for (const key of hookKeys) {
    const endpoint = endpoints.find((item) => item.id === subscriptions[key].id);
    assert.ok(endpoint, `endpoint for ${key}`);
    assert.equal(endpoint.url, `https://zapier-e2e.invalid/hooks/${key}`);
  }
  log('performSubscribe x6', endpoints.filter((item) => Object.values(subscriptions).some((s) => s.id === item.id)).map((item) => item.events.join(',')).join(' '));

  // Actions and searches.
  const phone = `+1416555${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const contactInput = { name: 'Zapier Local Test', phone: phone.slice(2), email: `zapier-${phone.slice(-4)}@example.test` };
  const contact = await run(App.creates.create_contact.operation.perform, { inputData: contactInput });
  assert.equal(contact.phone, phone);
  log('create_contact', `${contact.id} ${contact.phone}`);

  const replay = await run(App.creates.create_contact.operation.perform, { inputData: contactInput });
  assert.equal(replay.id, contact.id);
  log('create_contact again with the same input', 'idempotent replay returned the same contact');

  const found = await run(App.searches.find_contact.operation.perform, { inputData: { phone } });
  assert.equal(found[0].id, contact.id);
  log('find_contact by phone', found[0].id);

  const updated = await run(App.creates.update_contact.operation.perform, { inputData: { contact_id: contact.id, name: 'Zapier Local Test Updated' } });
  assert.equal(updated.name, 'Zapier Local Test Updated');
  log('update_contact', updated.name);

  const services = await run(App.triggers.service_list.operation.perform);
  assert.ok(services.length > 0);
  const contactsDropdown = await run(App.triggers.contact_list.operation.perform);
  assert.ok(contactsDropdown.some((item) => item.id === contact.id && item.label));
  log('dropdowns', `${services.length} service(s), contact label "${contactsDropdown.find((item) => item.id === contact.id).label}"`);

  const day = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [availability] = await run(App.searches.check_availability.operation.perform, { inputData: { service_id: services[0].id, start_date: day } });
  assert.ok(availability && availability.slot_count > 4);
  log('check_availability', `${availability.slot_count} open times on ${day}, first ${availability.first_starts_at}`);

  const appointment = await run(App.creates.book_appointment.operation.perform, {
    inputData: { service_id: services[0].id, starts_at: availability.slots[2].starts_at, contact_id: contact.id, sms_consent: 'false' },
  });
  assert.equal(appointment.status, 'confirmed');
  log('book_appointment', `${appointment.id} at ${appointment.starts_at}`);

  const taken = await run(App.creates.book_appointment.operation.perform, {
    inputData: { service_id: services[0].id, starts_at: availability.slots[2].starts_at, contact_phone: '+14165550100' },
  }).catch((error) => error);
  assert.match(taken.message, /no longer available/);
  log('book_appointment on a taken time', 'slot_unavailable mapped to a helpful message');

  const upcoming = await run(App.triggers.appointment_list.operation.perform);
  assert.ok(upcoming.some((item) => item.id === appointment.id));
  const foundAppointment = await run(App.searches.find_appointment.operation.perform, { inputData: { contact_id: contact.id } });
  assert.equal(foundAppointment[0].id, appointment.id);
  log('find_appointment by contact', foundAppointment[0].id);

  const moved = await run(App.creates.reschedule_appointment.operation.perform, { inputData: { appointment_id: appointment.id, starts_at: availability.slots[6].starts_at } });
  assert.equal(moved.starts_at, availability.slots[6].starts_at);
  log('reschedule_appointment', moved.starts_at);

  const cancelled = await run(App.creates.cancel_appointment.operation.perform, { inputData: { appointment_id: appointment.id } });
  assert.equal(cancelled.status, 'cancelled');
  log('cancel_appointment', cancelled.status);

  const entry = await run(App.creates.add_knowledge.operation.perform, { inputData: { type: 'faq', question: `Is there parking? (${phone.slice(-4)})`, answer: 'Yes, behind the building.' } });
  assert.equal(entry.type, 'faq');
  log('add_knowledge', `${entry.id} ${entry.type}`);

  // performList for every trigger, now that there is data.
  for (const key of hookKeys) {
    const items = await run(App.triggers[key].operation.performList);
    const sampleKeys = Object.keys(App.triggers[key].operation.sample).sort();
    for (const item of items) assert.deepEqual(Object.keys(item).sort(), sampleKeys, `${key} item keys match the sample`);
    log(`performList ${key}`, `${items.length} item(s), keys match the static sample`);
  }

  if (process.env.ZAPIER_E2E_EVENTS_FROM_DB === '1') {
    const checks = [
      ['new_contact', 'contact.created', contact.id],
      ['new_appointment', 'appointment.booked', appointment.id],
      ['appointment_rescheduled', 'appointment.rescheduled', appointment.id],
      ['appointment_cancelled', 'appointment.cancelled', appointment.id],
    ];
    for (const [key, type, id] of checks) {
      const payload = latestEvent(type);
      assert.ok(payload, `a ${type} event was recorded`);
      const results = await run(App.triggers[key].operation.perform, { cleanedRequest: payload });
      assert.equal(results.length, 1);
      assert.equal(results[0].id, id);
      assert.deepEqual(Object.keys(results[0]).sort(), Object.keys(App.triggers[key].operation.sample).sort());
      log(`perform ${key} on the recorded ${type} payload`, results[0].id);
    }
  }

  for (const key of hookKeys) {
    await run(App.triggers[key].operation.performUnsubscribe, { subscribeData: subscriptions[key] });
  }
  const remaining = await listWebhooks();
  assert.ok(!remaining.some((item) => Object.values(subscriptions).some((s) => s.id === item.id)));
  log('performUnsubscribe x6', 'endpoints deleted');

  console.log('\nAll local end-to-end checks passed.');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
