const { runAi, AiError } = require('./ai');

// Reads a tender / RFQ document with AI and returns the facts a bid needs:
// who is buying, reference, deadline, validity, required documents, forms,
// items and the technical specifications to respond to.

const DOC_TYPES = [
  'tax_clearance', 'ppda_registration', 'business_registration', 'vat_registration', 'withholding_tax',
  'company_profile', 'power_of_attorney', 'audited_accounts', 'bank_letter', 'manufacturer_authorisation',
  'brochure', 'joint_venture_agreement', 'experience', 'other',
];
const FORMS = [
  'cover_letter', 'bid_submission_sheet', 'price_schedule', 'bid_securing_declaration', 'beneficial_ownership',
  'anti_corruption', 'eshs_declaration', 'eligible_countries', 'technical_compliance', 'quotation',
  'experience', 'bank_details',
];

const TENDER_TOOL = {
  name: 'record_tender',
  description: 'Record everything a bidder needs from this tender / RFQ. Use "" or [] when something is not in the document.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['tender', 'rfq'], description: 'tender = formal bidding document with forms; rfq = a short request for quotation.' },
      title: { type: 'string', description: 'Subject of the procurement, e.g. "Supply and Delivery of 23 Ambulances".' },
      procuring_entity: { type: 'string', description: 'Organisation buying, e.g. "Ministry of Health and Sanitation".' },
      addressee: { type: 'string', description: 'Who bids are addressed to, with full postal address, one item per line (e.g. "The Chairperson\\nInternal Procurement and Disposal Committee\\nMinistry of ...\\nP.O. Box ...\\nLilongwe").' },
      reference_number: { type: 'string', description: 'Procurement reference number exactly as written.' },
      procurement_method: { type: 'string', description: 'e.g. National Competitive Bidding, ICB, RFQ.' },
      lots: { type: 'array', items: { type: 'string' }, description: 'Lot names if the tender has lots.' },
      deadline: { type: 'string', description: 'Submission deadline as "YYYY-MM-DD HH:MM" (24h), or "YYYY-MM-DD", or "".' },
      submission_place: { type: 'string', description: 'Where/how to submit (address, box, email).' },
      opening: { type: 'string', description: 'Bid opening date, time and place, as written.' },
      validity_days: { type: 'integer', description: 'Required bid validity in days, 0 if not stated.' },
      currency: { type: 'string', description: 'Bid currency, e.g. Malawi Kwacha.' },
      copies_required: { type: 'string', description: 'e.g. "1 original + 3 copies".' },
      bid_security: { type: 'string', description: 'Bid security requirement: "Bid securing declaration", an amount, or "None".' },
      performance_security: { type: 'string', description: 'Performance security requirement as written (e.g. "5% of contract price").' },
      performance_security_percent: { type: 'number', description: 'Performance security as a percentage, 0 if not stated.' },
      delivery_period: { type: 'string', description: 'Required delivery / completion period.' },
      delivery_place: { type: 'string' },
      payment_terms: { type: 'string', description: 'Payment terms stated by the buyer.' },
      warranty_required: { type: 'string' },
      price_basis: { type: 'string', description: 'e.g. Incoterms/CIP, "inclusive of VAT and PPDA levy".' },
      clarification_contact: { type: 'string' },
      mandatory_documents: {
        type: 'array',
        description: 'Every document / condition the bidder must submit or meet (from the BDS, qualification criteria, checklists).',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short, as the tender states it.' },
            doc_type: { type: 'string', enum: [...DOC_TYPES, 'form', 'condition'], description: 'Matching vault document type, "form" if it is one of the bidding forms, "condition" if it is a rule (e.g. bid validity 120 days).' },
            mandatory: { type: 'boolean' },
          },
          required: ['label', 'doc_type', 'mandatory'],
        },
      },
      forms_required: { type: 'array', items: { type: 'string', enum: FORMS }, description: 'Which standard forms the bid must include.' },
      items: {
        type: 'array',
        description: 'Goods / services to price (statement of requirements / bill of quantities).',
        items: {
          type: 'object',
          properties: {
            item_no: { type: 'string' },
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit: { type: 'string' },
            lot: { type: 'string' },
          },
          required: ['item_no', 'description', 'quantity', 'unit', 'lot'],
        },
      },
      specs: {
        type: 'array',
        description: 'Technical specification rows the bidder must respond to, in order, with the full requirement text.',
        items: {
          type: 'object',
          properties: {
            item_no: { type: 'string' },
            section: { type: 'string', description: 'Heading such as ENGINE, BRAKES, or "".' },
            requirement: { type: 'string' },
            mandatory: { type: 'boolean' },
          },
          required: ['item_no', 'section', 'requirement', 'mandatory'],
        },
      },
      summary: { type: 'string', description: '2–4 sentences: what is being bought and anything unusual the bidder must not miss.' },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Easy-to-miss traps: disqualification rules, odd requirements, short deadlines.' },
    },
    required: ['kind', 'title', 'procuring_entity', 'addressee', 'reference_number', 'deadline', 'validity_days', 'mandatory_documents', 'forms_required', 'items', 'specs', 'summary', 'warnings'],
  },
};

