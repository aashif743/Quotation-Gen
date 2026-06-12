// Returns a client_id for the document being saved:
//   1. If `client_id` was explicitly supplied (autocomplete picked an existing
//      client), use it as-is.
//   2. Else if `client_name` is set, find an existing client by
//      (company_id, name) — case-insensitive trim match — and reuse it.
//   3. Else create a new client row using whatever contact info came in.
//   4. If `client_name` is empty/whitespace, return null (truly ad-hoc doc).
//
// Always runs against the supplied connection (typically a transaction).
async function resolveClientId(connection, payload) {
  const company_id = payload.company_id;
  const explicitId = payload.client_id;
  const rawName = payload.client_name;
  const name = (rawName == null ? '' : String(rawName)).trim();

  if (explicitId) return explicitId;
  if (!name || !company_id) return null;

  const [existing] = await connection.execute(
    'SELECT id FROM clients WHERE company_id = ? AND name = ?',
    [company_id, name]
  );
  if (existing.length > 0) return existing[0].id;

  // Record who first created this client so the Clients page can scope by
  // role (staff see only their own clients + clients they have docs for).
  const [ins] = await connection.execute(
    `INSERT INTO clients (company_id, created_by, name, address, email, phone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      company_id,
      payload.created_by || null,
      name,
      payload.client_address || null,
      payload.client_email || null,
      payload.client_phone || null,
    ]
  );
  return ins.insertId;
}

module.exports = { resolveClientId };
