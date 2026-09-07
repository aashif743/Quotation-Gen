import { Contract, ContractSection } from '../types';

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

type Input = Partial<Contract> & { company_name?: string };

// The default title new contracts start with.
export const DEFAULT_CONTRACT_TITLE = 'Billboard Advertising Contract';

// The built-in DEFAULT clauses (billboard advertising wording). These are kept
// GENERIC — they reference "the details/schedule above" rather than baking in a
// specific client, amount, or date — so the exact figures live in the details
// table while these clauses stay reusable as a saved per-user template. A new
// contract starts from the user's saved template if they have one, otherwise
// from this. Per-contract specifics (termination rules, comments) are separate
// fields rendered on the document, not part of these clauses.
export function buildDefaultSections(_i?: Input): ContractSection[] {
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
