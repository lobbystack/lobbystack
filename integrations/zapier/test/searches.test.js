/* globals describe, it, expect, afterEach */
'use strict';

const { App, api, appTester, bundleWith, nock, page } = require('./helpers');
const { samples } = require('../lib/resources');

afterEach(() => nock.cleanAll());

describe('find_contact', () => {
  const perform = App.searches.find_contact.operation.perform;

  it('finds by phone in E.164', async () => {
    const scope = api().get('/contacts').query({ phone: '+14165550134', limit: '25' }).reply(200, page([samples.contact]));
    const results = await appTester(perform, bundleWith({ inputData: { phone: '416.555.0134' } }));
    expect(results).toEqual([samples.contact]);
    scope.done();
  });

  it('finds by email', async () => {
    const scope = api().get('/contacts').query({ email: 'jordan.lee@example.com', limit: '25' }).reply(200, page([samples.contact]));
    await appTester(perform, bundleWith({ inputData: { email: 'jordan.lee@example.com' } }));
    scope.done();
  });

  it('returns nothing when there is no match', async () => {
    api().get('/contacts').query(true).reply(200, page([]));
    expect(await appTester(perform, bundleWith({ inputData: { email: 'nobody@example.com' } }))).toEqual([]);
  });

  it('needs a phone or an email', async () => {
    await expect(appTester(perform, bundleWith({ inputData: {} }))).rejects.toThrow(/phone number or an email/);
  });

  it('pairs with Create Contact for find-or-create', () => {
    expect(App.searchOrCreates.find_contact).toMatchObject({ search: 'find_contact', create: 'create_contact' });
  });
});

describe('find_appointment', () => {
  const perform = App.searches.find_appointment.operation.perform;

  it('passes status and time filters to the API', async () => {
    const scope = api()
      .get('/appointments')
      .query({ status: 'confirmed', starts_after: '2026-09-29T04:00:00.000Z', limit: '25' })
      .reply(200, page([samples.appointment]));
    const results = await appTester(perform, bundleWith({ inputData: { status: 'confirmed', starts_after: '2026-09-29T00:00:00-04:00' } }));
    expect(results).toEqual([samples.appointment]);
    scope.done();
  });

  it('looks up the contact by phone, then filters appointments on the server', async () => {
    const scope = api()
      .get('/contacts')
      .query({ phone: '+14165550134', limit: '1' })
      .reply(200, page([samples.contact]))
      .get('/appointments')
      .query({ contact_id: samples.contact.id, limit: '25' })
      .reply(200, page([samples.appointment]));
    const results = await appTester(perform, bundleWith({ inputData: { contact_phone: '+1 416 555 0134' } }));
    expect(results.map((item) => item.id)).toEqual([samples.appointment.id]);
    scope.done();
  });

  it('returns nothing when no contact has the phone number', async () => {
    const scope = api().get('/contacts').query({ phone: '+14165550199', limit: '1' }).reply(200, page([]));
    expect(await appTester(perform, bundleWith({ inputData: { contact_phone: '+14165550199' } }))).toEqual([]);
    scope.done();
  });

  it('filters by the chosen contact on the server', async () => {
    const scope = api()
      .get('/appointments')
      .query({ contact_id: samples.contact.id, status: 'confirmed', limit: '25' })
      .reply(200, page([samples.appointment]));
    const results = await appTester(perform, bundleWith({ inputData: { contact_id: samples.contact.id, contact_phone: '+14165550000', status: 'confirmed' } }));
    expect(results.map((item) => item.id)).toEqual([samples.appointment.id]);
    scope.done();
  });
});

describe('check_availability', () => {
  const perform = App.searches.check_availability.operation.perform;
  const slots = [
    { starts_at: '2026-09-29T13:00:00Z', ends_at: '2026-09-29T14:00:00Z' },
    { starts_at: '2026-09-29T13:30:00Z', ends_at: '2026-09-29T14:30:00Z' },
  ];

  it('returns one result with the first opening and every slot', async () => {
    const scope = api()
      .get('/availability')
      .query({ service_id: samples.service.id, start_date: '2026-09-29', end_date: '2026-09-30' })
      .reply(200, page(slots));
    const results = await appTester(
      perform,
      bundleWith({ inputData: { service_id: samples.service.id, start_date: '2026-09-29T00:00:00-04:00', end_date: '2026-09-30' } }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ slot_count: 2, first_starts_at: slots[0].starts_at, slots });
    scope.done();
  });

  it('passes the chosen staff member', async () => {
    const scope = api()
      .get('/availability')
      .query({ service_id: samples.service.id, start_date: '2026-09-29', end_date: '2026-09-29', staff_id: samples.staff.id })
      .reply(200, page(slots));
    const [result] = await appTester(perform, bundleWith({ inputData: { service_id: samples.service.id, start_date: '2026-09-29', staff_id: samples.staff.id } }));
    expect(result.staff_id).toBe(samples.staff.id);
    expect(App.searches.check_availability.operation.inputFields.find((field) => field.key === 'staff_id').dynamic).toBe('staff_list.id.name');
    scope.done();
  });

  it('defaults the last day to the first day and returns nothing when fully booked', async () => {
    const scope = api()
      .get('/availability')
      .query({ service_id: samples.service.id, start_date: '2026-09-29', end_date: '2026-09-29' })
      .reply(200, page([]));
    expect(await appTester(perform, bundleWith({ inputData: { service_id: samples.service.id, start_date: '2026-09-29' } }))).toEqual([]);
    scope.done();
  });
});

describe('searches', () => {
  it.each(Object.keys(App.searches))('%s has a Finds description and a sample', (key) => {
    const search = App.searches[key];
    expect(search.display.description).toMatch(/^Finds .+\.$/);
    expect(search.operation.sample.id).toBeTruthy();
  });
});
