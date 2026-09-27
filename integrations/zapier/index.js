'use strict';

const authentication = require('./authentication');
const middleware = require('./lib/middleware');
const triggers = require('./triggers');
const { createContact, updateContact } = require('./creates/contacts');
const { bookAppointment, cancelAppointment, rescheduleAppointment } = require('./creates/appointments');
const { addKnowledge } = require('./creates/knowledge');
const { findContact, findAppointment, checkAvailability } = require('./searches');

const byKey = (items) => Object.fromEntries(items.map((item) => [item.key, item]));

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  authentication,

  // Send input exactly as mapped; each step trims and converts what it needs.
  flags: { cleanInputData: false },

  beforeRequest: [...middleware.befores],
  afterResponse: [...middleware.afters],

  triggers: byKey(triggers),
  creates: byKey([createContact, updateContact, bookAppointment, cancelAppointment, rescheduleAppointment, addKnowledge]),
  searches: byKey([findContact, findAppointment, checkAvailability]),
  searchOrCreates: {
    find_contact: {
      key: 'find_contact',
      display: {
        label: 'Find or Create Contact',
        description: 'Finds a contact by phone number or email address, and creates one if none is found.',
      },
      search: 'find_contact',
      create: 'create_contact',
    },
  },
};
