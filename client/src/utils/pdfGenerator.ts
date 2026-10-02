import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Quotation, Invoice, DeliveryNote, Contract } from '../types';

/**
 * Wait until every <img> inside the element has finished loading (or failed).
 * Without this, html2canvas can capture before the company logo has loaded,
 * producing a shorter canvas than expected — which then breaks the per-page
 * slicing math and "swallows" the content that should have spilled to page 2.
 */
async function waitForImages(element: HTMLElement): Promise<void> {
  const imgs = Array.from(element.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) => {
      // `complete` is true for cached or already-decoded images.
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        // Resolve on error too — we don't want a 404 logo to block the PDF.
        img.addEventListener('error', done, { once: true });
      });
    })
  );
  // Wait one more animation frame so the browser has laid out the final size.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * Capture the given DOM element and save it as a multi-page A4 PDF.
 *
 * The previous version added the entire image to every page with a Y offset
 * and relied on the PDF viewer to clip the parts above the page. That works
 * in Acrobat but silently fails or shows nothing in some browsers/viewers and
 * also bloats the file. We now slice the captured canvas into one separate
 * per-page canvas and add each slice as its own image — no clipping needed,
 * works in every viewer.
 */
async function saveElementAsPdf(
  element: HTMLElement,
  filename: string
): Promise<void> {
  // Make sure every image (especially the company logo) is fully loaded
  // first — otherwise the captured height varies per company.
  await waitForImages(element);

  // capture scale — must match the value passed to html2canvas below so the
  // canvas-pixel maths line up.
  const CAPTURE_SCALE = 1.5;

  // Measure the *real* rendered box of the live element. We use this both for
  // the capture region and to force the clone to be the same size — html2canvas
  // doesn't honor the CSS `aspect-ratio` property used by the document layouts,
  // so without an explicit pixel height the cloned root collapses to its
  // natural content height and the captured canvas ends up with content in the
  // top portion and empty white below (which is what makes quotations look like
  // they aren't filling the A4 page).
  const rect = element.getBoundingClientRect();
  const captureWidth = Math.ceil(rect.width);
  // One A4 page worth of pixels at the current rendered width. Used as the
  // minimum capture height so short documents still fill a full A4 page.
  // Floor (not ceil) so the captured canvas, once scaled, matches the
  // per-page pixel count exactly — avoids a 1-pixel phantom second page.
  const singlePageHeightPx = Math.floor(captureWidth * 297 / 210);
  // For long documents the on-screen element is clipped (the doc root uses
  // `overflow-hidden` + `aspect-ratio`), so `rect.height` reports a single A4
  // page even when there are many items. `scrollHeight` is the natural content
  // height including the overflow — using the larger of the two ensures every
  // item is in the captured canvas and the multi-page slicer can split it into
  // multiple PDF pages.
  const captureHeight = Math.max(singlePageHeightPx, element.scrollHeight);

  // Page-break candidates are measured INSIDE html2canvas's cloned document
  // (in `onclone`), not on the live page: the clone is what actually gets
  // painted, and its layout can drift a few pixels per page from the live DOM
  // (different viewport, forced root size, font metrics). Measuring the live
  // DOM put "safe" breaks partway through a line of text on long contracts.
  let safeBreakYs: number[] = [];
  let keepRanges: Array<{ top: number; bottom: number }> = [];

  // Capture at 1.5x device pixels — that's ~160 DPI on A4 which is still well
  // above print clarity for text and keeps the JPEG inside the PDF small. The
  // old `scale: 2` produced ~217 DPI which is overkill and roughly quadruples
  // the raw pixel count vs the file size we actually need.
  const canvas = await html2canvas(element, {
    scale: CAPTURE_SCALE,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: captureWidth,
    height: captureHeight,
    // html2canvas otherwise inherits scroll position, which can shift the
    // captured viewport on long documents.
    scrollX: 0,
    scrollY: 0,
    windowWidth: captureWidth,
    windowHeight: captureHeight,
    // Pin the cloned root to exactly the same pixel size as the live element.
    // This is what makes flex-based templates (`flex-1` content + `mt-auto`
    // footer) actually fill the A4 page in the captured image, since the
    // browser inside html2canvas's iframe ignores `aspect-ratio`.
    onclone: (clonedDoc) => {
      const root = clonedDoc.querySelector<HTMLElement>(
        '.quotation-document, .invoice-document, .delivery-note-document, .contract-document'
      );
      if (!root) return;
      root.style.width = `${captureWidth}px`;
      root.style.height = `${captureHeight}px`;
      root.style.minHeight = `${captureHeight}px`;
      root.style.maxWidth = 'none';
      root.style.boxSizing = 'border-box';
      // The shadow/rounded corners are decorative — they don't belong in the
      // exported PDF and the rounding clips part of the document edge.
      root.style.boxShadow = 'none';
      root.style.borderRadius = '0';
      safeBreakYs = collectSafeBreakPoints(root, CAPTURE_SCALE);
      keepRanges = collectKeepRanges(root, CAPTURE_SCALE);
    },
  });

  // `compress: true` zlib-compresses the PDF streams (text, fonts, embedded
  // objects). Combined with JPEG-compressed images below, this brings a single
  // page from ~13 MB (uncompressed PNG) down to a few hundred KB.
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pageWidthMm = pdf.internal.pageSize.getWidth();   // 210mm
  const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297mm

  // JPEG quality for the captured image. 0.92 is visually indistinguishable
  // from lossless for documents like ours (text + flat color blocks) and is
  // around 8–10× smaller than the PNG equivalent.
  const JPEG_QUALITY = 0.92;

  // How many canvas pixels correspond to one mm in the output PDF.
  const pxPerMm = canvas.width / pageWidthMm;
  // The height of one A4 page, in canvas pixels.
  const pageHeightPx = Math.floor(pageHeightMm * pxPerMm);
  // A few-pixel forgiveness so subpixel rounding between html2canvas's scaled
  // capture and our per-page maths doesn't trip us into producing a near-empty
  // extra page at the end.
  const HEIGHT_TOLERANCE_PX = 8;

  // Single-page fast path: no slicing needed.
  if (canvas.height <= pageHeightPx + HEIGHT_TOLERANCE_PX) {
    const heightMm = canvas.height / pxPerMm;
    pdf.addImage(
      canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      'JPEG',
      0, 0,
      pageWidthMm, heightMm,
      undefined, // alias
      'FAST'     // jsPDF's own zlib compression on top of the JPEG stream
    );
    pdf.save(filename);
    return;
  }

  // Multi-page: each PDF page gets a white margin at the bottom (and at the top
  // of continuation pages — page 1 already has the document's own padding), so
  // text never runs to the paper edge. The content slice for a page is the page
  // height minus those margins, and its cut is snapped to the nearest safe break
  // point so a line of text / table row is never split between two pages.
  const MARGIN_PX = Math.round(12 * pxPerMm);
  let offsetPx = 0;
  let pageIndex = 0;
  while (canvas.height - offsetPx > HEIGHT_TOLERANCE_PX) {
    const topMargin = pageIndex === 0 ? 0 : MARGIN_PX;
    const usablePx = pageHeightPx - topMargin - MARGIN_PX;
    const remaining = canvas.height - offsetPx;
    let sliceEnd: number;

    if (remaining <= usablePx) {
      // Last page — take everything left, no snapping needed.
      sliceEnd = canvas.height;
    } else {
      // Snap to the largest safe break Y within (offsetPx, idealEnd]. The upper
      // bound is a HARD limit: a taller slice would overflow the page and its
      // bottom line would be clipped. If no break is found (e.g. a single row
      // taller than a page) fall back to the ideal end so we still progress.
      const idealEnd = offsetPx + usablePx;
      let bestBreak = -1;
      for (const by of safeBreakYs) {
        if (by > offsetPx + HEIGHT_TOLERANCE_PX && by <= idealEnd && by > bestBreak) {
          bestBreak = by;
        }
      }
      sliceEnd = bestBreak > 0 ? bestBreak : idealEnd;

      // Hard guarantee: never cut through a kept block. If the cut lands inside
      // one that starts below the current page top, move the cut up to the
      // block's top so the whole block moves to the next page. (If the block
      // starts at/above the page top it's taller than a page — allow the cut so
      // we keep making progress instead of looping forever.)
      for (const r of keepRanges) {
        if (r.top > offsetPx + HEIGHT_TOLERANCE_PX &&
            sliceEnd > r.top + HEIGHT_TOLERANCE_PX &&
            sliceEnd < r.bottom - HEIGHT_TOLERANCE_PX) {
          sliceEnd = Math.min(sliceEnd, r.top);
        }
      }
      // Safety: always advance at least a little so the loop terminates.
      if (sliceEnd <= offsetPx + HEIGHT_TOLERANCE_PX) sliceEnd = idealEnd;
    }

    const sliceHeightPx = sliceEnd - offsetPx;
    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = pageHeightPx;
    const ctx = page.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for page canvas');

    // Fill white so transparent regions / margins don't render as black, then
    // copy just this page's chunk of the source below the top margin.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(
      canvas,
      0, offsetPx, canvas.width, sliceHeightPx,
      0, topMargin, canvas.width, sliceHeightPx
    );

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(
      page.toDataURL('image/jpeg', JPEG_QUALITY),
      'JPEG',
      0, 0,
      pageWidthMm, pageHeightPx / pxPerMm,
      undefined,
      'FAST'
    );

    offsetPx = sliceEnd;
    pageIndex++;
  }

  pdf.save(filename);
}

