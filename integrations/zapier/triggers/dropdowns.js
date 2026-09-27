'use strict';

const { listPage } = require('../lib/client');
const { outputFields, samples } = require('../lib/resources');

const PAGE_SIZE = 100;

// Zapier asks for dropdown pages by number; the API pages by cursor. The
// cursor for the next page is kept with z.cursor between requests.
const cursorPage = async (z, bundle, path, params) => {
  const page = (bundle.meta && bundle.meta.page) || 0;
  const cursor = page > 0 ? await z.cursor.get() : undefined;
  if (page > 0 && !cursor) return [];
  const body = await listPage(z, bundle, path, { ...params, limit: PAGE_SIZE, cursor });
  if (body.has_more && body.next_cursor) await z.cursor.set(body.next_cursor);
  else if (page > 0) await z.cursor.set('');
  return Array.isArray(body.data) ? body.data : [];
};

const contactLabel = (contact) =>
  [contact.name, contact.phone, contact.email].filter(Boolean).join(' · ') || contact.id;

const formatTime = (iso, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch (error) {
    return iso;
  }
};

const appointmentLabel = (appointment) =>
  [
    formatTime(appointment.starts_at, appointment.timezone),
    appointment.service_name,
    appointment.contact_name || appointment.contact_phone,
  ]
    .filter(Boolean)
    .join(' · ');

const serviceList = {
  key: 'service_list',
  noun: 'Service',
  display: {
    label: 'List Services',
    description: 'Lists the services customers can book. Used for dropdowns.',
    hidden: true,
  },
  operation: {
    perform: async (z, bundle) => {
      const body = await listPage(z, bundle, '/services');
      return Array.isArray(body.data) ? body.data : [];
    },
    sample: samples.service,
    outputFields: [
      { key: 'id', label: 'Service ID', type: 'string' },
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
      { key: 'duration_minutes', label: 'Duration (Minutes)', type: 'integer' },
    ],
  },
};

const contactList = {
  key: 'contact_list',
  noun: 'Contact',
  display: {
    label: 'List Contacts',
    description: 'Lists contacts, newest first. Used for dropdowns.',
    hidden: true,
  },
  operation: {
    canPaginate: true,
    perform: async (z, bundle) => {
      const contacts = await cursorPage(z, bundle, '/contacts', {});
      return contacts.map((contact) => ({ ...contact, label: contactLabel(contact) }));
    },
    sample: { ...samples.contact, label: contactLabel(samples.contact) },
    outputFields: [...outputFields.contact, { key: 'label', label: 'Label', type: 'string' }],
  },
};

const appointmentList = {
  key: 'appointment_list',
  noun: 'Appointment',
  display: {
    label: 'List Upcoming Appointments',
    description: 'Lists confirmed appointments that have not started yet. Used for dropdowns.',
    hidden: true,
  },
  operation: {
    canPaginate: true,
    perform: async (z, bundle) => {
      const appointments = await cursorPage(z, bundle, '/appointments', {
        status: 'confirmed',
        starts_after: new Date().toISOString(),
      });
      return appointments.map((appointment) => ({ ...appointment, label: appointmentLabel(appointment) }));
    },
    sample: { ...samples.appointment, label: appointmentLabel(samples.appointment) },
    outputFields: [...outputFields.appointment, { key: 'label', label: 'Label', type: 'string' }],
  },
};

module.exports = { serviceList, contactList, appointmentList, cursorPage };
