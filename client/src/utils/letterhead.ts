// Letterhead details for the client-specific 'supreme' document design
// (Supreme Printers). Stored as JSON in companies.letterhead and edited in
// Settings → Company when that design is selected. Every field is optional;
// the documents simply leave out anything that is blank.

export interface Letterhead {
  /** Name printed under the logo, e.g. "Supreme Printers & Marketing Consultancy Ltd". Falls back to the company name. */
  display_name?: string;
  /** Short brand name used in "BUSINESS LINK PERSON (FOR …)". */
  short_name?: string;
  /** Street address lines (one per line). */
  address_lines?: string;
  /** Postal lines, e.g. "P.O. Box 2135\nLilongwe Malawi". */
  postal_lines?: string;
  /** Phone numbers (one per line). */
  phones?: string;
  email?: string;
  website?: string;
  /** Social handle, e.g. "@supreme printers". */
  social?: string;
  /** Services list printed in the footer (one per line). */
  services?: string;
  /** Footer slogan. */
  tagline?: string;
  /** Accent colour (green bars / table header). Falls back to the company secondary colour. */
  accent_color?: string;
}

export const LETTERHEAD_FIELDS: { key: keyof Letterhead; label: string; multiline?: boolean; placeholder?: string }[] = [
  { key: 'display_name', label: 'Name under the logo', placeholder: 'Supreme Printers & Marketing Consultancy Ltd' },
  { key: 'short_name', label: 'Short brand name', placeholder: 'Supreme' },
  { key: 'address_lines', label: 'Address lines', multiline: true, placeholder: 'Area 2\nOpp: Malawi Blood Transfusion Offices\nOff Mzimba Road, Lilongwe' },
  { key: 'postal_lines', label: 'Postal address (job cards)', multiline: true, placeholder: 'P.O. Box 2135\nLilongwe Malawi' },
  { key: 'phones', label: 'Phone numbers', multiline: true, placeholder: '+265 995 52 1526\n+265 881 33 8265' },
  { key: 'email', label: 'Email', placeholder: 'name@example.com' },
  { key: 'website', label: 'Website', placeholder: 'example.com' },
  { key: 'social', label: 'Social media handle', placeholder: '@supreme printers' },
  { key: 'services', label: 'Services (footer)', multiline: true, placeholder: 'Graphic Design, IEC Materials\nDigital Printing, Large Format Printing' },
  { key: 'tagline', label: 'Footer slogan', placeholder: 'Looking forward to doing Business with you.' },
  { key: 'accent_color', label: 'Accent colour (hex)', placeholder: '#4CB848' },
];

export const parseLetterhead = (raw?: string | null): Letterhead => {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Letterhead) : {};
  } catch {
    return {};
  }
};

/** Non-empty trimmed lines of a multi-line field. */
export const lines = (s?: string | null): string[] =>
  String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
