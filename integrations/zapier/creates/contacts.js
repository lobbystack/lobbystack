'use strict';

const { apiUrl, compact, idempotencyKey, normalizePhone } = require('../lib/client');
const { outputFields, samples } = require('../lib/resources');

const languageField = {
  key: 'locale',
  label: 'Language',
  choices: { en: 'English', fr: 'French' },
  required: false,
  helpText: 'The language your receptionist uses with this contact.',
};

const timezoneField = {
  key: 'timezone',
  label: 'Time zone',
  type: 'string',
  required: false,
  helpText: 'An IANA time zone, for example `America/Toronto`.',
};

const phoneHelp =
  'Use international format, for example `+14165550134`. Ten-digit numbers without a country code are treated as North American.';

const createContact = {
  key: 'create_contact',
  noun: 'Contact',
  display: {
    label: 'Create Contact',
    description: 'Creates a new contact.',
  },
  operation: {
    inputFields: [
      { key: 'phone', label: 'Phone', type: 'string', required: false, helpText: `${phoneHelp} Provide a phone, an email, or both.` },
      { key: 'email', label: 'Email', type: 'string', required: false, helpText: 'Provide a phone, an email, or both.' },
      { key: 'name', label: 'Name', type: 'string', required: false },
      languageField,
      timezoneField,
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      const body = compact({
        name: input.name,
        phone: normalizePhone(input.phone),
        email: input.email ? String(input.email).trim() : undefined,
        locale: input.locale,
        timezone: input.timezone,
      });
      if (!body.phone && !body.email) {
        throw new z.errors.Error('Enter a phone number or an email address for the contact.', 'invalid_input', 400);
      }
      const response = await z.request({
        url: apiUrl(bundle, '/contacts'),
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey(bundle, 'create_contact', body) },
        body,
      });
      return response.data.data;
    },
    sample: samples.contact,
    outputFields: outputFields.contact,
  },
};

const updateContact = {
  key: 'update_contact',
  noun: 'Contact',
  display: {
    label: 'Update Contact',
    description: 'Updates an existing contact.',
  },
  operation: {
    inputFields: [
      {
        key: 'contact_id',
        label: 'Contact',
        required: true,
        dynamic: 'contact_list.id.label',
        search: 'find_contact.id',
        helpText: 'The contact to update. Choose one, or map the ID from a Find Contact step.',
      },
      { key: 'name', label: 'Name', type: 'string', required: false },
      { key: 'phone', label: 'Phone', type: 'string', required: false, helpText: phoneHelp },
      { key: 'email', label: 'Email', type: 'string', required: false },
      languageField,
      timezoneField,
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      // Blank fields are left unchanged; the API only updates fields it receives.
      const body = compact({
        name: input.name,
        phone: normalizePhone(input.phone),
        email: input.email ? String(input.email).trim() : undefined,
        locale: input.locale,
        timezone: input.timezone,
      });
      if (Object.keys(body).length === 0) {
        throw new z.errors.Error('Fill in at least one field to update.', 'invalid_input', 400);
      }
      const response = await z.request({
        url: apiUrl(bundle, `/contacts/${encodeURIComponent(input.contact_id)}`),
        method: 'PATCH',
        body,
      });
      return response.data.data;
    },
    sample: samples.contact,
    outputFields: outputFields.contact,
  },
};

module.exports = { createContact, updateContact };
