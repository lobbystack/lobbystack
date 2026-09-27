/* globals describe, it, expect, afterEach */
'use strict';

const { App, api, apiError, appTester, bundleWith, nock } = require('./helpers');
const { samples } = require('../lib/resources');

afterEach(() => nock.cleanAll());

const IDEMPOTENCY = /^zapier_[a-z_]+_[0-9a-f]{48}$/;

describe('create_contact', () => {
  const perform = App.creates.create_contact.operation.perform;

  it('creates a contact with a normalized phone and an idempotency key', async () => {
    let key;
    const scope = api()
      .post('/contacts', { name: 'Jordan Lee', phone: '+14165550134', email: 'jordan.lee@example.com' })
      .reply(function reply() {
        key = this.req.headers['idempotency-key'];
        return [201, { data: samples.contact }];
      });
    const result = await appTester(perform, bundleWith({ inputData: { name: 'Jordan Lee', phone: '(416) 555-0134', email: ' jordan.lee@example.com ', locale: '' } }));
    expect(result).toEqual(samples.contact);
    expect(key).toMatch(IDEMPOTENCY);
    scope.done();
  });

  it('sends the same idempotency key when Zapier retries the same step', async () => {
    const keys = [];
    api()
      .post('/contacts')
      .twice()
      .reply(function reply() {
        keys.push(this.req.headers['idempotency-key']);
        return [201, { data: samples.contact }];
      });
    const bundle = () => bundleWith({ inputData: { phone: '+14165550134' }, meta: { zap: { id: '42' } } });
    await appTester(perform, bundle());
    await appTester(perform, bundle());
    expect(keys[0]).toBe(keys[1]);
  });

  it('requires a phone or an email before calling the API', async () => {
    await expect(appTester(perform, bundleWith({ inputData: { name: 'No Contact Info' } }))).rejects.toThrow(/phone number or an email/);
  });

  it('shows the conflict message when the phone number is taken', async () => {
    api().post('/contacts').reply(409, apiError('conflict', `A contact with this phone number already exists: ${samples.contact.id}.`));
    await expect(appTester(perform, bundleWith({ inputData: { phone: '+14165550134' } }))).rejects.toThrow(/already exists/);
  });
});

describe('update_contact', () => {
  const perform = App.creates.update_contact.operation.perform;

  it('patches only the fields that were filled in', async () => {
    const scope = api()
      .patch(`/contacts/${samples.contact.id}`, { email: 'new@example.com' })
      .reply(200, { data: { ...samples.contact, email: 'new@example.com' } });
    const result = await appTester(perform, bundleWith({ inputData: { contact_id: samples.contact.id, email: 'new@example.com', name: '' } }));
    expect(result.email).toBe('new@example.com');
    scope.done();
  });

  it('asks for at least one field', async () => {
    await expect(appTester(perform, bundleWith({ inputData: { contact_id: samples.contact.id } }))).rejects.toThrow(/at least one field/);
  });

  it('uses a dropdown and a search for the contact', () => {
    const field = App.creates.update_contact.operation.inputFields.find((input) => input.key === 'contact_id');
    expect(field).toMatchObject({ dynamic: 'contact_list.id.label', search: 'find_contact.id', required: true });
  });
});

describe('book_appointment', () => {
  const perform = App.creates.book_appointment.operation.perform;
  const input = {
    service_id: samples.service.id,
    starts_at: '2026-09-29T10:00:00-04:00',
    contact_phone: '416-555-0134',
    contact_name: 'Jordan Lee',
    sms_consent: 'true',
  };

  it('books with the start time in UTC and an idempotency key', async () => {
    let key;
    const scope = api()
      .post('/appointments', {
        service_id: samples.service.id,
        starts_at: '2026-09-29T14:00:00.000Z',
        contact_phone: '+14165550134',
        contact_name: 'Jordan Lee',
        sms_consent: true,
      })
      .reply(function reply() {
        key = this.req.headers['idempotency-key'];
        return [201, { data: samples.appointment }];
      });
    const result = await appTester(perform, bundleWith({ inputData: input }));
    expect(result).toEqual(samples.appointment);
    expect(key).toMatch(IDEMPOTENCY);
    scope.done();
  });

  it('gets its service and staff choices from dropdowns', () => {
    const fields = App.creates.book_appointment.operation.inputFields;
    expect(fields.find((item) => item.key === 'service_id').dynamic).toBe('service_list.id.name');
    expect(fields.find((item) => item.key === 'staff_id')).toMatchObject({ dynamic: 'staff_list.id.name', required: false });
  });

  it('books with the chosen staff member', async () => {
    const scope = api()
      .post('/appointments', (body) => body.staff_id === samples.staff.id)
      .reply(201, { data: samples.appointment });
    await appTester(perform, bundleWith({ inputData: { ...input, staff_id: samples.staff.id } }));
    scope.done();
  });

  it('requires a contact or a phone number', async () => {
    await expect(appTester(perform, bundleWith({ inputData: { service_id: samples.service.id, starts_at: input.starts_at } }))).rejects.toThrow(/contact/);
  });

  it.each([
    ['booking_requires_confirmation', /Books appointments/],
    ['booking_disabled', /Booking is turned off/],
    ['slot_unavailable', /Check Availability/],
  ])('explains a 409 %s', async (code, message) => {
    api().post('/appointments').reply(409, apiError(code, 'raw api message'));
    await expect(appTester(perform, bundleWith({ inputData: input }))).rejects.toThrow(message);
  });

  it('lists invalid fields from a 400', async () => {
    api()
      .post('/appointments')
      .reply(400, apiError('invalid_request', 'The request body is invalid.', [{ path: 'starts_at', message: 'Must be in the future.' }]));
    await expect(appTester(perform, bundleWith({ inputData: input }))).rejects.toThrow(/starts_at: Must be in the future/);
  });
});