/**
 * Find Y-coordinates (in canvas pixels, relative to `element`) where it's safe
 * to insert a page break — i.e. between table rows, after every visual line of
 * free text, after elements tagged `data-pdf-keep`, and before elements tagged
 * `data-pdf-break-before`. Must be called on the element that is actually
 * rendered (the html2canvas clone) so the positions match the canvas exactly.
 *
 * Returns a sorted ascending list.
 */
function collectSafeBreakPoints(element: HTMLElement, scale: number): number[] {
  const doc = element.ownerDocument;
  const elemTop = element.getBoundingClientRect().top;
  const ys = new Set<number>();
  const add = (rel: number) => {
    if (rel <= 0) return;
    ys.add(Math.floor(rel * scale));
  };

  // Table rows and explicitly-kept blocks are no-break units — it's safe to
  // break AFTER the whole element, never through it.
  element.querySelectorAll<HTMLElement>('tr, [data-pdf-keep]').forEach((node) => {
    add(node.getBoundingClientRect().bottom - elemTop);
  });

  // Free-text paragraphs / list items that are NOT inside a kept block: add a
  // break candidate after every VISUAL line (via the text node's line boxes),
  // so long paragraphs break BETWEEN lines and text is never sliced mid-line.
  // A candidate is only accepted if it doesn't fall inside another line box of
  // the same paragraph (guards against overlapping/odd rects).
  const range = doc.createRange();
  element.querySelectorAll<HTMLElement>('p, li').forEach((node) => {
    if (node.closest('[data-pdf-keep]')) return;
    const lines: Array<{ top: number; bottom: number }> = [];
    const walker = doc.createTreeWalker(node, 4 /* NodeFilter.SHOW_TEXT */);
    let t: Node | null;
    // eslint-disable-next-line no-cond-assign
    while ((t = walker.nextNode())) {
      range.selectNodeContents(t);
      const rects = range.getClientRects();
      for (let k = 0; k < rects.length; k++) {
        if (rects[k].height > 0) {
          lines.push({ top: rects[k].top - elemTop, bottom: rects[k].bottom - elemTop });
        }
      }
    }
    // A text range's rect ends right at the glyphs, but painted descenders
    // (g, p, y) spill a pixel or two below it — breaking exactly there shaves
    // them off. Break in the GAP below the line instead: a few px lower, but
    // never past the midpoint to the next line.
    lines.sort((a, b) => a.top - b.top);
    lines.forEach((l, idx) => {
      const insideAnother = lines.some((o) => l.bottom > o.top + 1 && l.bottom < o.bottom - 1);
      if (insideAnother) return;
      const next = lines.slice(idx + 1).find((o) => o.top >= l.bottom - 1);
      const gapMid = next ? (l.bottom + next.top) / 2 : Infinity;
      add(Math.min(l.bottom + 3, gapMid));
    });
    add(node.getBoundingClientRect().bottom - elemTop);
  });

  // "Break BEFORE" markers: a break may be placed at the TOP of these elements
  // (e.g. a clause heading), so a block that doesn't fit in the remaining space
  // is pushed WHOLE to the next page instead of being sliced through.
  element.querySelectorAll<HTMLElement>('[data-pdf-break-before]').forEach((node) => {
    add(node.getBoundingClientRect().top - elemTop);
  });

  return Array.from(ys).sort((a, b) => a - b);
}

