// Returns a vendor_id for the purchase being saved — the buy-side mirror of
// resolveClientId:
//   1. If `vendor_id` was explicitly supplied (autocomplete picked an existing
//      vendor), use it as-is.
//   2. Else if `vendor_name` is set, find an existing vendor by
//      (company_id, name) and reuse it.
//   3. Else create a new vendor row using whatever contact info came in.
//   4. If `vendor_name` is empty/whitespace, return null (ad-hoc purchase).
//
// Always runs against the supplied connection (typically a transaction).
async function resolveVendorId(connection, payload) {
  const company_id = payload.company_id;
  const explicitId = payload.vendor_id;
  const rawName = payload.vendor_name;
  const name = (rawName == null ? '' : String(rawName)).trim();

  if (explicitId) return explicitId;
  if (!name || !company_id) return null;

  const [existing] = await connection.execute(
    'SELECT id FROM vendors WHERE company_id = ? AND name = ?',
    [company_id, name]
  );
  if (existing.length > 0) return existing[0].id;

  // Record who first created this vendor so the Vendors page can scope by
  // role (staff see only their own vendors + vendors they have purchases for).
  const [ins] = await connection.execute(
    `INSERT INTO vendors (company_id, created_by, name, address, email, phone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      company_id,
      payload.created_by || null,
      name,
      payload.vendor_address || null,
      payload.vendor_email || null,
      payload.vendor_phone || null,
    ]
  );
  return ins.insertId;
}

module.exports = { resolveVendorId };
