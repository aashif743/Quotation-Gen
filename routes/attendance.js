const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { isAuthenticated, canManageAttendance } = require('../middleware/auth');
const { requireCompanyAccess } = require('../utils/tenancy');

const router = express.Router();

// ===========================================================================
// AGENT API — used by the local PC agent (talks to the ZKTeco reader). Auth is
// a per-device API key (X-Api-Key header), NOT a user session.
// ===========================================================================
async function agentAuth(req, res, next) {
  try {
    const key = req.header('X-Api-Key') || req.query.api_key || (req.body && req.body.api_key);
    if (!key) return res.status(401).json({ error: 'Missing API key' });
    const [rows] = await db.execute(
      'SELECT id, company_id FROM attendance_devices WHERE api_key = ? AND active = 1',
      [key]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid or inactive API key' });
    req.device = rows[0];
    db.execute('UPDATE attendance_devices SET last_seen_at = NOW() WHERE id = ?', [rows[0].id]).catch(() => {});
    next();
  } catch (e) {
    console.error('agentAuth error:', e);
    res.status(500).json({ error: 'Auth failed' });
  }
}

// Normalize an incoming timestamp to 'YYYY-MM-DD HH:MM:SS'. Attendance uses the
// office's WALL-CLOCK time, so a plain local datetime (no timezone) is stored
// verbatim — this avoids any server/office timezone drift (the ZKTeco device
// keeps local time and the agent should send it as-is). Only a value carrying
// an explicit timezone falls back to Date conversion.
function toMysqlDatetime(ts) {
  if (!ts) return null;
  if (typeof ts === 'string') {
    const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// POST /api/attendance/agent/punch — push one or many punches.
// Body: { device_user_id, timestamp }  OR  { punches: [{device_user_id, timestamp}, ...] }
router.post('/agent/punch', agentAuth, async (req, res) => {
  try {
    const { company_id: companyId, id: deviceId } = req.device;
    const list = Array.isArray(req.body.punches)
      ? req.body.punches
      : [{ device_user_id: req.body.device_user_id, timestamp: req.body.timestamp }];

    // Map device_user_id -> attendance employee id for this company (one query).
    const [emps] = await db.execute(
      'SELECT device_user_id, id FROM attendance_employees WHERE company_id = ?', [companyId]);
    const map = {};
    emps.forEach((e) => { map[String(e.device_user_id)] = e.id; });

    let inserted = 0;
    const unmatched = new Set();
    for (const p of list) {
      const duid = p.device_user_id != null ? String(p.device_user_id) : null;
      const when = toMysqlDatetime(p.timestamp);
      if (!duid || !when) continue;
      const employeeId = map[duid] || null;
      if (!employeeId) unmatched.add(duid);
      // INSERT IGNORE dedups re-pushed logs via the unique (company, duid, time) key.
      const [r] = await db.execute(
        `INSERT IGNORE INTO attendance_punches (company_id, device_id, employee_id, device_user_id, punch_time, source)
         VALUES (?, ?, ?, ?, ?, 'device')`,
        [companyId, deviceId, employeeId, duid, when]
      );
      inserted += r.affectedRows;
    }
    res.json({ received: list.length, inserted, unmatched: [...unmatched] });
  } catch (error) {
    console.error('Error recording punches:', error);
    res.status(500).json({ error: 'Failed to record punches' });
  }
});

// GET /api/attendance/agent/enrollments — the bridge fetches the roster
// (device_user_id ↔ name) so it can list people and enroll fingerprints.
router.get('/agent/enrollments', agentAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT device_user_id, id AS employee_id, name
         FROM attendance_employees
        WHERE company_id = ? AND active = 1
        ORDER BY name`, [req.device.company_id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch roster' });
  }
});

// ===========================================================================
// ADMIN API — session + admin, org/company scoped.
// ===========================================================================
const admin = [isAuthenticated, canManageAttendance, requireCompanyAccess];

// A record's company must belong to the caller's organization.
async function inOrg(table, id, orgId) {
  const [r] = await db.execute(
    `SELECT 1 FROM \`${table}\` t JOIN companies c ON t.company_id = c.id WHERE t.id = ? AND c.organization_id = ? LIMIT 1`,
    [id, orgId]);
  return r.length > 0;
}

const genKey = () => 'att_' + crypto.randomBytes(24).toString('hex');

// ---- Devices ----
router.get('/devices', admin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, api_key, active, last_seen_at, created_at FROM attendance_devices WHERE company_id = ? ORDER BY created_at DESC',
      [req.query.company_id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch devices' }); }
});

router.post('/devices', admin, async (req, res) => {
  try {
    const { company_id, name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Device name is required' });
    const [r] = await db.execute(
      'INSERT INTO attendance_devices (company_id, name, api_key) VALUES (?, ?, ?)',
      [company_id, name.trim(), genKey()]);
    const [row] = await db.execute('SELECT * FROM attendance_devices WHERE id = ?', [r.insertId]);
    res.status(201).json(row[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create device' }); }
});

router.put('/devices/:id', admin, async (req, res) => {
  try {
    if (!(await inOrg('attendance_devices', req.params.id, req.user.organization_id)))
      return res.status(404).json({ error: 'Device not found' });
    const { name, active } = req.body;
    const fields = [], vals = [];
    if (name != null) { fields.push('name = ?'); vals.push(name); }
    if (active != null) { fields.push('active = ?'); vals.push(active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'No changes' });
    vals.push(req.params.id);
    await db.execute(`UPDATE attendance_devices SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [row] = await db.execute('SELECT * FROM attendance_devices WHERE id = ?', [req.params.id]);
    res.json(row[0]);
  } catch (e) { res.status(500).json({ error: 'Failed to update device' }); }
});

router.post('/devices/:id/regenerate', admin, async (req, res) => {
  try {
    if (!(await inOrg('attendance_devices', req.params.id, req.user.organization_id)))
      return res.status(404).json({ error: 'Device not found' });
    const key = genKey();
    await db.execute('UPDATE attendance_devices SET api_key = ? WHERE id = ?', [key, req.params.id]);
    res.json({ api_key: key });
  } catch (e) { res.status(500).json({ error: 'Failed to regenerate key' }); }
});

router.delete('/devices/:id', admin, async (req, res) => {
  try {
    if (!(await inOrg('attendance_devices', req.params.id, req.user.organization_id)))
      return res.status(404).json({ error: 'Device not found' });
    await db.execute('DELETE FROM attendance_devices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Device removed.' });
  } catch (e) { res.status(500).json({ error: 'Failed to delete device' }); }
});

// ---- Employees (the attendance roster — people who clock in/out) ----
// These are NOT system login accounts. Anyone with attendance access can add
// them by name; each gets a device_user_id ("Fingerprint ID") for the reader.
router.get('/employees', admin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, name, code, device_user_id, active, created_at
         FROM attendance_employees WHERE company_id = ? ORDER BY name`, [req.query.company_id]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch staff' }); }
});

// Next free device_user_id for a company (small, human-friendly, starts at 1).
async function nextDeviceUserId(companyId) {
  const [rows] = await db.execute(
    'SELECT device_user_id FROM attendance_employees WHERE company_id = ?', [companyId]);
  let max = 0;
  rows.forEach((r) => { const n = parseInt(r.device_user_id, 10); if (!Number.isNaN(n) && n > max) max = n; });
  return String(max + 1);
}

router.post('/employees', admin, async (req, res) => {
  try {
    const { company_id, name, code } = req.body;
    let { device_user_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    device_user_id = device_user_id != null && String(device_user_id).trim() !== ''
      ? String(device_user_id).trim()
      : await nextDeviceUserId(company_id);
    const [r] = await db.execute(
      `INSERT INTO attendance_employees (company_id, name, code, device_user_id, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [company_id, name.trim(), code?.trim() || null, device_user_id, req.user.id]);
    const [row] = await db.execute('SELECT id, name, code, device_user_id, active, created_at FROM attendance_employees WHERE id = ?', [r.insertId]);
    res.status(201).json(row[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That Fingerprint ID is already used by someone else in this company.' });
    console.error(e); res.status(500).json({ error: 'Failed to add staff' });
  }
});

router.put('/employees/:id', admin, async (req, res) => {
  try {
    if (!(await inOrg('attendance_employees', req.params.id, req.user.organization_id)))
      return res.status(404).json({ error: 'Staff not found' });
    const { name, code, device_user_id, active } = req.body;
    const fields = [], vals = [];
    if (name != null) { fields.push('name = ?'); vals.push(String(name).trim()); }
    if (code !== undefined) { fields.push('code = ?'); vals.push(code?.trim() || null); }
    if (device_user_id != null && String(device_user_id).trim() !== '') { fields.push('device_user_id = ?'); vals.push(String(device_user_id).trim()); }
    if (active != null) { fields.push('active = ?'); vals.push(active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'No changes' });
    vals.push(req.params.id);
    await db.execute(`UPDATE attendance_employees SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [row] = await db.execute('SELECT id, name, code, device_user_id, active, created_at FROM attendance_employees WHERE id = ?', [req.params.id]);
    res.json(row[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That Fingerprint ID is already used by someone else in this company.' });
    console.error(e); res.status(500).json({ error: 'Failed to update staff' });
  }
});

router.delete('/employees/:id', admin, async (req, res) => {
  try {
    if (!(await inOrg('attendance_employees', req.params.id, req.user.organization_id)))
      return res.status(404).json({ error: 'Staff not found' });
    await db.execute('DELETE FROM attendance_employees WHERE id = ?', [req.params.id]);
    res.json({ message: 'Removed.' });
  } catch (e) { res.status(500).json({ error: 'Failed to remove staff' }); }
});

// ---- Settings ----
async function getSettings(companyId) {
  const [rows] = await db.execute('SELECT work_start, work_end, late_grace_minutes FROM attendance_settings WHERE company_id = ?', [companyId]);
  if (rows.length) return rows[0];
  await db.execute('INSERT IGNORE INTO attendance_settings (company_id) VALUES (?)', [companyId]);
  return { work_start: '08:00:00', work_end: '17:00:00', late_grace_minutes: 10 };
}

router.get('/settings', admin, async (req, res) => {
  try { res.json(await getSettings(req.query.company_id)); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch settings' }); }
});

router.put('/settings', admin, async (req, res) => {
  try {
    const { company_id, work_start, work_end, late_grace_minutes } = req.body;
    await db.execute(
      `INSERT INTO attendance_settings (company_id, work_start, work_end, late_grace_minutes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE work_start = VALUES(work_start), work_end = VALUES(work_end), late_grace_minutes = VALUES(late_grace_minutes)`,
      [company_id, work_start || '08:00:00', work_end || '17:00:00', Number(late_grace_minutes) || 0]);
    res.json(await getSettings(company_id));
  } catch (e) { res.status(500).json({ error: 'Failed to save settings' }); }
});

// ---- Punches list / manual / delete ----
router.get('/', admin, async (req, res) => {
  try {
    const { company_id, from, to, employee_id } = req.query;
    const cond = ['p.company_id = ?']; const args = [company_id];
    if (from)       { cond.push('p.punch_time >= ?'); args.push(from + ' 00:00:00'); }
    if (to)         { cond.push('p.punch_time <= ?'); args.push(to + ' 23:59:59'); }
    if (employee_id){ cond.push('p.employee_id = ?'); args.push(employee_id); }
    const [rows] = await db.execute(
      `SELECT p.id, p.employee_id, p.device_user_id,
              DATE_FORMAT(p.punch_time, '%Y-%m-%d %H:%i:%s') AS punch_time, p.source, p.note,
              e.name AS user_name
         FROM attendance_punches p LEFT JOIN attendance_employees e ON p.employee_id = e.id
        WHERE ${cond.join(' AND ')}
        ORDER BY p.punch_time DESC LIMIT 1000`, args);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to fetch punches' }); }
});

router.post('/manual', admin, async (req, res) => {
  try {
    const { company_id, employee_id, punch_time, note } = req.body;
    if (!employee_id || !punch_time) return res.status(400).json({ error: 'Staff and time are required' });
    if (!(await inOrg('attendance_employees', employee_id, req.user.organization_id)))
      return res.status(400).json({ error: 'Staff not in your organization' });
    const when = toMysqlDatetime(punch_time);
    if (!when) return res.status(400).json({ error: 'Invalid time' });
    // Carry the employee's device_user_id so the dedup key stays consistent.
    const [emp] = await db.execute('SELECT device_user_id FROM attendance_employees WHERE id = ?', [employee_id]);
    await db.execute(
      `INSERT INTO attendance_punches (company_id, employee_id, device_user_id, punch_time, source, note, created_by)
       VALUES (?, ?, ?, ?, 'manual', ?, ?)`,
      [company_id, employee_id, emp[0]?.device_user_id || null, when, note || null, req.user.id]);
    res.status(201).json({ message: 'Punch added.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to add punch' }); }
});

router.delete('/punch/:id', admin, async (req, res) => {
  try {
    if (!(await inOrg('attendance_punches', req.params.id, req.user.organization_id)))
      return res.status(404).json({ error: 'Punch not found' });
    await db.execute('DELETE FROM attendance_punches WHERE id = ?', [req.params.id]);
    res.json({ message: 'Punch deleted.' });
  } catch (e) { res.status(500).json({ error: 'Failed to delete punch' }); }
});

// ---- Today's status ----
router.get('/today', admin, async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const settings = await getSettings(companyId);
    const [emps] = await db.execute(
      `SELECT id, name FROM attendance_employees WHERE company_id = ? AND active = 1 ORDER BY name`,
      [companyId]);
    const [punches] = await db.execute(
      `SELECT employee_id,
              DATE_FORMAT(MIN(punch_time), '%Y-%m-%d %H:%i:%s') first_in,
              DATE_FORMAT(MAX(punch_time), '%Y-%m-%d %H:%i:%s') last_out, COUNT(*) cnt
         FROM attendance_punches WHERE company_id = ? AND employee_id IS NOT NULL AND DATE(punch_time) = CURDATE()
        GROUP BY employee_id`, [companyId]);
    const byEmp = {}; punches.forEach((p) => { byEmp[p.employee_id] = p; });

    const [gh, gm] = String(settings.work_start).split(':').map(Number);
    const lateThreshold = gh * 60 + gm + (settings.late_grace_minutes || 0);
    const rows = emps.map((e) => {
      const p = byEmp[e.id];
      if (!p) return { user_id: e.id, name: e.name, status: 'absent', first_in: null, last_out: null };
      const inD = new Date(p.first_in);
      const inMin = inD.getHours() * 60 + inD.getMinutes();
      const late = inMin > lateThreshold;
      const outVal = p.cnt > 1 ? p.last_out : null;
      return { user_id: e.id, name: e.name, status: late ? 'late' : 'present', first_in: p.first_in, last_out: outVal };
    });
    res.json({ settings, staff: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to load today' }); }
});

// ---- Monthly / range report (per staff per day) ----
router.get('/report', admin, async (req, res) => {
  try {
    const { company_id, from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
    const settings = await getSettings(company_id);
    const [rows] = await db.execute(
      `SELECT p.employee_id, e.name, DATE_FORMAT(p.punch_time, '%Y-%m-%d') d,
              DATE_FORMAT(MIN(p.punch_time), '%Y-%m-%d %H:%i:%s') first_in,
              DATE_FORMAT(MAX(p.punch_time), '%Y-%m-%d %H:%i:%s') last_out, COUNT(*) cnt
         FROM attendance_punches p JOIN attendance_employees e ON p.employee_id = e.id
        WHERE p.company_id = ? AND p.employee_id IS NOT NULL AND DATE(p.punch_time) BETWEEN ? AND ?
        GROUP BY p.employee_id, d
        ORDER BY e.name, d`, [company_id, from, to]);
    const [gh, gm] = String(settings.work_start).split(':').map(Number);
    const lateThreshold = gh * 60 + gm + (settings.late_grace_minutes || 0);
    const report = rows.map((r) => {
      const inD = new Date(r.first_in);
      const late = (inD.getHours() * 60 + inD.getMinutes()) > lateThreshold;
      const hours = r.cnt > 1 ? Math.round(((new Date(r.last_out) - inD) / 3600000) * 100) / 100 : 0;
      return {
        user_id: r.employee_id, name: r.name, date: r.d,
        first_in: r.first_in, last_out: r.cnt > 1 ? r.last_out : null,
        hours, late,
      };
    });
    res.json({ settings, rows: report });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to build report' }); }
});

module.exports = router;