/**
 * Canvas-pixel [top, bottom] spans of every `data-pdf-keep` block. The slicer
 * uses these to guarantee a page cut never lands *inside* one of them (e.g. the
 * signature block) — if a proposed cut falls within a block, it's moved up to
 * the block's top so the whole block is pushed to the next page.
 */
function collectKeepRanges(
  element: HTMLElement,
  scale: number
): Array<{ top: number; bottom: number }> {
  const elemTop = element.getBoundingClientRect().top;
  const ranges: Array<{ top: number; bottom: number }> = [];
  element.querySelectorAll<HTMLElement>('[data-pdf-keep]').forEach((node) => {
    const rect = node.getBoundingClientRect();
    const top = Math.floor((rect.top - elemTop) * scale);
    const bottom = Math.ceil((rect.bottom - elemTop) * scale);
    if (bottom > 0) ranges.push({ top: Math.max(0, top), bottom });
  });
  return ranges;
}

const safeFileSegment = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');

export const generatePDF = async (quotation: Quotation): Promise<void> => {
  try {
    const element = document.querySelector('.quotation-document') as HTMLElement | null;
    if (!element) throw new Error('Quotation document not found');
    const filename = `${quotation.quote_number}_${safeFileSegment(quotation.client_name)}.pdf`;
    await saveElementAsPdf(element, filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

export const generateQuotationHTML = (quotation: Quotation): string => {
  const primary = quotation.primary_color || '#000000';
  const secondary = quotation.secondary_color || '#ffffff';
  // Generate a light background based on the primary color
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };
  const rgb = hexToRgb(primary);
  const bg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
  const colors = { primary, secondary, bg };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return new Intl.NumberFormat('en-MW', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const getExpiryDate = () => {
    if (!quotation.date || !quotation.expiry_days) return 'N/A';
    const date = new Date(quotation.date);
    date.setDate(date.getDate() + quotation.expiry_days);
    return date.toLocaleDateString();
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Quotation ${quotation.quote_number}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background: white;
        }
        
        .quotation-document {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        
        .header {
          background: ${colors.bg};
          padding: 30px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        
        .logo-section {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .logo {
          width: 60px;
          height: 60px;
          background: ${colors.primary};
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
          font-weight: bold;
        }
        
        .company-info h1 {
          color: ${colors.primary};
          margin: 0 0 5px 0;
          font-size: 28px;
          font-weight: bold;
        }
        
        .company-info .address {
          color: #6b7280;
          font-size: 14px;
          margin: 0;
        }
        
        .quotation-title {
          text-align: right;
        }
        
        .quotation-title h2 {
          color: ${colors.primary};
          margin: 0 0 10px 0;
          font-size: 36px;
          font-weight: bold;
        }
        
        .quotation-title .number {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
          margin: 0;
        }
        
        .content {
          padding: 30px;
        }
        
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 30px;
        }
        
        .section-title {
          color: ${colors.primary};
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 15px;
        }
        
        .detail-item {
          margin-bottom: 8px;
          font-size: 14px;
          color: #4b5563;
        }
        
        .detail-item strong {
          color: #1f2937;
        }
        
        .dates-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 30px;
          font-size: 14px;
          color: #6b7280;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        
        .items-table thead tr {
          background: ${colors.primary};
          color: white;
        }
        
        .items-table th,
        .items-table td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .items-table th:nth-child(2),
        .items-table td:nth-child(2) {
          text-align: center;
        }
        
        .items-table th:nth-child(3),
        .items-table td:nth-child(3),
        .items-table th:nth-child(4),
        .items-table td:nth-child(4) {
          text-align: right;
        }
        
        .items-table td {
          font-size: 14px;
        }
        
        .total-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 30px;
        }
        
        .total-box {
          width: 300px;
          background: #f9fafb;
          padding: 20px;
          border-radius: 8px;
        }
        
        .total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .total-row.grand-total {
          border-top: 1px solid #d1d5db;
          padding-top: 8px;
          margin-top: 8px;
          font-size: 16px;
          font-weight: bold;
          color: ${colors.primary};
        }
        
        .notes-section {
          margin-bottom: 20px;
        }
        
        .notes-title {
          color: ${colors.primary};
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .notes-content {
          font-size: 14px;
          color: #6b7280;
          white-space: pre-wrap;
          line-height: 1.5;
        }
        
        .footer {
          text-align: center;
          padding-top: 20px;
          border-top: 2px solid ${colors.primary};
          margin-top: 30px;
          font-size: 14px;
          color: #9ca3af;
        }
        
        @media print {
          body { margin: 0; padding: 0; }
          .quotation-document { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="quotation-document">
        <div class="header">
          <div class="logo-section">
            ${quotation.company_logo ? 
              `<img src="http://localhost:5000${quotation.company_logo}" alt="Logo" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" />` :
              `<div class="logo">${quotation.company_name?.charAt(0) || 'C'}</div>`
            }
            <div class="company-info">
              <h1>${quotation.company_name}</h1>
              <p class="address">📍 ${quotation.company_address}</p>
            </div>
          </div>
          <div class="quotation-title">
            <h2>QUOTATION</h2>
            <p class="number">${quotation.quote_number}</p>
          </div>
        </div>
        
        <div class="content">
          <div class="details-grid">
            <div>
              <div class="section-title">Company Details</div>
              <div class="detail-item">🏢 TPIN: ${quotation.company_tpin}</div>
              <div class="detail-item">${quotation.company_bank_details}</div>
            </div>
            <div>
              <div class="section-title">Quote To</div>
              <div class="detail-item"><strong>${quotation.client_name}</strong></div>
              ${quotation.client_address ? `<div class="detail-item">📍 ${quotation.client_address}</div>` : ''}
              ${quotation.client_email ? `<div class="detail-item">📧 ${quotation.client_email}</div>` : ''}
              ${quotation.client_phone ? `<div class="detail-item">📞 ${quotation.client_phone}</div>` : ''}
            </div>
          </div>
          
          <div class="dates-grid">
            <div>📅 Quote Date: ${new Date(quotation.date).toLocaleDateString()}</div>
            <div>⏰ Valid Until: ${getExpiryDate()}</div>
          </div>
          
          <table class="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${quotation.items.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td>${formatNumber(item.quantity)}</td>
                  <td>${formatCurrency(item.unit_price)}</td>
                  <td><strong>${formatCurrency(item.total)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="total-section">
            <div class="total-box">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>${formatCurrency(quotation.subtotal)}</span>
              </div>
              <div class="total-row">
                <span>VAT:</span>
                <span>${formatCurrency(quotation.vat_amount)}</span>
              </div>
              <div class="total-row">
                <span>PPDA:</span>
                <span>${formatCurrency(quotation.ppda_amount)}</span>
              </div>
              <div class="total-row grand-total">
                <span>Grand Total:</span>
                <span>${formatCurrency(quotation.grand_total)}</span>
              </div>
            </div>
          </div>
          
          ${quotation.notes ? `
            <div class="notes-section">
              <div class="notes-title">Notes</div>
              <div class="notes-content">${quotation.notes}</div>
            </div>
          ` : ''}
          
          ${quotation.terms_conditions ? `
            <div class="notes-section">
              <div class="notes-title">Terms & Conditions</div>
              <div class="notes-content">${quotation.terms_conditions}</div>
            </div>
          ` : ''}
          
          <div class="footer">
            Thank you for your business!
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const generateContractPDF = async (contract: Contract): Promise<void> => {
  try {
    const element = document.querySelector('.contract-document') as HTMLElement | null;
    if (!element) throw new Error('Contract document not found');
    const filename = `${contract.contract_number}_${safeFileSegment(contract.client_name)}.pdf`;
    await saveElementAsPdf(element, filename);
  } catch (error) {
    console.error('Error generating contract PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

export const generateInvoicePDF = async (invoice: Invoice): Promise<void> => {
  try {
    const element = document.querySelector('.invoice-document') as HTMLElement | null;
    if (!element) throw new Error('Invoice document not found');
    const filename = `${invoice.invoice_number}_${safeFileSegment(invoice.client_name)}.pdf`;
    await saveElementAsPdf(element, filename);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

export const generateDeliveryNotePDF = async (deliveryNote: DeliveryNote): Promise<void> => {
  try {
    const element = document.querySelector('.delivery-note-document') as HTMLElement | null;
    if (!element) throw new Error('Delivery note document not found');
    const filename = `${deliveryNote.delivery_note_number}_${safeFileSegment(deliveryNote.client_name)}.pdf`;
    await saveElementAsPdf(element, filename);
  } catch (error) {
    console.error('Error generating delivery note PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

