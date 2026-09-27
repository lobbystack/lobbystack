'use strict';

const { compact, isoDate, listPage, normalizePhone } = require('../lib/client');
const { outputFields, samples } = require('../lib/resources');

const MAX_APPOINTMENT_PAGES = 5;

const findContact = {
  key: 'find_contact',
  noun: 'Contact',
  display: {
    label: 'Find Contact',
    description: 'Finds a contact by phone number or email address.',
  },
  operation: {
    inputFields: [
      {
        key: 'phone',
        label: 'Phone',
        type: 'string',
        required: false,
        helpText: 'Use international format, for example `+14165550134`. Ten-digit numbers without a country code are treated as North American.',
      },
      { key: 'email', label: 'Email', type: 'string', required: false, helpText: 'Used when no phone is given, or together with the phone to narrow the match.' },
    ],
    perform: async (z, bundle) => {
      const phone = normalizePhone(bundle.inputData.phone);
      const email = bundle.inputData.email ? String(bundle.inputData.email).trim() : undefined;
      if (!phone && !email) {
        throw new z.errors.Error('Enter a phone number or an email address to search for.', 'invalid_input', 400);
      }
      const body = await listPage(z, bundle, '/contacts', { phone, email, limit: 25 });
      return Array.isArray(body.data) ? body.data : [];
    },
    sample: samples.contact,
    outputFields: outputFields.contact,
  },
};

const findAppointment = {
  key: 'find_appointment',
  noun: 'Appointment',
  display: {
    label: 'Find Appointment',
    description: 'Finds an appointment by contact, status or start time. Returns the most recently booked match.',
  },
  operation: {
    inputFields: [
      {
        key: 'contact_phone',
        label: 'Contact phone',
        type: 'string',
        required: false,
        helpText: 'Only appointments for this phone number. Use international format, for example `+14165550134`.',
      },
      {
        key: 'contact_id',
        label: 'Contact',
        required: false,
        dynamic: 'contact_list.id.label',
        search: 'find_contact.id',
        helpText: 'Only appointments for this contact.',
      },
      {
        key: 'status',
        label: 'Status',
        required: false,
        choices: { confirmed: 'Confirmed', cancelled: 'Cancelled' },
      },
      { key: 'starts_after', label: 'Starts at or after', type: 'datetime', required: false },
      { key: 'starts_before', label: 'Starts before', type: 'datetime', required: false },
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      const phone = normalizePhone(input.contact_phone);
      const params = compact({
        status: input.status,
        starts_after: input.starts_after ? isoDate(input.starts_after) : undefined,
        starts_before: input.starts_before ? isoDate(input.starts_before) : undefined,
        limit: 100,
      });
      const matches = (appointment) =>
        (!phone || appointment.contact_phone === phone) && (!input.contact_id || appointment.contact_id === input.contact_id);
      // The API filters by status and time; contact filters apply here, over
      // the most recent pages.
      const found = [];
      let cursor;
      for (let page = 0; page < MAX_APPOINTMENT_PAGES; page += 1) {
        const body = await listPage(z, bundle, '/appointments', { ...params, cursor });
        const items = Array.isArray(body.data) ? body.data : [];
        found.push(...items.filter(matches));
        if (found.length || !body.has_more || !body.next_cursor || (!phone && !input.contact_id)) break;
        cursor = body.next_cursor;
      }
      return found;
    },
    sample: samples.appointment,
    outputFields: outputFields.appointment,
  },
};

// Accepts a date or a date-time and returns the YYYY-MM-DD it starts with.
// Zapier sends date-time fields in the Zap's time zone, so the calendar day
// is the one the user picked.
const dateOnly = (value) => {
  const text = String(value || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : text;
};

const checkAvailability = {
  key: 'check_availability',
  noun: 'Availability',
  display: {
    label: 'Check Availability',
    description: 'Finds open appointment times for a service.',
  },
  operation: {
    inputFields: [
      { key: 'service_id', label: 'Service', required: true, dynamic: 'service_list.id.name' },
      {
        key: 'start_date',
        label: 'First day',
        type: 'datetime',
        required: true,
        helpText: 'The first day to check, in the business time zone. Only the date part is used.',
      },
      {
        key: 'end_date',
        label: 'Last day',
        type: 'datetime',
        required: false,
        helpText: 'The last day to check. Defaults to the first day. The range can span up to 7 days.',
      },
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      const startDate = dateOnly(input.start_date);
      const endDate = input.end_date ? dateOnly(input.end_date) : startDate;
      const body = await listPage(z, bundle, '/availability', {
        service_id: input.service_id,
        start_date: startDate,
        end_date: endDate,
      });
      const slots = Array.isArray(body.data) ? body.data : [];
      if (!slots.length) return [];
      // One result that holds every open time, so later steps can use the
      // first opening or loop over all of them.
      return [
        {
          id: `${input.service_id}:${startDate}:${endDate}`,
          service_id: input.service_id,
          start_date: startDate,
          end_date: endDate,
          slot_count: slots.length,
          first_starts_at: slots[0].starts_at,
          first_ends_at: slots[0].ends_at,
          slots,
        },
      ];
    },
    sample: {
      id: '0d6c1f4e-8a3b-4b7e-9c2d-5e6f7a8b9c01:2026-09-29:2026-09-29',
      service_id: '0d6c1f4e-8a3b-4b7e-9c2d-5e6f7a8b9c01',
      start_date: '2026-09-29',
      end_date: '2026-09-29',
      slot_count: 2,
      first_starts_at: '2026-09-29T13:00:00Z',
      first_ends_at: '2026-09-29T14:00:00Z',
      slots: [
        { starts_at: '2026-09-29T13:00:00Z', ends_at: '2026-09-29T14:00:00Z' },
        { starts_at: '2026-09-29T13:30:00Z', ends_at: '2026-09-29T14:30:00Z' },
      ],
    },
    outputFields: [
      { key: 'id', label: 'Result ID', type: 'string' },
      { key: 'service_id', label: 'Service ID', type: 'string' },
      { key: 'start_date', label: 'First Day', type: 'string' },
      { key: 'end_date', label: 'Last Day', type: 'string' },
      { key: 'slot_count', label: 'Open Times', type: 'integer' },
      { key: 'first_starts_at', label: 'First Open Start Time', type: 'datetime' },
      { key: 'first_ends_at', label: 'First Open End Time', type: 'datetime' },
      { key: 'slots[]starts_at', label: 'Open Start Times', type: 'datetime' },
      { key: 'slots[]ends_at', label: 'Open End Times', type: 'datetime' },
    ],
  },
};

module.exports = { findContact, findAppointment, checkAvailability, dateOnly };
