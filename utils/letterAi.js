// Drafting business letters with the shared AI service (utils/ai.js).
//
// Only what the user typed for this letter (context, recipient, tone) and the
// company's name / sender's name are sent — no other company data.

const { runAi, AiError } = require('./ai');

const TONES = {
  formal: 'formal and professional',
  friendly: 'warm and friendly but still professional',
  firm: 'firm, clear and polite (for example a final reminder)',
  apologetic: 'sincere and apologetic, taking responsibility',
};

// The model must answer by calling this tool, so the reply is always
// structured: subject, salutation, body and closing.
const LETTER_TOOL = {
  name: 'write_letter',
  description: 'Return the finished letter, split into its parts.',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Short subject line without "RE:" (e.g. "Confirmation of Order for 500 Branded T-Shirts").' },
      salutation: { type: 'string', description: 'e.g. "Dear Mr. Banda," or "Dear Sir/Madam,"' },
      body: {
        type: 'string',
        description: 'The letter body only: paragraphs separated by a blank line. Lists may use lines starting with "- ". No salutation, closing, signature, letterhead, date or addresses.',
      },
      closing: { type: 'string', description: 'e.g. "Yours faithfully," or "Yours sincerely,"' },
    },
    required: ['subject', 'salutation', 'body', 'closing'],
  },
};

const clip = (s, n) => String(s || '').trim().slice(0, n);

/**
 * Draft a letter. `input`: { context, tone, recipient_name, recipient_title,
 * recipient_company, company_name, sender_name, sender_title, current }
 * (`current` = the draft being improved, optional).
 */
async function draftLetter(req, input) {
  const context = clip(input.context, 4000);
  if (context.length < 5) throw new AiError('Describe what the letter is about first.', 400, 'bad_request');

  const tone = TONES[input.tone] || TONES.formal;
  const recipient = [input.recipient_name, input.recipient_title, input.recipient_company].map((x) => clip(x, 200)).filter(Boolean).join(', ');
  const sender = [input.sender_name, input.sender_title].map((x) => clip(x, 200)).filter(Boolean).join(', ');
  const current = input.current && (input.current.body || input.current.subject)
    ? `\n\nThe user's current draft (improve it according to the instructions; keep facts they wrote):\nSubject: ${clip(input.current.subject, 500)}\n${clip(input.current.body, 8000)}`
    : '';

  const system = [
    'You write business letters for companies in Malawi (southern Africa).',
    'Write clear, correct British English in a professional business style. Be concise: usually 2–5 short paragraphs.',
    'Use only the facts the user gives. Never invent amounts, dates, names, reference numbers, phone numbers or promises.',
    'Where an essential fact is missing, put a short placeholder in square brackets, e.g. [delivery date].',
    'Money is in Malawi Kwacha written like "MK 250,000.00" unless the user uses another currency.',
    'Do not include the letterhead, date, addresses or the signature block — only subject, salutation, body and closing.',
    'Use "Yours faithfully," when the salutation is "Dear Sir/Madam," and "Yours sincerely," when the person is named.',
  ].join(' ');

  const content = [
    `Company sending the letter: ${clip(input.company_name, 200) || 'our company'}.`,
    sender ? `Signed by: ${sender}.` : '',
    recipient ? `Recipient: ${recipient}.` : 'Recipient: not named.',
    `Tone: ${tone}.`,
    `What the letter must say:\n${context}`,
    current,
  ].filter(Boolean).join('\n');

  const { result: out } = await runAi({
    req, feature: input.current ? 'letter_improve' : 'letter_draft', tier: 'smart',
    system, content, tool: LETTER_TOOL, maxTokens: 2000, companyId: input.company_id || null,
  });
  if (!out || !out.body) throw new AiError('The AI returned an empty letter. Please try again.');
  return {
    subject: clip(out.subject, 500).replace(/^re:\s*/i, ''),
    salutation: clip(out.salutation, 255),
    body: String(out.body).trim(),
    closing: clip(out.closing, 255),
  };
}

module.exports = { draftLetter, TONES };