/**
 * Drop chapters that are the same standard text in every Malawian bidding
 * document (Instructions to Bidders, General Conditions of Contract) — the
 * tender-specific facts are in the Bid Data Sheet, forms and requirements.
 * Keeps the text if the headings aren't found.
 */
function trimBoilerplate(text) {
  // The heading also appears in the table of contents, so take the start /
  // end pair with the most text between them (the real chapter).
  const cut = (t, startRe, endRe) => {
    const all = (re) => { const out = []; const g = new RegExp(re.source, 'gim'); let m; while ((m = g.exec(t))) out.push(m.index); return out; };
    const ends = all(endRe);
    let best = null;
    for (const s of all(startRe)) {
      const e = ends.find((x) => x > s);
      if (e != null && (!best || e - s > best[1] - best[0])) best = [s, e];
    }
    if (!best || best[1] - best[0] < 5000) return t;
    return `${t.slice(0, best[0])}[Standard section omitted]\n${t.slice(best[1])}`;
  };
  let t = text;
  t = cut(t, /^Section\s*1[.:]?\s*Instructions to Bidders/im, /^Section\s*2[.:]?\s/im);
  t = cut(t, /^Section\s*8[.:]?\s*General Conditions of Contract/im, /^Section\s*9[.:]?\s/im);
  return t;
}

/**
 * `doc`: { text } for Word/plain text, or { pdf: Buffer } for a PDF.
 */
async function readTender(req, doc, { companyId, companyName, today }) {
  let content;
  if (doc.pdf) {
    content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.pdf.toString('base64') } },
      { type: 'text', text: `Today is ${today}. Our company: ${companyName}. Read this tender / RFQ.` },
    ];
  } else {
    const text = trimBoilerplate(String(doc.text || '')).slice(0, 250_000);
    if (text.trim().length < 200) throw new AiError('The document has too little text to read. If it is a scan, upload it as a PDF.', 400, 'bad_request');
    content = `Today is ${today}. Our company: ${companyName}.\n\nTENDER DOCUMENT:\n<<<\n${text}\n>>>`;
  }
  const system = [
    'You help Malawian companies respond to tenders and requests for quotation (RFQs).',
    'Read the whole document and record the facts with the record_tender tool.',
    'Copy numbers, names, references and specification text exactly; never invent anything.',
    'Placeholders such as "[insert ...]" are blanks for the bidder, not facts.',
    'For specs, include every requirement row of the technical specifications in order, with the full text.',
  ].join(' ');
  const { result } = await runAi({
    req, feature: 'tender_read', tier: 'smart', system, content, tool: TENDER_TOOL,
    maxTokens: 16000, companyId, timeoutMs: 280_000,
  });
  return result;
}

module.exports = { readTender, trimBoilerplate, DOC_TYPES, FORMS };
