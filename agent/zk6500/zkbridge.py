#!/usr/bin/env python3
"""
ZK6500 USB fingerprint bridge
-----------------------------
The ZK6500 is a bare USB fingerprint SENSOR: no screen, no clock, no onboard
user storage. Enrollment and matching therefore happen HERE, on the PC, using
ZKTeco's ZKFinger SDK (via the `pyzkfp` wrapper).

Recommended way to run everything (no command line needed day to day):

    python zkbridge.py serve

...then open  http://localhost:5580  in a browser ON THIS PC. That page lets you
enroll staff with a click AND captures attendance at the same time.

Other commands still exist for quick use / testing:
    python zkbridge.py test                 # check sensor + API
    python zkbridge.py enroll --id 101      # enroll one staff from the terminal
    python zkbridge.py list                 # show enrolled IDs
    python zkbridge.py delete --id 101      # remove one enrollment
    python zkbridge.py run                  # headless capture only (no web page)

Fingerprint templates never leave this PC as images; only a numeric ID + the
office wall-clock time are sent to the server.
"""

import argparse
import base64
import json
import os
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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
NEED_SCANS = 3  # presses per enrollment


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


def db_load_all(zk, templates):
    """Push all stored templates into the SDK's in-memory match DB."""
    for sid, b64 in templates.items():
        try:
            zk.DBAdd(int(sid), base64.b64decode(b64))
        except Exception as e:  # noqa: BLE001
            print(f"  ! could not load template for ID {sid}: {e}")


def db_readd(zk, sid, template_bytes):
    """(Re)add one id to the live match DB, replacing any previous copy."""
    try:
        zk.DBDel(int(sid))
    except Exception:  # noqa: BLE001
        pass  # older pyzkfp may lack DBDel; DBIdentify still returns the id
    zk.DBAdd(int(sid), template_bytes)


def acquire_blocking(zk, prompt):
    """Wait for one good finger press; returns the raw template bytes."""
    print(prompt)
    while True:
        capture = zk.AcquireFingerprint()
        if capture:
            return capture[0]
        time.sleep(0.1)


def wait_finger_lifted(zk, max_seconds=5.0):
    """Block until the finger is removed (so the next press is a fresh sample)."""
    clear = 0
    start = time.time()
    while clear < 3 and (time.time() - start) < max_seconds:
        if zk.AcquireFingerprint():
            clear = 0
        else:
            clear += 1
        time.sleep(0.05)


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
def api_url(cfg, path):
    return cfg["apiBaseUrl"].rstrip("/") + path


