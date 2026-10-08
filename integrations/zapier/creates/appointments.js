'use strict';

const { apiUrl, compact, idempotencyKey, isoDate, normalizePhone, toBoolean } = require('../lib/client');
const { outputFields, samples, staffField } = require('../lib/resources');

const appointmentField = {
  key: 'appointment_id',
  label: 'Appointment',
  required: true,
  dynamic: 'appointment_list.id.label',
  search: 'find_appointment.id',
  helpText: 'Choose an upcoming appointment, or map the ID from a trigger or a Find Appointment step.',
};

const startsAtHelp =
  'Pick one of the open times from a Check Availability step. Times without a time zone use the time zone set for this Zap.';

const bookAppointment = {
  key: 'book_appointment',
  noun: 'Appointment',
  display: {
    label: 'Book Appointment',
    description: 'Books an appointment at an open time.',
  },
  operation: {
    inputFields: [
      {
        key: 'service_id',
        label: 'Service',
        required: true,
        dynamic: 'service_list.id.name',
        helpText: 'The service to book.',
      },
      {
        key: 'starts_at',
        label: 'Start time',
        type: 'datetime',
        required: true,
        helpText: startsAtHelp,
      },
      {
        key: 'contact_id',
        label: 'Contact',
        required: false,
        dynamic: 'contact_list.id.label',
        search: 'find_contact.id',
        helpText: 'An existing contact with a phone number. Provide a contact or a contact phone.',
      },
      {
        key: 'contact_phone',
        label: 'Contact phone',
        type: 'string',
        required: false,
        helpText: 'Used when no contact is chosen. Use international format, for example `+14165550134`.',
      },
      { key: 'contact_name', label: 'Contact name', type: 'string', required: false },
      { ...staffField, helpText: 'Book with this staff member. Leave blank to let LobbyStack pick someone free.' },
      {
        key: 'sms_consent',
        label: 'Customer agreed to texts',
        type: 'boolean',
        required: false,
        default: 'false',
        helpText: 'Set to true only if the customer agreed to receive confirmation and reminder text messages. Self-hosted LobbyStack only: on LobbyStack Cloud, only the receptionist collects text consent, on a call.',
      },
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      const body = compact({
        service_id: input.service_id,
        starts_at: isoDate(input.starts_at),
        contact_id: input.contact_id,
        contact_phone: normalizePhone(input.contact_phone),
        contact_name: input.contact_name,
        staff_id: input.staff_id,
        sms_consent: toBoolean(input.sms_consent),
      });
      if (!body.contact_id && !body.contact_phone) {
        throw new z.errors.Error('Choose a contact or enter a contact phone number.', 'invalid_input', 400);
      }
      const response = await z.request({
        url: apiUrl(bundle, '/appointments'),
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey(bundle, 'book_appointment', body) },
        body,
      });
      return response.data.data;
    },
    sample: samples.appointment,
    outputFields: outputFields.appointment,
  },
};

const cancelAppointment = {
  key: 'cancel_appointment',
  noun: 'Appointment',
  display: {
    label: 'Cancel Appointment',
    description: 'Cancels an appointment. Cancelling one that is already cancelled changes nothing.',
  },
  operation: {
    inputFields: [appointmentField],
    perform: async (z, bundle) => {
      const response = await z.request({
        url: apiUrl(bundle, `/appointments/${encodeURIComponent(bundle.inputData.appointment_id)}/cancel`),
        method: 'POST',
      });
      return response.data.data;
    },
    sample: { ...samples.appointment, status: 'cancelled' },
    outputFields: outputFields.appointment,
  },
};

const rescheduleAppointment = {
  key: 'reschedule_appointment',
  noun: 'Appointment',
  display: {
    label: 'Reschedule Appointment',
    description: 'Moves an appointment to a new open time.',
  },
  operation: {
    inputFields: [
      appointmentField,
      { key: 'starts_at', label: 'New start time', type: 'datetime', required: true, helpText: startsAtHelp },
      { ...staffField, helpText: 'Move the appointment to this staff member. Leave blank to keep the current one.' },
    ],
    perform: async (z, bundle) => {
      const response = await z.request({
        url: apiUrl(bundle, `/appointments/${encodeURIComponent(bundle.inputData.appointment_id)}/reschedule`),
        method: 'POST',
        body: compact({ starts_at: isoDate(bundle.inputData.starts_at), staff_id: bundle.inputData.staff_id }),
      });
      return response.data.data;
    },
    sample: samples.appointment,
    outputFields: outputFields.appointment,
  },
};

module.exports = { bookAppointment, cancelAppointment, rescheduleAppointment };
