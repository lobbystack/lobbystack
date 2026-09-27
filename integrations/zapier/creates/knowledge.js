'use strict';

const { apiUrl, idempotencyKey } = require('../lib/client');
const { outputFields, samples } = require('../lib/resources');

const clean = (value) => (value === undefined || value === null ? '' : String(value).trim());

const addKnowledge = {
  key: 'add_knowledge',
  noun: 'Entry',
  display: {
    label: 'Add Knowledge',
    description: 'Adds a text entry or a question and answer that your receptionist can use to answer callers.',
  },
  operation: {
    inputFields: [
      {
        key: 'type',
        label: 'Entry type',
        required: true,
        choices: { faq: 'Question and answer', text: 'Text' },
        default: 'faq',
        altersDynamicFields: true,
      },
      (z, bundle) =>
        bundle.inputData.type === 'text'
          ? [
              { key: 'title', label: 'Title', type: 'string', required: true, helpText: 'A short name for this entry, up to 300 characters.' },
              { key: 'content', label: 'Content', type: 'text', required: true, helpText: 'What the receptionist should know, up to 20,000 characters.' },
            ]
          : [
              { key: 'question', label: 'Question', type: 'string', required: true, helpText: 'Up to 300 characters.' },
              { key: 'answer', label: 'Answer', type: 'text', required: true, helpText: 'Up to 20,000 characters.' },
            ],
    ],
    perform: async (z, bundle) => {
      const input = bundle.inputData;
      const body =
        input.type === 'text'
          ? { type: 'text', title: clean(input.title), content: clean(input.content) }
          : { type: 'faq', question: clean(input.question), answer: clean(input.answer) };
      const missing = Object.entries(body).filter(([, value]) => !value).map(([key]) => key);
      if (missing.length) {
        throw new z.errors.Error(`Fill in ${missing.join(' and ')}.`, 'invalid_input', 400);
      }
      const response = await z.request({
        url: apiUrl(bundle, '/knowledge'),
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey(bundle, 'add_knowledge', body) },
        body,
      });
      return response.data.data;
    },
    sample: samples.knowledgeEntry,
    outputFields: outputFields.knowledgeEntry,
  },
};

module.exports = { addKnowledge };
