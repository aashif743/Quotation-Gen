import { ContractSection, ContractStyle } from '../types';

// Format a currency amount using the contract/company currency. Falls back to a
// plain number if the code is unknown.
export const formatContractMoney = (amount?: number | null, currency?: string | null): string => {
  const value = Number(amount || 0);
  const code = (currency || 'MWK').toUpperCase();
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

// Human-friendly long date, e.g. "September 3, 2026". Accepts YYYY-MM-DD.
export const formatLongDate = (s?: string | null): string => {
  if (!s) return '';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Every organization has a contract "style" that decides the BUILT-IN wording
// a new contract starts from when the user has no saved default:
//  - 'billboard': billboard advertising wording (the two original
//    organizations — kept exactly as it always was);
//  - 'general':   neutral wording for any kind of business (the default for
//    new organizations — no mention of billboards, advertising or printing).
// Once a user saves or creates a contract, their own clauses become their
// default and these built-ins are only used for "Reset".

export const resolveContractStyle = (style?: string | null): ContractStyle =>
  style === 'billboard' ? 'billboard' : 'general';

/** The title a new contract starts with. */
export const defaultContractTitle = (style?: string | null): string =>
  resolveContractStyle(style) === 'billboard' ? 'Billboard Advertising Contract' : 'Service Agreement';

/** Suggestions offered in the title field. */
export const contractTitleSuggestions = (style?: string | null): string[] =>
  resolveContractStyle(style) === 'billboard'
    ? ['Advertising Contract', 'Billboard Advertising Contract', 'Service Contract',
       'Rental Agreement', 'Maintenance Contract', 'Supply Agreement']
    : ['Service Agreement', 'Service Contract', 'Supply Agreement', 'Maintenance Contract',
       'Consultancy Agreement', 'Rental Agreement', 'Lease Agreement', 'Works Contract'];

/** Heading used on the document for the per-contract termination rules. */
export const terminationHeading = (style?: string | null): string =>
  resolveContractStyle(style) === 'billboard' ? 'Early Termination & Removal Fees' : 'Early Termination';

/** Built-in default clauses for the organization's style. */
export function buildDefaultSections(style?: string | null): ContractSection[] {
  return resolveContractStyle(style) === 'billboard' ? buildBillboardSections() : buildGeneralSections();
}

// Neutral, reusable clauses for any business. Like the billboard wording they
// refer to "the details above" rather than baking in a client, amount or date,
// so the exact figures live in the details table.
function buildGeneralSections(): ContractSection[] {
  return [
    {
      heading: 'Scope of Services',
      body:
        `The Company agrees to provide the goods and/or services described in this Agreement and in the details ` +
        `above (the "Services") to the Client. The Services shall be performed with due care and skill and in ` +
        `accordance with generally accepted industry standards. Any change to the scope of the Services shall be ` +
        `agreed in writing by both parties.`,
    },
    {
      heading: 'Term',
      body:
        `This Agreement commences on the start date and runs for the term set out in the details above, unless ` +
        `terminated earlier in accordance with this Agreement. The term may be extended or renewed by written ` +
        `agreement of both parties.`,
    },
    {
      heading: 'Fees & Payment Terms',
      body:
        `The Client agrees to pay the fees shown in the details above on the stated payment frequency. Unless ` +
        `otherwise agreed in writing, invoices are payable within the period stated on each invoice. Amounts not ` +
        `paid when due may result in suspension of the Services until payment is received.`,
    },
    {
      heading: 'Obligations of the Parties',
      body:
        `The Company shall deliver the Services in a timely and professional manner and keep the Client informed of ` +
        `progress. The Client shall provide the information, access and cooperation reasonably required for the ` +
        `Company to perform the Services, and shall make payments when due.`,
    },
    {
      heading: 'Confidentiality',
      body:
        `Each party shall keep confidential any non-public information received from the other party in connection ` +
        `with this Agreement and shall not disclose it to any third party without prior written consent, except ` +
        `where required by law.`,
    },
    {
      heading: 'Liability',
      body:
        `Neither party shall be liable for any indirect or consequential loss arising out of this Agreement. The ` +
        `Company's total liability under this Agreement shall not exceed the total fees paid by the Client under ` +
        `this Agreement.`,
    },
    {
      heading: 'Termination',
      body:
        `Either party may terminate this Agreement by giving written notice if the other party commits a material ` +
        `breach and fails to remedy it within thirty (30) days of receiving notice. On termination, the Client shall ` +
        `pay for all Services provided up to the date of termination.`,
    },
    {
      heading: 'Force Majeure',
      body:
        `Neither party shall be liable for any delay or failure to perform caused by events beyond its reasonable ` +
        `control, including natural disasters, severe weather, government action, or civil unrest. The affected ` +
        `party shall notify the other party promptly and make reasonable efforts to resume performance.`,
    },
    {
      heading: 'Governing Law & General',
      body:
        `This Agreement is governed by the laws of the country in which the Company is registered. Any dispute shall ` +
        `first be resolved through good-faith negotiation between the parties. This Agreement is the entire ` +
        `agreement between the parties on its subject and may only be amended in writing signed by both parties.`,
    },
  ];
}

function buildBillboardSections(): ContractSection[] {
  return [
    {
      heading: 'Advertising Services & Location',
      body:
        `The Company agrees to provide billboard advertising services to the Advertiser at the location(s) set out ` +
        `in the schedule of details above. The Advertiser shall supply high-resolution artwork conforming to the ` +
        `Company's specifications. Any additions or changes to the locations or scope shall be agreed in writing by ` +
        `both parties.`,
    },
    {
      heading: 'Term & Payment Terms',
      body:
        `Contract Term: This Agreement runs for the term set out in the details above, unless terminated earlier in ` +
        `accordance with this Agreement.\n\n` +
        `Invoicing: The Advertiser agrees to pay the fee shown above on the stated billing cycle. Payments are due in ` +
        `advance at the start of each billing period, unless otherwise agreed in writing.`,
    },
    {
      heading: 'Insurance',
      body:
        `Where an insurance amount is shown in the details above, it covers the advertising installation for the ` +
        `contract term. The Company shall maintain reasonable insurance on its structures; the Advertiser is ` +
        `responsible for insuring its own artwork and materials unless otherwise agreed in writing.`,
    },
    {
      heading: 'Printing & Production Charges',
      body:
        `Any printing and production charges shown in the details above cover the production of the advertising ` +
        `material. Unless stated otherwise, printing and production charges are payable in advance and are ` +
        `non-refundable once production has commenced.`,
    },
    {
      heading: 'Maintenance and Production',
      body:
        `The Company shall ensure the billboard structure is maintained in good condition. The Advertiser is ` +
        `responsible for providing high-resolution artwork conforming to the Company's specifications. The Company is ` +
        `not liable for structural damage caused by severe weather or vandalism but will make reasonable efforts to ` +
        `repair displays promptly.`,
    },
  ];
}
