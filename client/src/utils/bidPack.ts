import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildElementPdf } from './pdfGenerator';
import { BidDocument } from '../services/bidsApi';

/**
 * Build the complete bid pack as one PDF:
 *   1. every form (captured from the rendered pages, in order),
 *   2. for each attached document an "ANNEX n" divider page, then the
 *      document itself (PDF pages copied as they are; photos placed on A4).
 */

const A4: [number, number] = [595.28, 841.89];

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Could not fetch ${url}`);
  return res.arrayBuffer();
}

/** Any image the browser can show → JPEG bytes (pdf-lib embeds JPEG / PNG only). */
async function imageToJpeg(bytes: ArrayBuffer, type: string): Promise<Uint8Array> {
  if (type === 'image/jpeg') return new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    return new Uint8Array(await blob!.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addDivider(pack: PDFDocument, n: number, title: string, company: string) {
  const page = pack.addPage(A4);
  const bold = await pack.embedFont(StandardFonts.HelveticaBold);
  const regular = await pack.embedFont(StandardFonts.Helvetica);
  const [w, h] = A4;
  const center = (text: string, y: number, size: number, font = bold, color = rgb(0.07, 0.09, 0.15)) => {
    const tw = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: Math.max(40, (w - tw) / 2), y, size, font, color, maxWidth: w - 80 });
  };
  center(`ANNEX ${n}`, h / 2 + 40, 30);
  // Long titles wrap onto two lines.
  const words = title.toUpperCase().split(/\s+/);
  const linesOut: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (bold.widthOfTextAtSize(next, 16) > w - 120 && cur) { linesOut.push(cur); cur = word; } else cur = next;
  }
  if (cur) linesOut.push(cur);
  linesOut.slice(0, 3).forEach((l, i) => center(l, h / 2 - 5 - i * 22, 16));
  center(company, 60, 10, regular, rgb(0.42, 0.45, 0.5));
}

export async function buildBidPack(opts: {
  formElements: HTMLElement[];
  attachments: BidDocument[];
  companyName: string;
  onProgress?: (text: string) => void;
}): Promise<{ bytes: Uint8Array; problems: string[] }> {
  const pack = await PDFDocument.create();
  const problems: string[] = [];

  for (let i = 0; i < opts.formElements.length; i++) {
    opts.onProgress?.(`Preparing form ${i + 1} of ${opts.formElements.length}…`);
    const pdf = await buildElementPdf(opts.formElements[i]);
    const doc = await PDFDocument.load(pdf.output('arraybuffer'));
    const pages = await pack.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => pack.addPage(p));
  }

  for (let i = 0; i < opts.attachments.length; i++) {
    const a = opts.attachments[i];
    opts.onProgress?.(`Adding ${a.title}…`);
    await addDivider(pack, i + 1, a.title, opts.companyName);
    try {
      const bytes = await fetchBytes(a.file_url);
      const type = a.mime || (/\.pdf$/i.test(a.file_url) ? 'application/pdf' : 'image/jpeg');
      if (type === 'application/pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await pack.copyPages(src, src.getPageIndices());
        pages.forEach((p) => pack.addPage(p));
      } else {
        const jpg = await pack.embedJpg(await imageToJpeg(bytes, type));
        const page = pack.addPage(A4);
        const margin = 28;
        const scale = Math.min((A4[0] - margin * 2) / jpg.width, (A4[1] - margin * 2) / jpg.height);
        const iw = jpg.width * scale;
        const ih = jpg.height * scale;
        page.drawImage(jpg, { x: (A4[0] - iw) / 2, y: (A4[1] - ih) / 2, width: iw, height: ih });
      }
    } catch {
      problems.push(`${a.title} could not be added — attach it by hand.`);
    }
  }

  pack.setTitle('Bid documents');
  pack.setProducer('QuoteFlow');
  return { bytes: await pack.save(), problems };
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
