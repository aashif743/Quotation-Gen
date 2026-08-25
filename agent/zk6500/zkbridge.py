#!/usr/bin/env python3
"""
ZK6500 USB fingerprint bridge
-----------------------------
The ZK6500 is a bare USB fingerprint SENSOR: no screen, no clock, no onboard
user storage. Enrollment and matching therefore happen HERE, on the PC, using
ZKTeco's ZKFinger SDK (via the `pyzkfp` wrapper). This bridge:

  * enroll  -> capture a staff member's fingerprint 3x, store the template
               locally, keyed by the SAME "Device User ID" you set in the
               website (Attendance -> Staff).
  * run     -> watch the sensor; on each recognised finger, POST a punch to the
               attendance API (first scan of the day = check-in, last = out).

Fingerprint templates never leave this PC as images; only a numeric ID + the
office wall-clock time are sent to the server.

Usage (on the office Windows PC, in this folder):
    python zkbridge.py test                 # check sensor + API
    python zkbridge.py enroll --id 101      # enroll staff whose Device User ID is 101
    python zkbridge.py list                 # show enrolled IDs
    python zkbridge.py delete --id 101      # remove one enrollment
    python zkbridge.py run                  # start capturing attendance
"""

import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime

try:
    import requests
except ImportError:
    print("Missing dependency. Run:  pip install -r requirements.txt")
    sys.exit(1)

try:
    from pyzkfp import ZKFP2
except ImportError:
    print("Missing dependency 'pyzkfp'. Run:  pip install -r requirements.txt")
    print("You must ALSO install ZKTeco's ZKFinger SDK first (see README.md).")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
TEMPLATES_PATH = os.path.join(HERE, "templates.json")


# --------------------------------------------------------------------------- #
# Config + template storage
# --------------------------------------------------------------------------- #
def load_config():
    if not os.path.exists(CONFIG_PATH):
        sys.exit("config.json not found. Copy config.example.json -> config.json and fill it in.")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    if not cfg.get("apiKey") or str(cfg["apiKey"]).startswith("PASTE_"):
        sys.exit('Set "apiKey" in config.json (copy it from the website: Attendance -> Devices).')
    return cfg


