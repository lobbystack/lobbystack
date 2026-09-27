'use strict';

const { createHookTrigger } = require('./hooks');
const dropdowns = require('./dropdowns');

const newCall = createHookTrigger({
  key: 'new_call',
  noun: 'Call',
  label: 'New Call',
  description: 'Triggers when a call with your receptionist ends.',
  event: 'call.completed',
  resource: 'call',
  listPath: '/calls',
  filter: (call) => call.status === 'completed',
});

const newAppointment = createHookTrigger({
  key: 'new_appointment',
  noun: 'Appointment',
  label: 'New Appointment',
  description: 'Triggers when an appointment is booked.',
  event: 'appointment.booked',
  resource: 'appointment',
  listPath: '/appointments',
  listParams: { status: 'confirmed' },
});

const appointmentRescheduled = createHookTrigger({
  key: 'appointment_rescheduled',
  noun: 'Appointment',
  label: 'Appointment Rescheduled',
  description: 'Triggers when an appointment moves to a new time.',
  event: 'appointment.rescheduled',
  resource: 'appointment',
  listPath: '/appointments',
  listParams: { status: 'confirmed' },
});

const appointmentCancelled = createHookTrigger({
  key: 'appointment_cancelled',
  noun: 'Appointment',
  label: 'Appointment Cancelled',
  description: 'Triggers when an appointment is cancelled.',
  event: 'appointment.cancelled',
  resource: 'appointment',
  listPath: '/appointments',
  listParams: { status: 'cancelled' },
});

const newMessage = createHookTrigger({
  key: 'new_message',
  noun: 'Message',
  label: 'New Message',
  description: 'Triggers when your receptionist takes a message for the team.',
  event: 'message.taken',
  resource: 'message',
  listPath: '/messages',
});

const newContact = createHookTrigger({
  key: 'new_contact',
  noun: 'Contact',
  label: 'New Contact',
  description: 'Triggers when a new contact is added.',
  event: 'contact.created',
  resource: 'contact',
  listPath: '/contacts',
});

module.exports = [
  newCall,
  newAppointment,
  appointmentRescheduled,
  appointmentCancelled,
  newMessage,
  newContact,
  dropdowns.serviceList,
  dropdowns.contactList,
  dropdowns.appointmentList,
];