def post_punch(cfg, device_user_id, when):
    r = requests.post(
        api_url(cfg, "/api/attendance/agent/punch"),
        json={"device_user_id": str(device_user_id), "timestamp": when},
        headers={"X-Api-Key": cfg["apiKey"]}, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_server_staff(cfg):
    """Staff the admin has given a Device User ID on the website."""
    r = requests.get(api_url(cfg, "/api/attendance/agent/enrollments"),
                     headers={"X-Api-Key": cfg["apiKey"]}, timeout=15)
    r.raise_for_status()
    return r.json()  # [{device_user_id, user_id, name}, ...]


def wall_clock_now():
    # Naive office-local time; the server stores it verbatim (no timezone drift).
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# --------------------------------------------------------------------------- #
# Shared worker (owns the sensor) — used by `serve`
# --------------------------------------------------------------------------- #
class Bridge:
    """Single thread owns the sensor: normally identifies punches; on request,
    switches to enrolling one staff member, then resumes."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.cooldown = int(cfg.get("cooldownSeconds", 30))
        self.templates = load_templates()
        self.lock = threading.Lock()
        self.enroll_req = None          # id to enroll, set by the web thread
        self.enroll_status = {"phase": "idle", "id": None, "captured": 0,
                              "need": NEED_SCANS, "message": ""}
        self.last_sent = {}
        self.last_event = ""            # last punch line for the UI
        self.zk = None
        self.stop = False

    # ---- called from the web thread ----
    def request_enroll(self, sid):
        with self.lock:
            if self.enroll_status["phase"] in ("pending", "capturing"):
                return False
            self.enroll_req = str(sid)
            self.enroll_status = {"phase": "pending", "id": str(sid),
                                  "captured": 0, "need": NEED_SCANS,
                                  "message": "Get ready to scan..."}
        return True

    def delete_enroll(self, sid):
        with self.lock:
            if str(sid) in self.templates:
                del self.templates[str(sid)]
                save_templates(self.templates)
                try:
                    self.zk.DBDel(int(sid))
                except Exception:  # noqa: BLE001
                    pass
                return True
        return False

    def snapshot(self):
        with self.lock:
            return {"enroll": dict(self.enroll_status),
                    "enrolled_ids": sorted(self.templates.keys()),
                    "last_event": self.last_event}

    def _set_status(self, **kw):
        with self.lock:
            self.enroll_status.update(kw)

    # ---- the worker loop ----
    def worker(self):
        self.zk = open_device()
        db_load_all(self.zk, self.templates)
        print(f"Sensor ready. {len(self.templates)} fingerprint(s) loaded.")
        while not self.stop:
            with self.lock:
                pending = self.enroll_req
            if pending is not None:
                self._do_enroll(pending)
                with self.lock:
                    self.enroll_req = None
                continue
            capture = self.zk.AcquireFingerprint()
            if capture:
                self._handle_punch(capture[0])
            else:
                time.sleep(0.05)

    def _handle_punch(self, tmp):
        fid, score = self.zk.DBIdentify(tmp)
        if not fid:
            self.last_event = f"{datetime.now():%H:%M:%S}  unrecognised finger (not enrolled)"
            print("  " + self.last_event)
            return
        sid = str(fid)
        now = time.time()
        if now - self.last_sent.get(sid, 0) < self.cooldown:
            return
        when = wall_clock_now()
        try:
            res = post_punch(self.cfg, sid, when)
            self.last_sent[sid] = now
            extra = "  (! not linked to a staff member on the website)" if res.get("unmatched") else ""
            self.last_event = f"{datetime.now():%H:%M:%S}  punch: ID {sid} inserted={res.get('inserted')}{extra}"
            print("  " + self.last_event)
        except Exception as e:  # noqa: BLE001
            self.last_event = f"{datetime.now():%H:%M:%S}  ! failed to send ID {sid}: {e}"
            print("  " + self.last_event)

    def _do_enroll(self, sid):
        self._set_status(phase="capturing", id=sid, captured=0,
                         message="Press finger (1/%d)..." % NEED_SCANS)
        samples = []
        try:
            while len(samples) < NEED_SCANS:
                cap = self.zk.AcquireFingerprint()
                if cap:
                    samples.append(cap[0])
                    self._set_status(captured=len(samples),
                                     message=(f"Captured {len(samples)}/{NEED_SCANS}. "
                                              + ("Lift and press again." if len(samples) < NEED_SCANS else "Finishing...")))
                    print(f"  enroll {sid}: captured {len(samples)}/{NEED_SCANS}")
                    if len(samples) < NEED_SCANS:
                        wait_finger_lifted(self.zk)
                else:
                    time.sleep(0.05)
            reg_temp, _len = self.zk.DBMerge(*samples)
            tb = bytes(reg_temp)
            with self.lock:
                self.templates[sid] = base64.b64encode(tb).decode("ascii")
                save_templates(self.templates)
            db_readd(self.zk, sid, tb)
            self._set_status(phase="done", message=f"Enrolled successfully (ID {sid}).")
            print(f"  enroll {sid}: done")
        except Exception as e:  # noqa: BLE001
            self._set_status(phase="error", message=f"Enrollment failed: {e}")
            print(f"  enroll {sid}: ERROR {e}")


# --------------------------------------------------------------------------- #
# Local web page (served by `serve`)
# --------------------------------------------------------------------------- #
PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Attendance Enrollment</title>
<style>
 body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#f6f7f9;color:#1f2937}
 .wrap{max-width:760px;margin:0 auto;padding:24px}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#6b7280;font-size:14px;margin-bottom:20px}
 .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
 table{width:100%;border-collapse:collapse} th,td{padding:12px 14px;text-align:left;font-size:14px}
 th{background:#f9fafb;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
 tr+tr td{border-top:1px solid #f1f2f4}
 .pill{font-size:12px;padding:3px 9px;border-radius:999px}
 .ok{background:#dcfce7;color:#166534} .no{background:#f3f4f6;color:#6b7280}
 button{font:inherit;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}
 .b1{background:#4f46e5;color:#fff} .b2{background:#eef2ff;color:#4f46e5;margin-left:6px}
 .del{background:transparent;color:#9ca3af} .del:hover{color:#ef4444}
 .banner{margin:14px 0;padding:12px 14px;border-radius:10px;font-size:14px;display:none}
 .binfo{background:#eff6ff;color:#1e40af} .bok{background:#dcfce7;color:#166534} .berr{background:#fef2f2;color:#b91c1c}
 .evt{margin-top:16px;color:#6b7280;font-size:13px}
 .foot{margin-top:14px;color:#9ca3af;font-size:12px}
</style></head><body><div class="wrap">
 <h1>Staff Fingerprint Enrollment</h1>
 <div class="sub">Runs on this PC with the ZK6500. Attendance is being captured live while this page is open.</div>
 <div id="banner" class="banner"></div>
 <div class="card"><table><thead><tr><th>Staff</th><th>Device ID</th><th>Fingerprint</th><th></th></tr></thead>
 <tbody id="rows"><tr><td colspan="4" style="color:#9ca3af">Loading...</td></tr></tbody></table></div>
 <div id="evt" class="evt"></div>
 <div class="foot">To add or rename staff, use the website: <b>Attendance &rarr; Staff</b>. This page shows everyone who has a Device ID there.</div>
</div><script>
let busy=false;
async function j(u,o){const r=await fetch(u,o);return r.json();}
function banner(cls,msg){const b=document.getElementById('banner');b.className='banner '+cls;b.textContent=msg;b.style.display=msg?'block':'none';}
async function refresh(){
 try{const d=await j('/api/staff');
  const rows=document.getElementById('rows');
  if(!d.staff.length){rows.innerHTML='<tr><td colspan=4 style="color:#9ca3af">No staff have a Device ID yet. Set one on the website: Attendance &rarr; Staff.</td></tr>';}
  else rows.innerHTML=d.staff.map(s=>`<tr>
    <td><b>${s.name||'(unmapped)'}</b></td>
    <td>${s.device_user_id}</td>
    <td>${s.enrolled?'<span class="pill ok">Enrolled</span>':'<span class="pill no">Not enrolled</span>'}</td>
    <td style="text-align:right;white-space:nowrap">
      <button class="${s.enrolled?'b2':'b1'}" ${busy?'disabled':''} onclick="enroll('${s.device_user_id}')">${s.enrolled?'Re-enroll':'Enroll'}</button>
      ${s.enrolled?`<button class="del" ${busy?'disabled':''} onclick="del('${s.device_user_id}')">Remove</button>`:''}
    </td></tr>`).join('');
  document.getElementById('evt').textContent=d.last_event?('Last scan: '+d.last_event):'';
 }catch(e){banner('berr','Cannot reach the bridge. Is it still running?');}
}
async function enroll(id){busy=true;refresh();banner('binfo','Starting...');
 await j('/api/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
 poll();}
async function del(id){if(!confirm('Remove this fingerprint?'))return;
 await j('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});refresh();}
async function poll(){const s=(await j('/api/enroll')).enroll;
 if(s.phase==='pending'||s.phase==='capturing'){banner('binfo',s.message||'Scanning...');setTimeout(poll,400);}
 else if(s.phase==='done'){banner('bok',s.message);busy=false;refresh();setTimeout(()=>banner('',''),4000);}
 else if(s.phase==='error'){banner('berr',s.message);busy=false;refresh();}
 else{busy=false;refresh();}}
refresh();setInterval(()=>{if(!busy)refresh();},4000);
</script></body></html>"""


def make_handler(bridge, cfg):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # keep the console quiet
            pass

        def _send(self, code, body, ctype="application/json"):
            data = body.encode("utf-8") if isinstance(body, str) else body
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _json_body(self):
            n = int(self.headers.get("Content-Length", 0))
            if not n:
                return {}
            return json.loads(self.rfile.read(n).decode("utf-8"))

        def do_GET(self):
            if self.path == "/" or self.path.startswith("/index"):
                return self._send(200, PAGE, "text/html; charset=utf-8")
            if self.path == "/api/staff":
                snap = bridge.snapshot()
                enrolled = set(snap["enrolled_ids"])
                try:
                    server_staff = fetch_server_staff(cfg)
                except Exception as e:  # noqa: BLE001
                    return self._send(200, json.dumps({"staff": [], "error": str(e), "last_event": snap["last_event"]}))
                seen = set()
                staff = []
                for s in server_staff:
                    did = str(s.get("device_user_id"))
                    seen.add(did)
                    staff.append({"device_user_id": did, "name": s.get("name"),
                                  "enrolled": did in enrolled})
                # locally enrolled but not mapped on the website yet
                for did in enrolled:
                    if did not in seen:
                        staff.append({"device_user_id": did, "name": None, "enrolled": True})
                staff.sort(key=lambda x: (x["name"] is None, x["name"] or "", x["device_user_id"]))
                return self._send(200, json.dumps({"staff": staff, "last_event": snap["last_event"]}))
            if self.path == "/api/enroll":
                return self._send(200, json.dumps(bridge.snapshot()))
            return self._send(404, json.dumps({"error": "not found"}))

        def do_POST(self):
            try:
                body = self._json_body()
            except Exception:
                return self._send(400, json.dumps({"error": "bad json"}))
            if self.path == "/api/enroll":
                sid = str(body.get("id", "")).strip()
                if not sid:
                    return self._send(400, json.dumps({"error": "id required"}))
                ok = bridge.request_enroll(sid)
                return self._send(200, json.dumps({"ok": ok}))
            if self.path == "/api/delete":
                sid = str(body.get("id", "")).strip()
                bridge.delete_enroll(sid)
                return self._send(200, json.dumps({"ok": True}))
            return self._send(404, json.dumps({"error": "not found"}))

    return Handler


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #
def cmd_test(cfg):
    zk = open_device()
    print("OK: sensor detected.")
    zk.Terminate()
    try:
        r = requests.post(api_url(cfg, "/api/attendance/agent/punch"),
                          json={"punches": []}, headers={"X-Api-Key": cfg["apiKey"]}, timeout=15)
        print(f"OK: API reachable ({cfg['apiBaseUrl']})." if r.ok
              else f"! API responded {r.status_code}: {r.text[:200]}")
    except Exception as e:  # noqa: BLE001
        print(f"! Could not reach API: {e}")


def cmd_serve(cfg):
    bridge = Bridge(cfg)
    t = threading.Thread(target=bridge.worker, daemon=True)
    t.start()
    port = int(cfg.get("enrollPort", 5580))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(bridge, cfg))
    print("=" * 60)
    print(f"  Attendance bridge running.")
    print(f"  Open this on THIS PC:   http://localhost:{port}")
    print(f"  Enroll staff there; attendance is captured automatically.")
    print(f"  Keep this window open. Press Ctrl+C to stop.")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        bridge.stop = True


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
        for i in range(NEED_SCANS):
            samples.append(acquire_blocking(zk, f"  Press finger ({i + 1}/{NEED_SCANS}) ..."))
            print("   captured.")
            if i < NEED_SCANS - 1:
                wait_finger_lifted(zk)
        reg_temp, _len = zk.DBMerge(*samples)
        templates[sid] = base64.b64encode(bytes(reg_temp)).decode("ascii")
        save_templates(templates)
        print(f"Enrolled ID {sid}. ({len(templates)} fingerprint(s) stored.)")
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
        sys.exit("No fingerprints enrolled. Run 'python zkbridge.py serve' and enroll from the web page.")
    cooldown = int(cfg.get("cooldownSeconds", 30))
    zk = open_device()
    db_load_all(zk, templates)
    print(f"Bridge running (headless). {len(templates)} fingerprint(s) loaded. Ctrl+C to stop.")
    last_sent = {}
    try:
        while True:
            capture = zk.AcquireFingerprint()
            if not capture:
                time.sleep(0.1)
                continue
            fid, score = zk.DBIdentify(capture[0])
            if not fid:
                print(f"  {datetime.now():%H:%M:%S}  unrecognised finger")
                continue
            sid = str(fid)
            now = time.time()
            if now - last_sent.get(sid, 0) < cooldown:
                continue
            try:
                res = post_punch(cfg, sid, wall_clock_now())
                last_sent[sid] = now
                note = "  (! not linked on website)" if res.get("unmatched") else ""
                print(f"  {datetime.now():%H:%M:%S}  punch: ID {sid} inserted={res.get('inserted')}{note}")
            except Exception as e:  # noqa: BLE001
                print(f"  {datetime.now():%H:%M:%S}  ! send failed for ID {sid}: {e}")
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        zk.Terminate()


def main():
    parser = argparse.ArgumentParser(description="ZK6500 USB fingerprint bridge for the attendance system.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("serve", help="run capture + local enrollment web page (recommended)")
    sub.add_parser("test", help="check the sensor and API connection")
    p_en = sub.add_parser("enroll", help="enroll a staff fingerprint from the terminal")
    p_en.add_argument("--id", required=True, help="Device User ID (must match Attendance -> Staff)")
    p_en.add_argument("--force", action="store_true", help="overwrite an existing enrollment")
    sub.add_parser("list", help="list enrolled IDs")
    p_del = sub.add_parser("delete", help="remove an enrollment")
    p_del.add_argument("--id", required=True)
    sub.add_parser("run", help="headless capture only (no web page)")
    args = parser.parse_args()

    cfg = load_config()
    {"serve": lambda: cmd_serve(cfg),
     "test": lambda: cmd_test(cfg),
     "enroll": lambda: cmd_enroll(cfg, args),
     "list": lambda: cmd_list(cfg),
     "delete": lambda: cmd_delete(cfg, args),
     "run": lambda: cmd_run(cfg)}[args.cmd]()


if __name__ == "__main__":
    main()