def load_templates():
    """Returns { device_user_id(str): base64_template(str) }."""
    if not os.path.exists(TEMPLATES_PATH):
        return {}
    with open(TEMPLATES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_templates(data):
    with open(TEMPLATES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# --------------------------------------------------------------------------- #
# Device helpers
# --------------------------------------------------------------------------- #
def open_device():
    zk = ZKFP2()
    zk.Init()
    if zk.GetDeviceCount() < 1:
        zk.Terminate()
        sys.exit("No fingerprint sensor found. Plug in the ZK6500 and install the ZKFinger SDK (see README.md).")
    zk.OpenDevice(0)
    return zk


def load_db(zk, templates):
    """Push all stored templates into the SDK's in-memory match DB."""
    for sid, b64 in templates.items():
        try:
            zk.DBAdd(int(sid), base64.b64decode(b64))
        except Exception as e:  # noqa: BLE001
            print(f"  ! could not load template for ID {sid}: {e}")


def acquire_blocking(zk, prompt):
    """Wait for one good finger press; returns the raw template bytes."""
    print(prompt)
    while True:
        capture = zk.AcquireFingerprint()
        if capture:
            tmp, _img = capture
            return tmp
        time.sleep(0.1)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
def post_punch(cfg, device_user_id, when):
    url = cfg["apiBaseUrl"].rstrip("/") + "/api/attendance/agent/punch"
    body = {"device_user_id": str(device_user_id), "timestamp": when}
    r = requests.post(url, json=body, headers={"X-Api-Key": cfg["apiKey"]}, timeout=15)
    r.raise_for_status()
    return r.json()


def wall_clock_now():
    # Naive office-local time; the server stores it verbatim (no timezone drift).
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #
def cmd_test(cfg):
    zk = open_device()
    print("OK: sensor detected.")
    zk.Terminate()
    # Reachability check: send an empty batch through the punch route.
    url = cfg["apiBaseUrl"].rstrip("/") + "/api/attendance/agent/punch"
    try:
        r = requests.post(url, json={"punches": []}, headers={"X-Api-Key": cfg["apiKey"]}, timeout=15)
        if r.ok:
            print(f"OK: API reachable ({cfg['apiBaseUrl']}).")
        else:
            print(f"! API responded {r.status_code}: {r.text[:200]}")
    except Exception as e:  # noqa: BLE001
        print(f"! Could not reach API: {e}")


def cmd_enroll(cfg, args):
    sid = str(args.id).strip()
    if not sid:
        sys.exit("Provide --id (the Device User ID you set for this staff member on the website).")
    templates = load_templates()
    if sid in templates and not args.force:
        sys.exit(f"ID {sid} is already enrolled. Use --force to overwrite.")

    zk = open_device()
    try:
        samples = []
        for i in range(3):
            tmp = acquire_blocking(zk, f"  Press finger ({i + 1}/3) ...")
            samples.append(tmp)
            print("   captured.")
            time.sleep(0.6)  # let them lift the finger between presses
        reg_temp, _len = zk.DBMerge(*samples)
        templates[sid] = base64.b64encode(bytes(reg_temp)).decode("ascii")
        save_templates(templates)
        print(f"Enrolled ID {sid}. ({len(templates)} fingerprint(s) stored.)")
        print("Make sure a staff member is mapped to this same Device User ID in Attendance -> Staff.")
    finally:
        zk.Terminate()


def cmd_list(_cfg):
    templates = load_templates()
    if not templates:
        print("No fingerprints enrolled yet.")
        return
    print("Enrolled Device User IDs:")
    for sid in sorted(templates, key=lambda x: (len(x), x)):
        print(f"  - {sid}")


def cmd_delete(_cfg, args):
    sid = str(args.id).strip()
    templates = load_templates()
    if sid not in templates:
        sys.exit(f"ID {sid} is not enrolled.")
    del templates[sid]
    save_templates(templates)
    print(f"Removed enrollment for ID {sid}.")


def cmd_run(cfg):
    templates = load_templates()
    if not templates:
        sys.exit("No fingerprints enrolled. Run:  python zkbridge.py enroll --id <DeviceUserID>")

    cooldown = int(cfg.get("cooldownSeconds", 30))
    zk = open_device()
    load_db(zk, templates)
    print(f"Bridge running. {len(templates)} fingerprint(s) loaded. "
          f"Sending to {cfg['apiBaseUrl']} (cooldown {cooldown}s/person). Press Ctrl+C to stop.")

    last_sent = {}  # device_user_id -> epoch seconds
    try:
        while True:
            capture = zk.AcquireFingerprint()
            if not capture:
                time.sleep(0.1)
                continue
            tmp, _img = capture
            fid, score = zk.DBIdentify(tmp)
            if not fid:
                print(f"  {datetime.now():%H:%M:%S}  unrecognised finger (not enrolled)")
                continue

            sid = str(fid)
            now = time.time()
            if now - last_sent.get(sid, 0) < cooldown:
                continue  # debounce repeat presses within the cooldown window
            when = wall_clock_now()
            try:
                res = post_punch(cfg, sid, when)
                last_sent[sid] = now
                note = ""
                if res.get("unmatched"):
                    note = f"  (! ID {sid} not linked to a staff member in Attendance -> Staff)"
                print(f"  {datetime.now():%H:%M:%S}  punch sent: ID {sid} (score {score}) inserted={res.get('inserted')}{note}")
            except Exception as e:  # noqa: BLE001
                print(f"  {datetime.now():%H:%M:%S}  ! failed to send punch for ID {sid}: {e}")
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        zk.Terminate()


def main():
    parser = argparse.ArgumentParser(description="ZK6500 USB fingerprint bridge for the attendance system.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("test", help="check the sensor and API connection")
    p_en = sub.add_parser("enroll", help="enroll a staff fingerprint")
    p_en.add_argument("--id", required=True, help="Device User ID (must match Attendance -> Staff)")
    p_en.add_argument("--force", action="store_true", help="overwrite an existing enrollment")
    sub.add_parser("list", help="list enrolled IDs")
    p_del = sub.add_parser("delete", help="remove an enrollment")
    p_del.add_argument("--id", required=True)
    sub.add_parser("run", help="start capturing attendance")
    args = parser.parse_args()

    cfg = load_config()
    if args.cmd == "test":
        cmd_test(cfg)
    elif args.cmd == "enroll":
        cmd_enroll(cfg, args)
    elif args.cmd == "list":
        cmd_list(cfg)
    elif args.cmd == "delete":
        cmd_delete(cfg, args)
    elif args.cmd == "run":
        cmd_run(cfg)


if __name__ == "__main__":
    main()