describe('cancel_appointment', () => {
  it('cancels the chosen appointment', async () => {
    const scope = api()
      .post(`/appointments/${samples.appointment.id}/cancel`)
      .reply(200, { data: { ...samples.appointment, status: 'cancelled' } });
    const result = await appTester(App.creates.cancel_appointment.operation.perform, bundleWith({ inputData: { appointment_id: samples.appointment.id } }));
    expect(result.status).toBe('cancelled');
    scope.done();
  });

  it('reports an unknown appointment', async () => {
    api().post('/appointments/missing/cancel').reply(404, apiError('not_found', 'Appointment not found.'));
    await expect(appTester(App.creates.cancel_appointment.operation.perform, bundleWith({ inputData: { appointment_id: 'missing' } }))).rejects.toThrow(/Appointment not found/);
  });
});

describe('reschedule_appointment', () => {
  it('moves the appointment to the new time', async () => {
    const scope = api()
      .post(`/appointments/${samples.appointment.id}/reschedule`, { starts_at: '2026-09-30T15:00:00.000Z' })
      .reply(200, { data: { ...samples.appointment, starts_at: '2026-09-30T15:00:00Z' } });
    const result = await appTester(
      App.creates.reschedule_appointment.operation.perform,
      bundleWith({ inputData: { appointment_id: samples.appointment.id, starts_at: '2026-09-30T11:00:00-04:00' } }),
    );
    expect(result.starts_at).toBe('2026-09-30T15:00:00Z');
    scope.done();
  });

  it('moves the appointment to another staff member when one is chosen', async () => {
    const scope = api()
      .post(`/appointments/${samples.appointment.id}/reschedule`, { starts_at: '2026-09-30T15:00:00.000Z', staff_id: samples.staff.id })
      .reply(200, { data: samples.appointment });
    await appTester(
      App.creates.reschedule_appointment.operation.perform,
      bundleWith({ inputData: { appointment_id: samples.appointment.id, starts_at: '2026-09-30T15:00:00Z', staff_id: samples.staff.id } }),
    );
    scope.done();
  });

  it('explains a slot that is taken', async () => {
    api().post(`/appointments/${samples.appointment.id}/reschedule`).reply(409, apiError('slot_unavailable', 'That time is not available.'));
    await expect(
      appTester(App.creates.reschedule_appointment.operation.perform, bundleWith({ inputData: { appointment_id: samples.appointment.id, starts_at: '2026-09-30T15:00:00Z' } })),
    ).rejects.toThrow(/no longer available/);
  });
});

describe('add_knowledge', () => {
  const operation = App.creates.add_knowledge.operation;

  it('adds an FAQ', async () => {
    let key;
    const scope = api()
      .post('/knowledge', { type: 'faq', question: 'Do you offer evening appointments?', answer: 'Yes, Thursdays until 8 PM.' })
      .reply(function reply() {
        key = this.req.headers['idempotency-key'];
        return [201, { data: samples.knowledgeEntry }];
      });
    const result = await appTester(operation.perform, bundleWith({ inputData: { type: 'faq', question: 'Do you offer evening appointments?', answer: 'Yes, Thursdays until 8 PM.' } }));
    expect(result).toEqual(samples.knowledgeEntry);
    expect(key).toMatch(IDEMPOTENCY);
    scope.done();
  });

  it('adds a text entry', async () => {
    const scope = api()
      .post('/knowledge', { type: 'text', title: 'Parking', content: 'Free parking behind the building.' })
      .reply(201, { data: { ...samples.knowledgeEntry, type: 'text', title: 'Parking', content: 'Free parking behind the building.' } });
    const result = await appTester(operation.perform, bundleWith({ inputData: { type: 'text', title: 'Parking', content: 'Free parking behind the building.' } }));
    expect(result.type).toBe('text');
    scope.done();
  });

  it('shows fields for the chosen entry type', async () => {
    const dynamic = operation.inputFields[1];
    expect(dynamic({}, { inputData: { type: 'text' } }).map((field) => field.key)).toEqual(['title', 'content']);
    expect(dynamic({}, { inputData: { type: 'faq' } }).map((field) => field.key)).toEqual(['question', 'answer']);
  });

  it('requires both parts of the entry', async () => {
    await expect(appTester(operation.perform, bundleWith({ inputData: { type: 'faq', question: 'Hours?' } }))).rejects.toThrow(/Fill in answer/);
  });
});
