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

### 4. Enroll each staff member
1. On the website, **Attendance → Staff**, give each staff member a **Device
   User ID** number (e.g. Aashif = 101, Nisha = 102). Remember them.
2. For each person, run enroll with that same number and have them press their
   finger 3 times when prompted:
   ```bat
   python zkbridge.py enroll --id 101
   ```
   Repeat for every staff member (`--id 102`, `103`, …).

   > The `--id` here **must equal** the Device User ID you set on the website —
   > that's what links a fingerprint to a person.

Handy: `python zkbridge.py list` (show enrolled IDs) ·
`python zkbridge.py delete --id 101` (remove one).

### 5. Run it (daily)
```bat
python zkbridge.py run
```
Leave this window open. When staff press their finger, a punch appears under
**Attendance → Today / Records** within a second or two. First scan of the day
is their check-in, last scan is their check-out.

### 6. Start automatically (optional)
- Create a shortcut to `python C:\path\to\zkbridge.py run` in
  `shell:startup`, **or**
- Use [NSSM](https://nssm.cc/) to run it as a Windows service so it restarts
  with the PC.

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
