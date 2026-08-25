# ZK6500 USB Fingerprint Bridge

The **ZK6500** is a bare USB fingerprint *sensor* — no screen, no clock, no
onboard storage. It cannot be reached over the network like an attendance
terminal, so the Node agent in the parent folder does **not** work with it.
Instead, fingerprints are enrolled and matched **on the office PC** using
ZKTeco's **ZKFinger SDK**, and this bridge sends the recognised punches to the
attendance system.

```
[ ZK6500 sensor ] --USB--> [ Windows PC: ZKFinger SDK + this bridge ] --HTTPS--> [ Attendance system ]
```

Only a numeric ID + the office wall-clock time are sent to the server. The
actual fingerprint template stays on this PC (in `templates.json`).

---

## Requirements

- A **Windows** PC (the ZKFinger SDK is Windows-only).
- The **ZK6500** plugged into USB.
- **ZKTeco ZKFinger SDK** installed (provides the USB driver + `libzkfp.dll`).
  Get it from ZKTeco / your reseller ("ZKFinger SDK 5.x" or "ZKFinger Reader SDK").
- **Python 3.8+**. Its architecture must match the SDK — the ZKFinger SDK is
  usually **32-bit**, so install **32-bit Python** if `test` fails to find the
  device on 64-bit Python.

---

## Setup

### 1. Register a device + get the API key (once)
On the website, sign in as admin → **Attendance → Devices** → **Register**
(e.g. "Office ZK6500") → **Show** → copy the API key.

### 2. Install the SDK and this bridge
1. Install the **ZKFinger SDK** and reboot if it asks. Plug in the ZK6500;
   Windows Device Manager should list it with no warning icon.
2. Open a terminal in this folder and install the Python deps:
   ```bat
   pip install -r requirements.txt
   ```
3. Copy the config and paste your key:
   ```bat
   copy config.example.json config.json
   ```
   Edit `config.json` → set `apiKey` (from step 1).

### 3. Test
```bat
python zkbridge.py test
```
Expect `OK: sensor detected.` and `OK: API reachable.`

### 4. Start the bridge (recommended way — no more terminal after this)
Double-click **`start-bridge.bat`** (or run `python zkbridge.py serve`). It does
two jobs at once: it **captures attendance** AND serves a simple **enrollment
web page**. Leave the window open.

### 5. Enroll each staff member — from a web page, not the terminal
1. On the website, **Attendance → Staff**, click **Add Staff** and enter each
   person's name. Each one is given a **Fingerprint ID** automatically (you can
   add as many people as you like — they don't need login accounts).
2. On THIS PC, open a browser at **http://localhost:5580**. You'll see that staff
   list. Click **Enroll** next to a name and have them press their finger **3
   times** when the page says so. Repeat for each person.

That's it — punches now appear under **Attendance → Today / Records** within a
second or two. First scan of the day = check-in, last scan = check-out.

> Prefer the command line? You can still use
> `python zkbridge.py enroll --id 101`, `list`, and `delete --id 101`.

### 6. Start automatically with Windows (so nobody touches the terminal)
Put a shortcut to **`start-bridge.bat`** in the Startup folder:
1. Press **Win + R**, type `shell:startup`, Enter.
2. Copy `start-bridge.bat` there (right-click → **Create shortcut**, move the
   shortcut into that folder).

Now the bridge launches whenever the PC boots. Staff just scan; you only open
**http://localhost:5580** when you need to enroll someone new.

---

## config.json

| Field | Meaning |
|-------|---------|
| `apiBaseUrl` | Attendance system URL (already set to the live site). |
| `apiKey` | Per-device key from **Attendance → Devices**. |
| `cooldownSeconds` | Ignore repeat presses from the same person within this many seconds (default 30) so one check-in isn't recorded many times. |

Re-sending the same punch is harmless — the server ignores duplicates.

---

## Troubleshooting

- **"No fingerprint sensor found"** — SDK not installed, wrong-architecture
  Python (try 32-bit), or the ZK6500 isn't plugged in / recognised in Device
  Manager.
- **`unrecognised finger`** — that finger isn't enrolled; run `enroll` for them.
- **`! ID N not linked to a staff member`** — enroll succeeded on this PC but no
  one on the website has Device User ID `N`; set it in **Attendance → Staff**.
- **API 401** — wrong `apiKey`, or the device was disabled/deleted on the
  website. Copy a fresh key (or **Regenerate**) from the Devices tab.
- **`pyzkfp` import error** — `pip install -r requirements.txt`, and confirm the
  ZKFinger SDK is installed (pyzkfp loads its DLLs).
