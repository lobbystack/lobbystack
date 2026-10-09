'use strict';

const { compact, isoDate, listPage, normalizePhone } = require('../lib/client');
const { outputFields, samples, staffField } = require('../lib/resources');

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
      { key: 'email', label: 'Email', type: 'string', required: false, helpText: 'Used only when no phone is given.' },
    ],
    perform: async (z, bundle) => {
      const phone = normalizePhone(bundle.inputData.phone);
      const email = bundle.inputData.email ? String(bundle.inputData.email).trim() : undefined;
      if (!phone && !email) {
        throw new z.errors.Error('Enter a phone number or an email address to search for.', 'invalid_input', 400);
      }
      // Phone alone: contacts from calls and texts have no email, so phone AND email
      // would miss them and Find or Create would then hit the unique phone index.
      const body = await listPage(z, bundle, '/contacts', phone ? { phone, limit: 25 } : { email, limit: 25 });
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
        helpText: 'Only appointments for the contact with this phone number. Use international format, for example `+14165550134`. Ignored when a contact is chosen.',
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
      let contactId = input.contact_id ? String(input.contact_id).trim() : undefined;
      const phone = normalizePhone(input.contact_phone);
      if (!contactId && phone) {
        // Phone numbers are unique per business, so this is at most one contact.
        const contacts = await listPage(z, bundle, '/contacts', { phone, limit: 1 });
        const contact = Array.isArray(contacts.data) ? contacts.data[0] : undefined;
        if (!contact) return [];
        contactId = contact.id;
      }
      const body = await listPage(z, bundle, '/appointments', {
        contact_id: contactId,
        status: input.status,
        starts_after: input.starts_after ? isoDate(input.starts_after) : undefined,
        starts_before: input.starts_before ? isoDate(input.starts_before) : undefined,
        limit: 25,
      });
      return Array.isArray(body.data) ? body.data : [];
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
      { ...staffField, helpText: 'Only times this staff member is free. Leave blank for anyone who offers the service.' },
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      const startDate = dateOnly(input.start_date);
      const endDate = input.end_date ? dateOnly(input.end_date) : startDate;
      const body = await listPage(z, bundle, '/availability', {
        service_id: input.service_id,
        start_date: startDate,
        end_date: endDate,
        staff_id: input.staff_id,
      });
      const slots = Array.isArray(body.data) ? body.data : [];
      if (!slots.length) return [];
      // One result that holds every open time, so later steps can use the
      // first opening or loop over all of them.
      return [
        {
          id: [input.service_id, input.staff_id, startDate, endDate].filter(Boolean).join(':'),
          service_id: input.service_id,
          staff_id: input.staff_id || null,
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
      staff_id: null,
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
      { key: 'staff_id', label: 'Staff ID', type: 'string' },
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
