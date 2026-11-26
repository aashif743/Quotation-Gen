const zlib = require('zlib');

// Plain text from a Word .docx file (paragraphs, and tables as "| a | b |"
// rows), without extra packages: a .docx is a zip archive whose
// word/document.xml holds the text.

/** The bytes of one file inside a zip archive (Buffer), or null. */
function readZipEntry(buf, wanted) {
  // End of central directory record: the last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid Word (.docx) file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error('Unsupported compression in the Word file');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

/** Text of one <w:p> paragraph (runs, tabs and line breaks). */
const paraText = (xml) => decode(
  xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, '\u0001$1\u0002')
    .replace(/[^\u0001\u0002\t\n]*\u0001([\s\S]*?)\u0002/g, '$1')
    .replace(/<[^>]+>/g, '')
);

function docxToText(buffer) {
  const xmlBuf = readZipEntry(buffer, 'word/document.xml');
  if (!xmlBuf) throw new Error('This Word file has no text');
  const xml = xmlBuf.toString('utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
  const out = [];
  // Walk top-level paragraphs and tables in order.
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(body))) {
    const block = m[0];
    if (block.startsWith('<w:tbl>')) {
      for (const row of block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
        const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [])
          .map((c) => (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(paraText).join(' ').replace(/\s+/g, ' ').trim());
        out.push(`| ${cells.join(' | ')} |`);
      }
      out.push('');
    } else {
      const t = paraText(block).trim();
      if (t) out.push(t);
    }
  }
  return out.join('\n');
}

module.exports = { docxToText };
