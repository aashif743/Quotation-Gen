#!/usr/bin/env node
/**
 * Attendance Agent
 * ----------------
 * Runs on the office PC that the ZKTeco fingerprint reader is connected to.
 * It reads new punches from the device and forwards them to the Attendance
 * API. The server derives check-in / check-out (first punch = in, last = out).
 *
 * Design notes:
 *  - The device keeps its own clock in OFFICE LOCAL TIME. We send each punch as
 *    a naive "YYYY-MM-DD HH:MM:SS" wall-clock string so the server stores it
 *    verbatim (no timezone drift).
 *  - The server dedupes on (company, device_user_id, punch_time) with
 *    INSERT IGNORE, so re-sending a punch is always safe. We ALSO keep a local
 *    watermark (state.json) so we normally only send new punches.
 *  - Nothing is deleted from the device unless `clearDeviceLogAfterSync` is
 *    explicitly enabled (off by default — safer).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const ZKLib = require('node-zklib');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');
const TEST_MODE = process.argv.includes('--test');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('✖ config.json not found. Copy config.example.json → config.json and fill it in.');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!cfg.apiKey || cfg.apiKey.startsWith('PASTE_')) {
    console.error('✖ Set "apiKey" in config.json (copy it from the Attendance → Devices tab).');
    process.exit(1);
  }
  return cfg;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { lastPunch: null }; }
}
function saveState(state) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2)); } catch (e) { console.warn('⚠ could not save state:', e.message); }
}

// Format a JS Date as office wall-clock "YYYY-MM-DD HH:MM:SS" (LOCAL parts).
function toWallClock(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// POST punches to the API. Returns the parsed JSON response.
function postPunches(cfg, punches) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ punches });
    const url = new URL('/api/attendance/agent/punch', cfg.apiBaseUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Api-Key': cfg.apiKey,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        } else {
          reject(new Error(`API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function readDevice(cfg) {
  const { ip, port = 4370, timeout = 10000, inport = 5200 } = cfg.device || {};
  if (!ip) throw new Error('config.device.ip is required');
  const zk = new ZKLib(ip, port, timeout, inport);
  await zk.createSocket();
  let logs;
  try {
    const res = await zk.getAttendances();
    logs = (res && res.data) || [];
    if (cfg.clearDeviceLogAfterSync) {
      // Only clear once we have the logs in hand.
      await zk.clearAttendanceLog();
    }
  } finally {
    try { await zk.disconnect(); } catch { /* ignore */ }
  }
  return logs;
}

// Map a raw node-zklib record to our punch shape.
function toPunch(rec) {
  const duid = rec.deviceUserId ?? rec.userId ?? rec.uid;
  const when = rec.recordTime instanceof Date ? rec.recordTime : new Date(rec.recordTime);
  return { device_user_id: String(duid), timestamp: toWallClock(when), _t: when.getTime() };
}

async function syncOnce(cfg, state) {
  const raw = await readDevice(cfg);
  const all = raw.map(toPunch).filter((p) => p.device_user_id && !Number.isNaN(p._t));

  const watermark = state.lastPunch ? new Date(state.lastPunch).getTime() : 0;
  const fresh = all.filter((p) => p._t > watermark).sort((a, b) => a._t - b._t);

  if (fresh.length === 0) {
    console.log(`· ${new Date().toLocaleTimeString()} — no new punches (${all.length} on device)`);
    return;
  }

  const payload = fresh.map(({ device_user_id, timestamp }) => ({ device_user_id, timestamp }));
  const result = await postPunches(cfg, payload);
  const newWatermark = fresh[fresh.length - 1]._t;
  state.lastPunch = new Date(newWatermark).toISOString();
  saveState(state);

  console.log(`✓ ${new Date().toLocaleTimeString()} — sent ${payload.length}: inserted=${result.inserted ?? '?'} received=${result.received ?? '?'}` +
    (result.unmatched && result.unmatched.length ? ` · unmatched device IDs: ${result.unmatched.join(', ')} (enroll them in the Staff tab)` : ''));
}

async function main() {
  const cfg = loadConfig();

  if (TEST_MODE) {
    console.log(`Testing connection to device ${cfg.device.ip}:${cfg.device.port || 4370} …`);
    const raw = await readDevice(cfg);
    console.log(`✓ Connected. Device holds ${raw.length} attendance record(s).`);
    if (raw.length) console.log('  Sample:', toPunch(raw[raw.length - 1]));
    console.log('Testing API reachability …');
    const r = await postPunches(cfg, []).catch((e) => ({ error: e.message }));
    console.log(r.error ? `✖ API error: ${r.error}` : `✓ API reachable (received=${r.received ?? 0}).`);
    process.exit(0);
  }

  const state = loadState();
  const interval = Math.max(10, cfg.pollSeconds || 30) * 1000;
  console.log(`▶ Attendance agent started. Polling ${cfg.device.ip} every ${interval / 1000}s → ${cfg.apiBaseUrl}`);

  const tick = async () => {
    try { await syncOnce(cfg, state); }
    catch (e) { console.error(`✖ ${new Date().toLocaleTimeString()} — ${e.message}`); }
  };
  await tick();
  setInterval(tick, interval);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
