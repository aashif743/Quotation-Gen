// Fills a tender's ORIGINAL Word (.docx) bidding forms in place.
//
// The document keeps its own layout, styles, headers and logos; only blanks
// are filled:
//   1. known tables: commissions, directors, beneficial owners, price
//      schedule, technical compliance;
//   2. "Label: ______" blanks (Name, Position, Date, Company, Registered
//      Address…) in paragraphs and in signature tables;
//   3. "[insert …]" placeholders — by fixed rules for the common ones, the
//      rest by a resolver callback (AI) that sees each blank's sentence;
//   4. the signatory's signature image where the form says "Signature".
// Sections that are not the bidder's to fill (conditions of contract,
// contract / bank / guarantee forms) are left alone.
//
// Everything works on the WordprocessingML text with a nesting-aware scanner
// (no XML library); each step rebuilds whole paragraphs / tables so edits
// never overlap.

const { readZip, writeZip } = require('./zip');

/* ------------------------------- XML helpers ------------------------------ */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

/**
 * Ranges of <w:TAG> elements, nesting-aware. With `innermost`, only elements
 * that contain no element of the same tag (e.g. paragraphs outside text boxes).
 */
function elements(xml, tag, { innermost = false } = {}) {
  const re = new RegExp(`<w:${tag}(?=[\\s>/])[^>]*?(/?)>|</w:${tag}>`, 'g');
  const stack = [];
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('</')) {
      const open = stack.pop();
      if (!open) continue;
      if (!innermost || !open.hasChild) out.push({ start: open.start, end: m.index + m[0].length });
      if (stack.length) stack[stack.length - 1].hasChild = true;
    } else if (m[1] === '/') {
      // self-closing <w:p/>: an empty paragraph
      if (!innermost || true) out.push({ start: m.index, end: m.index + m[0].length, empty: true });
      if (stack.length) stack[stack.length - 1].hasChild = true;
    } else {
      stack.push({ start: m.index, hasChild: false });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Apply [{start, end, text}] replacements (non-overlapping) to a string. */
function applyEdits(s, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = s;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Text segments of a paragraph: each <w:t> with its position. */
function segments(pXml) {
  const segs = [];
  const re = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  let pos = 0;
  while ((m = re.exec(pXml))) {
    const text = decode(m[2]);
    segs.push({ start: m.index, end: m.index + m[0].length, text, from: pos, to: pos + text.length });
    pos += text.length;
  }
  return segs;
}
const paraText = (pXml) => segments(pXml).map((s) => s.text).join('');
const tNode = (text) => {
  const parts = String(text).split('\n');
  return parts.map((p, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(p)}</w:t>`).join('');
};

// Element order inside <w:rPr> matters to Word: highlight goes before these.
const AFTER_HIGHLIGHT = ['w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath'];
function addHighlight(runXml) {
  if (/<w:highlight\b/.test(runXml)) return runXml;
  const rpr = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  if (!rpr) return runXml.replace(/^(<w:r(?:\s[^>]*)?>)/, '$1<w:rPr><w:highlight w:val="yellow"/></w:rPr>');
  const inner = rpr[1];
  let idx = inner.length;
  for (const tag of AFTER_HIGHLIGHT) {
    const i = inner.search(new RegExp(`<${tag}[\\s>/]`));
    if (i >= 0 && i < idx) idx = i;
  }
  const next = `${inner.slice(0, idx)}<w:highlight w:val="yellow"/>${inner.slice(idx)}`;
  return runXml.replace(rpr[0], `<w:rPr>${next}</w:rPr>`);
}

/** The <w:r> run around position `pos` in a paragraph. */
function runAround(pXml, pos) {
  const before = pXml.lastIndexOf('<w:r>', pos);
  const before2 = pXml.lastIndexOf('<w:r ', pos);
  const start = Math.max(before, before2);
  const end = pXml.indexOf('</w:r>', pos);
  if (start < 0 || end < 0) return null;
  return { start, end: end + 6 };
}

/**
 * Replace character ranges of a paragraph's text: [{from, to, value}]
 * (offsets in paraText). The value goes into the run where the range starts.
 */
function replaceInParagraph(pXml, reps, { highlight = false } = {}) {
  if (!reps.length) return pXml;
  const segs = segments(pXml);
  const newText = segs.map((s) => s.text);
  const touched = new Set();
  for (const r of [...reps].sort((a, b) => b.from - a.from)) {
    let first = true;
    segs.forEach((s, i) => {
      if (s.to <= r.from || s.from >= r.to) return;
      const a = Math.max(r.from, s.from) - s.from;
      const b = Math.min(r.to, s.to) - s.from;
      const cur = newText[i];
      // Offsets inside newText[i] are still valid: replacements are applied right-to-left.
      if (first && r.from >= s.from) {
        newText[i] = cur.slice(0, a) + r.value + cur.slice(b);
        touched.add(i);
        first = false;
      } else {
        newText[i] = cur.slice(0, a) + cur.slice(b);
      }
    });
  }
  // Rebuild the paragraph with new <w:t> contents.
  const edits = segs.map((s, i) => ({ start: s.start, end: s.end, text: tNode(newText[i]) }));
  let out = applyEdits(pXml, edits);
  if (highlight && touched.size) {
    // Highlight the runs that received values.
    const segs2 = segments(out);
    const runEdits = [];
    const seen = new Set();
    for (const i of touched) {
      const s = segs2[i];
      if (!s) continue;
      const run = runAround(out, s.start);
      if (!run || seen.has(run.start)) continue;
      seen.add(run.start);
      runEdits.push({ start: run.start, end: run.end, text: addHighlight(out.slice(run.start, run.end)) });
    }
    out = applyEdits(out, runEdits);
  }
  return out;
}

/** Set the whole text of a paragraph (adds a run when it has none). */
function setParagraphText(pXml, value, opts = {}) {
  const segs = segments(pXml);
  if (segs.length) return replaceInParagraph(pXml, [{ from: 0, to: segs[segs.length - 1].to, value }], opts);
  // Copy the paragraph mark formatting (if any) to the new run.
  const markRpr = (pXml.match(/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/) || [])[1] || '';
  let run = `<w:r>${markRpr}${tNode(value)}</w:r>`;
  if (opts.highlight) run = addHighlight(run);
  if (/<w:p(\s[^>]*)?\/>$/.test(pXml)) return pXml.replace(/\/>$/, `>${run}</w:p>`);
  return pXml.replace(/<\/w:p>$/, `${run}</w:p>`);
}

/** Set a table cell's text (first paragraph gets the value, others are emptied). */
function setCellText(tcXml, value, opts = {}) {
  const paras = elements(tcXml, 'p', { innermost: true });
  if (!paras.length) return tcXml;
  const edits = paras.map((p, i) => {
    const x = tcXml.slice(p.start, p.end);
    return { start: p.start, end: p.end, text: i === 0 ? setParagraphText(x, value, opts) : (segments(x).length ? replaceInParagraph(x, [{ from: 0, to: paraText(x).length, value: '' }]) : x) };
  });
  return applyEdits(tcXml, edits);
}

const cellsOf = (trXml) => elements(trXml, 'tc').filter((c, i, all) => !all.some((o) => o !== c && o.start < c.start && o.end > c.end));
const rowsOf = (tblXml) => elements(tblXml, 'tr').filter((r, i, all) => !all.some((o) => o !== r && o.start < r.start && o.end > r.end));
const cellText = (xml) => elements(xml, 'p', { innermost: true }).map((p) => paraText(xml.slice(p.start, p.end))).join(' ').replace(/\s+/g, ' ').trim();
const isBlankText = (t) => !t || /^[\s_.…\-–:]*$/.test(t);

/* --------------------------------- tables -------------------------------- */

/** Fill a table's rows from `values` (array of arrays), reusing blank rows and copying the last one when more are needed. */
function fillRows(tblXml, firstDataRow, values, opts) {
  const rows = rowsOf(tblXml);
  const data = rows.slice(firstDataRow);
  if (!data.length || !values.length) return tblXml;
  const templateRow = tblXml.slice(data[data.length - 1].start, data[data.length - 1].end);
  const fillRow = (rowXml, vals) => {
    const cells = cellsOf(rowXml);
    const edits = cells.map((c, i) => (vals[i] === undefined || vals[i] === null ? null : { start: c.start, end: c.end, text: setCellText(rowXml.slice(c.start, c.end), String(vals[i]), opts) })).filter(Boolean);
    return applyEdits(rowXml, edits);
  };
  const edits = [];
  values.forEach((vals, i) => {
    if (i < data.length) edits.push({ start: data[i].start, end: data[i].end, text: fillRow(tblXml.slice(data[i].start, data[i].end), vals) });
  });
  if (values.length > data.length) {
    const extra = values.slice(data.length).map((v) => fillRow(templateRow, v)).join('');
    const last = data[data.length - 1];
    const lastEdit = edits.find((e) => e.start === last.start);
    if (lastEdit) lastEdit.text += extra; else edits.push({ start: last.end, end: last.end, text: extra });
  }
  return applyEdits(tblXml, edits);
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function fillTables(xml, f, report, opts) {
  const tables = elements(xml, 'tbl', { innermost: true });
  const edits = [];
  for (const t of tables) {
    if (f.skipAt(t.start)) continue;
    const tbl = xml.slice(t.start, t.end);
    const rows = rowsOf(tbl);
    if (!rows.length) continue;
    const texts = rows.map((r) => cellsOf(tbl.slice(r.start, r.end)).map((c) => cellText(tbl.slice(r.start, r.end).slice(c.start, c.end))));
    const headerIdx = texts.findIndex((cells) => cells.some((c) => c));
    const head = (texts[headerIdx] || []).map(norm);
    const blankAfter = (i) => texts.slice(i + 1).every((cells) => cells.every(isBlankText));
    let out = null;
    let what = '';

    if (head.join('|').includes('name of recipient') && head.some((h) => h.includes('amount')) && blankAfter(headerIdx)) {
      const list = (f.commissions.length ? f.commissions : [{ name: 'None', address: 'None', reason: 'None', amount: 'None' }]).map((c) => [c.name, c.address, c.reason, c.amount]);
      out = fillRows(tbl, headerIdx + 1, list, opts);
      what = 'Commissions table';
    } else if (head.length === 2 && head[0] === 'name' && head[1].startsWith('address') && blankAfter(headerIdx) && f.directors.length) {
      out = fillRows(tbl, headerIdx + 1, f.directors.map((d) => [d.name, d.address]), opts);
      what = 'Directors table';
    } else if (head[0] && head[0].startsWith('identity of beneficial owner') && f.owners.length) {
      const yn = (v) => (v ? 'Yes' : 'No');
      out = fillRows(tbl, headerIdx + 1, f.owners.map((o) => [
        [o.name, o.nationality, o.residence ? `resident in ${o.residence}` : '', o.address].filter(Boolean).join(', '), yn(o.shares), yn(o.votes), yn(o.board),
      ]), opts);
      what = 'Beneficial ownership table';
    } else {
      // Price schedule: a header row naming unit price + total.
      const pIdx = texts.findIndex((cells) => {
        const n = cells.map(norm).join('|');
        return /unit price|unit cost|rate/.test(n) && /total/.test(n) && /(description|item|goods|service)/.test(n);
      });
      if (pIdx >= 0 && f.items.length) {
        const h = texts[pIdx].map(norm);
        const col = (re) => h.findIndex((x) => re.test(x));
        const c = {
          no: col(/^(item|s ?no|no|#)\b|item no/), desc: col(/description|goods|service|item name/), origin: col(/origin/),
          qty: col(/quantit|qty/), unit: col(/^unit$|unit of measure|uom/), price: col(/unit (price|cost)|rate/), duty: col(/duties|duty/), total: col(/total/),
        };
        // Skip a numbering row ("1 | 2 | 3 …") right under the header.
        let first = pIdx + 1;
        if (texts[first] && texts[first].every((x) => /^\d*$/.test(x.trim()))) first += 1;
        const dataRows = texts.slice(first);
        const isTotalRow = (cells) => cells.some((x) => /total/i.test(x));
        const nItemRows = dataRows.findIndex(isTotalRow);
        const usable = nItemRows < 0 ? dataRows.length : nItemRows;
        if (usable > 0 && dataRows.slice(0, usable).every((cells) => cells.slice(1).every(isBlankText) || cells.every(isBlankText))) {
          const width = h.length;
          const vals = f.items.map((it, i) => {
            const r = new Array(width).fill(undefined);
            if (c.no >= 0) r[c.no] = it.item_no || String(i + 1);
            if (c.desc >= 0) r[c.desc] = it.description;
            if (c.origin >= 0) r[c.origin] = it.origin || '';
            if (c.qty >= 0) r[c.qty] = c.unit >= 0 ? f.num(it.quantity, 0) : `${f.num(it.quantity, 0)} ${it.unit && it.unit !== 'Each' ? it.unit : ''}`.trim();
            if (c.unit >= 0) r[c.unit] = it.unit || '';
            if (c.price >= 0) r[c.price] = f.num(it.unit_price);
            if (c.duty >= 0) r[c.duty] = f.dutyText;
            if (c.total >= 0) r[c.total] = f.num(f.lineTotal(it));
            return r;
          });
          let t2 = fillRows(tbl, first, vals.slice(0, Math.max(vals.length, 0)), opts);
          // Totals rows: put the total in their last cell.
          const rows2 = rowsOf(t2);
          const tEdits = [];
          rows2.forEach((r) => {
            const rx = t2.slice(r.start, r.end);
            const cells = cellsOf(rx);
            const txt = cells.map((cc) => cellText(rx.slice(cc.start, cc.end)));
            if (!txt.some((x) => /total/i.test(x))) return;
            const lastC = cells[cells.length - 1];
            if (!isBlankText(txt[txt.length - 1])) return;
            const label = txt.join(' ').toLowerCase();
            const v = /sub.?total/.test(label) && f.totals.separate ? f.totals.subtotal : /vat/.test(label) ? f.totals.vat : /levy|ppda/.test(label) ? f.totals.levy : f.totals.grand;
            tEdits.push({ start: r.start, end: r.end, text: applyEdits(rx, [{ start: lastC.start, end: lastC.end, text: setCellText(rx.slice(lastC.start, lastC.end), f.num(v), opts) }]) });
          });
          out = applyEdits(t2, tEdits);
          what = 'Price schedule';
        }
      }
      // Technical specifications: fill the compliance / offered columns.
      if (!out && f.specs.length) {
        const sIdx = texts.findIndex((cells) => {
          const n = cells.map(norm).join('|');
          return /specification/.test(n) && /(complian|offered)/.test(n);
        });
        if (sIdx >= 0) {
          const h = texts[sIdx].map(norm);
          const offeredCol = h.findIndex((x) => /offered/.test(x) && !/complian/.test(x));
          const compCol = h.findIndex((x) => /complian/.test(x));
          const reqCol = h.findIndex((x) => /required|technical specification/.test(x) && !/offered/.test(x));
          const rows2 = rowsOf(tbl);
          const tEdits = [];
          let filled = 0;
          const used = new Set();
          rows2.forEach((r, ri) => {
            if (ri <= sIdx) return;
            const rx = tbl.slice(r.start, r.end);
            const cells = cellsOf(rx);
            const txt = cells.map((cc) => cellText(rx.slice(cc.start, cc.end)));
            const req = norm(reqCol >= 0 ? txt[reqCol] : txt.slice(1).join(' '));
            if (!req || req.length < 4) return;
            // Match a spec by requirement text (start of it), else by item number.
            let si = f.specs.findIndex((s, k) => !used.has(k) && norm(s.requirement).slice(0, 40) && req.startsWith(norm(s.requirement).slice(0, 40)));
            if (si < 0) si = f.specs.findIndex((s, k) => !used.has(k) && norm(s.requirement).slice(0, 25) === req.slice(0, 25));
            if (si < 0) si = f.specs.findIndex((s, k) => !used.has(k) && s.item_no && norm(s.item_no) === norm(txt[0]));
            if (si < 0) return;
            used.add(si);
            const s = f.specs[si];
            const cEdits = [];
            const sameAsRequired = norm(s.offered) === norm(s.requirement);
            if (offeredCol >= 0 && cells[offeredCol] && isBlankText(txt[offeredCol])) {
              cEdits.push({ start: cells[offeredCol].start, end: cells[offeredCol].end, text: setCellText(rx.slice(cells[offeredCol].start, cells[offeredCol].end), s.offered, opts) });
            }
            if (compCol >= 0 && cells[compCol] && isBlankText(txt[compCol])) {
              const v = offeredCol < 0 && !sameAsRequired && s.offered ? `${String(s.compliance).toUpperCase()}: ${s.offered}` : String(s.compliance).toUpperCase();
              cEdits.push({ start: cells[compCol].start, end: cells[compCol].end, text: setCellText(rx.slice(cells[compCol].start, cells[compCol].end), v, opts) });
            }
            if (cEdits.length) { filled += 1; tEdits.push({ start: r.start, end: r.end, text: applyEdits(rx, cEdits) }); }
          });
          if (tEdits.length) { out = applyEdits(tbl, tEdits); what = `Technical compliance (${filled} rows)`; }
        }
      }
    }
    if (out && out !== tbl) {
      edits.push({ start: t.start, end: t.end, text: out });
      report.tables.push(what);
    }
  }
  return applyEdits(xml, edits);
}

/** A bordered Word table for the price schedule (when the form has none). */
function priceTableXml(f) {
  const W = [700, 3700, 1300, 900, 1500, 1700];
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('') + '</w:tblBorders>';
  const cell = (text, w, { bold = false, right = false, span = 1, shade = false } = {}) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/>${right ? '<w:jc w:val="right"/>' : ''}</w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="19"/></w:rPr>${tNode(text)}</w:r></w:p></w:tc>`;
  const head = ['Item No.', 'Description of goods / related services', 'Country of origin', 'Quantity', `Unit price (${f.currency})`, `Total price (${f.currency})`];
  const rows = [`<w:tr>${head.map((h, i) => cell(h, W[i], { bold: true, shade: true, right: i >= 3 })).join('')}</w:tr>`];
  f.items.forEach((it, i) => {
    rows.push(`<w:tr>${[it.item_no || String(i + 1), it.description || '', it.origin || '', `${f.num(it.quantity, 0)}${it.unit && it.unit !== 'Each' ? ` ${it.unit}` : ''}`, f.num(it.unit_price), f.num(f.lineTotal(it))]
      .map((v, k) => cell(v, W[k], { right: k >= 3 })).join('')}</w:tr>`);
  });
  const total = (label, v, bold = false) => `<w:tr>${cell(label, W.slice(0, 5).reduce((a, b) => a + b, 0), { bold, right: true, span: 5 })}${cell(f.num(v), W[5], { bold, right: true })}</w:tr>`;
  if (f.totals.separate) {
    rows.push(total('Sub-total', f.totals.subtotal), total('VAT', f.totals.vat), total('PPDA levy', f.totals.levy), total('GRAND TOTAL', f.totals.grand, true));
  } else {
    rows.push(total('TOTAL (all taxes and levies included)', f.totals.grand, true));
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="${W.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${W.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

/* ---------------------------- labels & blanks ---------------------------- */

const SIGNATURE_TOKEN = '⁣SIG⁣';

/** Value for a "Label:" before a blank (signature tables, "Name: ____" lines). */
function labelValue(label, f) {
  const l = label.toLowerCase().replace(/[:\s]+$/, '').trim();
  if (/^signature|^signed/.test(l)) return SIGNATURE_TOKEN;
  if (/^(name|full name|name of (the )?(person|signatory|authori[sz]ed))/.test(l)) return f.signatoryName;
  if (/^(position|title|designation|capacity|in the capacity of)/.test(l)) return f.signatoryTitle;
  if (/^date/.test(l)) return f.dateText;
  if (/^(company|bidder|name of (the )?(bidder|company|firm)|for and on behalf of|authori[sz]ed for and on behalf of|duly authori[sz]ed to sign .* on behalf of)/.test(l)) return f.bidderName;
  if (/registered address|^address|physical address/.test(l)) return f.address;
  if (/^(tel|phone|telephone)/.test(l)) return f.phone;
  if (/^e-?mail/.test(l)) return f.email;
  if (/tpin/.test(l)) return f.tpin;
  return null;
}

/** A blank described by a label (bracketed after it, or before it without a colon). */
function blankLabelValue(label, f) {
  const l = String(label).toLowerCase().trim();
  if (/registration (number|no)/.test(l)) return f.registrationNo || null;
  if (/tpin|tax ?payer identification/.test(l)) return f.tpin || null;
  if (/name of (the )?(bidder|company|firm)|bidder'?s? name|company name/.test(l)) return f.bidderName;
  const v = labelValue(l, f);
  return v === SIGNATURE_TOKEN ? null : v;
}

/** "[insert …]" placeholder → value by fixed rules (null = ask the resolver / leave). */
function ruleValue(ph, f) {
  const p = ph.toLowerCase();
  if (/guarantor|issuing institution|bank'?s? |name of bank|manufacturer|letter of acceptance|\bcontractor|supplier'?s? name and address|page number|total number of pages/.test(p)) return null;
  if (/input of information|to be completed by|delete th|the bidder (shall|is to|must) (fill|complete)|fill in this form|in accordance with the instructions/.test(p)) return '';
  if (/day in numbers/.test(p)) return String(f.day);
  if (/ordinal number/.test(p)) return f.dayOrdinal;
  if (/^\[insert month\]$|insert month/.test(p)) return f.monthName;
  if (/^\[insert year\]$/.test(p)) return String(f.year);
  if (/date/.test(p) && /(submission|signing|bid|day, month and year|insert date)/.test(p)) return f.dateText;
  if (/procurement reference|reference number|reference no|number of bidding process|rfb no|ifb no/.test(p)) return f.reference;
  if (/identification no.*alternative|alternative no/.test(p)) return f.alternativeNo;
  if (/addend/.test(p)) return f.addenda;
  if (/complete name of procuring|name of (the )?procuring|procuring and disposing entity/.test(p)) return f.entity;
  if (/(complete|full) name of (the )?bidder|name of (the )?bidder|insert name of firm|name of (the )?company/.test(p)) return f.bidderName;
  if (/brief description of the|description of the (goods|plant|works|services)/.test(p)) return f.title;
  if (/total bid price/.test(p)) return f.totalWithWords;
  if (/number of calendar days|validity/.test(p)) return String(f.validityDays);
  if (/performance security/.test(p) && /amount/.test(p)) return f.performanceText;
  if (/nationality/.test(p)) return f.nationality;
  if (/warranty/.test(p)) return f.warranty;
  if (/legal capacity|title of (the )?person|capacity of person/.test(p)) return f.signatoryTitle;
  if (/name of (the )?person|full name of (the )?(authori|signatory)|name of signatory/.test(p)) return f.signatoryName;
  if (/signature/.test(p)) return SIGNATURE_TOKEN;
  if (/commission|gratuit/.test(p)) return f.commissions.length ? f.commissions.map((c) => `${c.name}, ${c.address}, ${c.reason}, ${c.amount}`).join('; ') : 'None';
  if (/(specify|detail).*(discount|method.*discount)|discount/.test(p)) return f.discounts || 'N/A';
  if (/registration number/.test(p)) return f.registrationNo;
  if (/address of (the )?bidder|bidder'?s? address|registered address/.test(p)) return f.address;
  return null;
}

// Headings of forms the bidder does not fill / fills.
const OTHERS_FORM = /^(bid security|bid guarantee|bank guarantee|performance security|performance guarantee|advance payment (security|guarantee)|manufacturer.?s? authori[sz]ation|retention money)\b(?! declaration)/i;
const BIDDER_FORM = /^(bid submission (sheet|form)|form of bid|letter of bid|beneficial ownership|price schedule|bill of quantities|bid securing declaration|environmental, social|anti.?corruption|eligible countries|technical specifications?|statement of requirements|qualification (information|form)|bidder information|declaration)/i;

/* --------------------------------- main ---------------------------------- */

/**
 * Fill the Word document.
 *   buf       original .docx
 *   f         facts (see buildFacts in routes/bids.js)
 *   opts      { highlight, signature: { data: Buffer, ext: 'png'|'jpeg' } | null,
 *               resolve: async (blanks) => Map(id → value) }   // AI, optional
 * Returns { buffer, report }.
 */
async function fillDocx(buf, f, opts = {}) {
  const entries = readZip(buf);
  const docEntry = entries.find((e) => e.name === 'word/document.xml');
  if (!docEntry) throw new Error('This Word file has no main document');
  let xml = docEntry.data.toString('utf8');
  const report = { tables: [], filled: [], left: [], signatures: 0 };
  const o = { highlight: !!opts.highlight };

  // Sections the bidder must not fill: from a heading like "Section 8 General
  // Conditions of Contract", "Contract Forms", "Bank Guarantee" onwards (until
  // another bidder section starts).
  const othersSeen = new Set();
  const sectionMarks = () => {
    const marks = [];
    let inContractPart = false;
    for (const p of elements(xml, 'p', { innermost: true })) {
      const t = paraText(xml.slice(p.start, p.end)).trim();
      if (t.length > 160 || !t) continue;
      if (/^section\s*\d+[.:]?\s/i.test(t) || /^part\s*\d+/i.test(t)) {
        const skip = /conditions of contract|contract forms|contract agreement|form of contract|general conditions|special conditions|schedule of payment/i.test(t);
        marks.push({ at: p.start, skip });
        inContractPart = skip;
      }
      // Forms that belong to someone else (bank, insurer, manufacturer): skip them
      // until the next bidder form starts.
      else if (OTHERS_FORM.test(t) || /should be on the letterhead of the (issuing )?(bank|manufacturer|insurer|guarantor)/i.test(t)) {
        marks.push({ at: p.start, skip: true });
        const name = (t.match(OTHERS_FORM) || [])[0];
        if (name && !inContractPart) othersSeen.add(name.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()));
      } else if (BIDDER_FORM.test(t)) {
        marks.push({ at: p.start, skip: false });
      }
    }
    return marks;
  };
  let marks = sectionMarks();
  f.skipAt = (pos) => {
    let skip = false;
    for (const m of marks) { if (m.at <= pos) skip = m.skip; else break; }
    return skip;
  };

  // 1. Tables.
  xml = fillTables(xml, f, report, o);
  marks = sectionMarks();

  // 1b. A price schedule form without an item table gets one.
  if (f.items.length && !report.tables.some((t) => /price schedule/i.test(t))) {
    const ps = elements(xml, 'p', { innermost: true }).filter((p) => !p.empty);
    for (let i = 0; i < ps.length; i++) {
      const t = paraText(xml.slice(ps[i].start, ps[i].end)).trim();
      if (!/^price schedule/i.test(t) || t.length > 120 || f.skipAt(ps[i].start)) continue;
      const anchor = ps.slice(i + 1, i + 25).find((p) => /^(notes?\s*:|authori[sz]ed by|signature of bidder)/i.test(paraText(xml.slice(p.start, p.end)).trim()));
      if (!anchor) continue;
      const blank = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
      xml = xml.slice(0, anchor.start) + priceTableXml(f) + blank + xml.slice(anchor.start);
      report.tables.push('Price schedule (table added)');
      break;
    }
    marks = sectionMarks();
  }

  // 1c. Remove "INSTRUCTIONS TO BIDDERS: DELETE THIS BOX …" notes.
  if (opts.removeInstructions !== false) {
    const edits = [];
    const tbls = elements(xml, 'tbl', { innermost: true });
    for (const t of tbls) {
      if (f.skipAt(t.start)) continue;
      if (/^\s*instructions to bidders\s*:?\s*delete this box/i.test(cellText(xml.slice(t.start, t.end)))) edits.push({ start: t.start, end: t.end, text: '<w:p/>' });
    }
    for (const p of elements(xml, 'p', { innermost: true })) {
      if (p.empty || f.skipAt(p.start) || edits.some((e) => p.start >= e.start && p.end <= e.end)) continue;
      if (/^\s*instructions to bidders\s*:?\s*delete this box/i.test(paraText(xml.slice(p.start, p.end)))) edits.push({ start: p.start, end: p.end, text: '' });
    }
    if (edits.length) { xml = applyEdits(xml, edits); report.removed = edits.length; marks = sectionMarks(); }
  }

  // 2. "Label | ____" cells in tables (signature boxes).
  {
    const edits = [];
    for (const t of elements(xml, 'tbl', { innermost: true })) {
      if (f.skipAt(t.start)) continue;
      const tbl = xml.slice(t.start, t.end);
      const rEdits = [];
      for (const r of rowsOf(tbl)) {
        const rx = tbl.slice(r.start, r.end);
        const cells = cellsOf(rx);
        const txt = cells.map((c) => cellText(rx.slice(c.start, c.end)));
        const cEdits = [];
        txt.forEach((label, i) => {
          if (!label || isBlankText(label) || label.length > 70 || i + 1 >= cells.length) return;
          if (!isBlankText(txt[i + 1]) || /^\(?dd\/mm/i.test(txt[i + 1])) return;
          const v = labelValue(label.replace(/\(.*?\)/g, ''), f);
          if (v == null || v === '') return;
          if (v === SIGNATURE_TOKEN && !opts.signature) return;
          cEdits.push({ start: cells[i + 1].start, end: cells[i + 1].end, text: setCellText(rx.slice(cells[i + 1].start, cells[i + 1].end), v, o) });
          if (v !== SIGNATURE_TOKEN) report.filled.push({ where: 'Signature box', blank: label, value: v, by: 'profile' });
        });
        if (cEdits.length) rEdits.push({ start: r.start, end: r.end, text: applyEdits(rx, cEdits) });
      }
      if (rEdits.length) edits.push({ start: t.start, end: t.end, text: applyEdits(tbl, rEdits) });
    }
    xml = applyEdits(xml, edits);
    marks = sectionMarks();
  }

  // 3. Paragraph blanks: placeholders and "Label: ____".
  const paras = elements(xml, 'p', { innermost: true }).filter((p) => !p.empty);
  const plan = []; // { pi, from, to, value?, ph, context, id }
  let lastHeading = '';
  paras.forEach((p, pi) => {
    const px = xml.slice(p.start, p.end);
    const text = paraText(px);
    const trimmed = text.trim();
    if (trimmed && trimmed.length < 90 && !/[[\]_]/.test(trimmed) && /^[A-Z0-9 ,.&'’()/:-]+$/.test(trimmed)) lastHeading = trimmed;
    else if (/^section\s*\d/i.test(trimmed)) lastHeading = trimmed;
    if (f.skipAt(p.start) || !text) return;
    // [placeholders]
    const re = /\[[^\]\n]{2,300}\]/g;
    let m;
    while ((m = re.exec(text))) {
      plan.push({ pi, from: m.index, to: m.index + m[0].length, ph: m[0], context: text.slice(0, 600), section: lastHeading, id: plan.length });
    }
    // Label: ____ (underscores / dots)
    const lre = /([A-Za-z][A-Za-z /()'’-]{1,60}?)\s*:\s*(_{3,}|\.{5,}|…{2,})/g;
    while ((m = lre.exec(text))) {
      const label = m[1].trim();
      // "The discounts offered … are: …………" → the discount (or N/A).
      const v = labelValue(label, f) ?? (/discount/i.test(text.slice(0, m.index + m[0].length)) ? (f.discounts || 'N/A') : null);
      if (v == null || v === '' || (v === SIGNATURE_TOKEN && !opts.signature)) continue;
      const from = m.index + m[0].length - m[2].length;
      if (plan.some((x) => x.pi === pi && x.from < from + m[2].length && x.to > from)) continue;
      plan.push({ pi, from, to: from + m[2].length, value: v, ph: `${label}: ___`, context: '', section: lastHeading, id: plan.length, by: 'profile' });
    }
    // "______ (Name of Bidder)" — the label in brackets after the blank.
    const bre = /(_{3,}|\.{5,}|…{2,})\s*\(([^)]{2,60})\)/g;
    while ((m = bre.exec(text))) {
      const v = blankLabelValue(m[2], f);
      if (v == null || v === '') continue;
      const from = m.index;
      const to = from + m[1].length;
      if (plan.some((x) => x.pi === pi && x.from < to && x.to > from)) continue;
      plan.push({ pi, from, to, value: v, ph: `___ (${m[2]})`, context: '', section: lastHeading, id: plan.length, by: 'profile' });
    }
    // "registration number ______" — a known label without a colon.
    const nre = /(registration (?:number|no\.?)|tpin|tax payer identification number|name of (?:the )?bidder|company name)\s*(_{3,}|\.{5,}|…{2,})/gi;
    while ((m = nre.exec(text))) {
      const v = blankLabelValue(m[1], f);
      if (v == null || v === '') continue;
      const from = m.index + m[0].length - m[2].length;
      const to = from + m[2].length;
      if (plan.some((x) => x.pi === pi && x.from < to && x.to > from)) continue;
      plan.push({ pi, from, to, value: v, ph: `${m[1]} ___`, context: '', section: lastHeading, id: plan.length, by: 'profile' });
    }
  });

  // Rules first, then the resolver (AI) for what's left.
  for (const b of plan) {
    if (b.value !== undefined) continue;
    // "To: [name of the procuring entity]" gets the full address block.
    if (/^\s*to\s*:/i.test(b.context.slice(0, Math.max(0, b.from))) && /procuring|entity|purchaser|employer/i.test(b.ph) && f.addressee) {
      b.value = f.addressee; b.by = 'rule'; continue;
    }
    const v = ruleValue(b.ph, f);
    if (v !== null) { b.value = v; b.by = 'rule'; }
  }
  const unresolved = plan.filter((b) => b.value === undefined);
  if (unresolved.length && opts.resolve) {
    try {
      const answers = await opts.resolve(unresolved.map((b) => ({ id: b.id, placeholder: b.ph, sentence: b.context, section: b.section })));
      for (const b of unresolved) {
        const v = answers.get(b.id);
        if (v !== undefined && v !== null && String(v).trim() !== '') { b.value = String(v); b.by = 'ai'; }
      }
    } catch (e) {
      report.aiError = e.message || 'AI could not help with the remaining blanks.';
    }
  }

  // Apply per paragraph.
  {
    const byPara = new Map();
    for (const b of plan) {
      if (b.value === undefined) { report.left.push({ where: b.section || 'Document', blank: b.ph }); continue; }
      if (!byPara.has(b.pi)) byPara.set(b.pi, []);
      byPara.get(b.pi).push({ from: b.from, to: b.to, value: b.value });
      if (b.value !== SIGNATURE_TOKEN && b.value !== '') report.filled.push({ where: b.section || 'Document', blank: b.ph, value: b.value, by: b.by });
    }
    const edits = [];
    for (const [pi, reps] of byPara) {
      const p = paras[pi];
      // No overlapping ranges inside one paragraph.
      const clean = reps.sort((a, b) => a.from - b.from).filter((r, i, arr) => i === 0 || r.from >= arr[i - 1].to);
      edits.push({ start: p.start, end: p.end, text: replaceInParagraph(xml.slice(p.start, p.end), clean, o) });
    }
    xml = applyEdits(xml, edits);
  }

  // 4. Signature images (or back to a blank line when there is none).
  if (xml.includes(SIGNATURE_TOKEN)) {
    if (opts.signature) {
      const relsEntry = entries.find((e) => e.name === 'word/_rels/document.xml.rels');
      const ext = opts.signature.ext === 'jpeg' ? 'jpeg' : 'png';
      const media = `media/qf-signature.${ext}`;
      const rid = 'rIdQfSignature1';
      entries.push({ name: `word/${media}`, data: opts.signature.data });
      if (relsEntry) {
        const rels = relsEntry.data.toString('utf8');
        if (!rels.includes(rid)) {
          relsEntry.data = Buffer.from(rels.replace('</Relationships>',
            `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${media}"/></Relationships>`), 'utf8');
        }
      }
      const ct = entries.find((e) => e.name === '[Content_Types].xml');
      if (ct) {
        let s = ct.data.toString('utf8');
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        if (!new RegExp(`Extension="${ext}"`, 'i').test(s)) s = s.replace('<Types ', '<Types ').replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${mime}"/>`);
        ct.data = Buffer.from(s, 'utf8');
      }
      // Size: about 1.3 cm high, width from the image's proportions.
      const cy = 470000;
      const cx = Math.round(cy * Math.min(5, Math.max(1, opts.signature.ratio || 3)));
      let n = 0;
      const drawing = () => {
        n += 1;
        const id = 9100 + n;
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Signature ${n}"/>`
          + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
          + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="signature.${ext}"/><pic:cNvPicPr/></pic:nvPicPr>`
          + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
          + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
          + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
      };
      // Split the run holding the token: text before it, the picture, text after it
      // (so a label in the same run, e.g. "Signed:", is kept).
      xml = xml.replace(/<w:r(?:\s[^>]*)?>(?:(?!<\/w:r>)[\s\S])*?\u2063SIG\u2063(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (run) => {
        const rPr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
        const text = [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decode(m[1])).join('');
        const parts = text.split(SIGNATURE_TOKEN);
        let out = '';
        parts.forEach((part, i) => {
          if (part) out += `<w:r>${rPr}${tNode(part)}</w:r>`;
          if (i < parts.length - 1) out += drawing();
        });
        return out;
      });
      report.signatures = n;
      // Make sure the namespaces used above are declared on the document.
      xml = xml.replace(/<w:document\b([^>]*)>/, (m0, attrs) => {
        let a = attrs;
        if (!/xmlns:wp=/.test(a)) a += ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
        if (!/xmlns:r=/.test(a)) a += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
        return `<w:document${a}>`;
      });
    }
    xml = xml.split(SIGNATURE_TOKEN).join('______________________');
  }

  // Forms for the bank / manufacturer (seen in the body, not just the contents list).
  report.othersForms = Array.from(othersSeen);
  docEntry.data = Buffer.from(xml, 'utf8');
  return { buffer: writeZip(entries), report };
}

module.exports = { fillDocx, elements, paraText, segments, replaceInParagraph, setCellText, ruleValue, labelValue };
