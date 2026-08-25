# Attendance Agent (ZKTeco → System)

This small program runs on the **office PC** and forwards fingerprint punches
from a **ZKTeco** reader to the attendance system. The website then shows
check-in / check-out, late arrivals, and reports.

```
[ Fingerprint reader ] --USB/Network--> [ Office PC running this agent ] --HTTPS--> [ Attendance system ]
```

The staff scan is captured by the reader; the agent reads new scans every few
seconds and sends them up. Time and date come from the reader's own clock and
are stored exactly as-is (no timezone surprises). **First scan of the day = check-in,
last scan = check-out** — handled automatically by the server.

---

## Which ZKTeco device do you have?

**A. Attendance terminal (recommended)** — a wall/desk unit with a screen and
keypad (e.g. ZKTeco K40, MB360, F18, uFace). These store users + logs onboard
and connect over **TCP/IP (network)** — even when powered via USB, data goes
over the network port. **This agent talks to these directly.** ✅

**B. Bare USB fingerprint scanner** — a small sensor with no screen (e.g.
**ZK6500**, ZK4500, SLK20R). These do **not** store users or logs; matching must
happen on the PC via the Windows **ZKFinger SDK**. This Node agent does not drive
those. **➡ Use the ready-made bridge in [`zk6500/`](./zk6500/README.md) instead.**

---

## Setup (attendance terminal)

### 1. Register the device in the system
1. Sign in as an admin → **Attendance → Devices**.
2. Enter a name (e.g. "Front Desk Reader") → **Register**.
3. Click **Show** and **copy the API key**.

### 2. Enroll each staff member
1. On the ZKTeco device, enroll each employee's fingerprint under a **User ID**
   number (e.g. 101, 102, …). Note each person's number.
2. In **Attendance → Staff**, click **Enroll** next to each staff member and
   enter their **Device User ID** (the same number). This links a fingerprint to
   a person.

### 3. Install and run the agent on the office PC
Requires [Node.js](https://nodejs.org) (LTS) installed.

```bash
cd agent
npm install
copy config.example.json config.json     # macOS/Linux: cp config.example.json config.json
```

Edit `config.json`:
- `apiKey` — paste the device API key from step 1.
- `device.ip` — the reader's IP address (see it on the device: Menu → Comm → Ethernet).
- `apiBaseUrl` — already set to the live system; change only if self-hosting.

Test it:
```bash
npm run test-connection
```
You should see the device record count and `✓ API reachable`.

Run it:
```bash
npm start
```
Leave this running. New punches appear under **Attendance → Today / Records**
within a few seconds.

### 4. Keep it running automatically
- **Windows:** easiest is [NSSM](https://nssm.cc/) to install it as a service, or
  add a shortcut to `node index.js` in `shell:startup`.
- **Any OS:** `npm i -g pm2 && pm2 start index.js --name attendance-agent && pm2 save`.

---

## config.json reference

| Field | Meaning |
|-------|---------|
| `apiBaseUrl` | The attendance system URL. |
| `apiKey` | Per-device key from the Devices tab. Identifies which company the punches belong to. |
| `device.ip` / `device.port` | Reader's network address (default port `4370`). |
| `pollSeconds` | How often to check for new punches (default 30). |
| `clearDeviceLogAfterSync` | Leave `false`. If `true`, wipes the device log after each sync (only if the device is your single source and storage is tight). |

Re-sending the same punch is harmless — the server ignores duplicates. A local
`state.json` remembers the last punch so normal runs only send new ones.

---

## USB-only scanners (no screen) — e.g. ZK6500

A bare USB sensor can't be read by this Node agent because matching happens in
the vendor's Windows SDK. A ready-to-run **bridge** is provided:
**[`zk6500/`](./zk6500/README.md)** (Python + ZKFinger SDK). It enrolls
fingerprints on the PC and POSTs to the same endpoint this agent uses, so
enrollment and reports on the website work identically:

```
POST {apiBaseUrl}/api/attendance/agent/punch
Header: X-Api-Key: <device api key>
Body:   { "device_user_id": "101", "timestamp": "2026-08-25 08:03:00" }
```

Alternatively, use a networked attendance **terminal** (option A) — simplest for
daily check-in/out.

---

## Troubleshooting

- **`unmatched device IDs` in the log** — that fingerprint's User ID isn't linked
  to a staff member yet. Add it in **Attendance → Staff**.
- **Can't connect to device** — confirm the PC and reader are on the same network
  and the IP/port are correct; try `ping <device ip>`.
- **API 401** — the `apiKey` is wrong or the device was disabled/deleted in the
  Devices tab. Copy a fresh key (or **Regenerate**).
