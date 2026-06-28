const path = require('path');
const fs = require('fs');
const os = require('os');

const isProd = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Where runtime user uploads live (signed delivery-note scans, admin-uploaded
// company logos). These files are NOT in Git, so if they sit inside the app
// directory they get wiped every time the host redeploys/rebuilds from the
// repo — which is exactly how we lost files once.
//
// To make data loss impossible without anyone having to remember a config
// step, the root is resolved with a DEPLOY-SAFE default:
//
//   1) UPLOADS_DIR env var ............ explicit override (highest priority)
//   2) production default ............. <home>/quotation_gen_data/uploads
//      — lives in the OS home dir, OUTSIDE the deployed app folder, so a
//        redeploy can never touch it. No env var required.
//   3) development default ............ ./uploads next to the app (convenient
//      for local work; nothing deploys over it locally).
// ---------------------------------------------------------------------------
function resolveRoot() {
  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim()) {
    return path.resolve(process.env.UPLOADS_DIR.trim());
  }
  if (isProd) {
    try {
      const home = os.homedir();
      if (home) return path.join(home, 'quotation_gen_data', 'uploads');
    } catch {
      /* fall through to the in-app default */
    }
  }
  return path.join(__dirname, '..', 'uploads');
}

const UPLOADS_ROOT = resolveRoot();

// The signed/ subfolder is referenced directly by the delivery-note route, so
// guarantee both it and the root exist on startup (e.g. a fresh persistent
// volume) before any upload or static read happens.
for (const dir of [UPLOADS_ROOT, path.join(UPLOADS_ROOT, 'signed')]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* best effort — multer/static will surface a clearer error if unwritable */
  }
}

// Safety net: if any files were left behind in the legacy in-app ./uploads
// (e.g. an older build, or a deploy that didn't fully clear it), copy them
// into the persistent root WITHOUT overwriting anything already there. This
// auto-rescues stragglers so a transition never silently drops a file.
function migrateLegacyUploads() {
  const legacy = path.join(__dirname, '..', 'uploads');
  if (path.resolve(legacy) === path.resolve(UPLOADS_ROOT)) return; // same place
  if (!fs.existsSync(legacy)) return;
  try {
    // force:false => never clobber an existing persistent file.
    fs.cpSync(legacy, UPLOADS_ROOT, { recursive: true, force: false, errorOnExist: false });
  } catch {
    /* best effort — don't block startup on a copy hiccup */
  }
}
migrateLegacyUploads();

// Map a public upload URL ("/uploads/signed/foo.jpg") to its on-disk path under
// UPLOADS_ROOT, wherever that lives. Used when deleting/replacing a stored file
// so the lookup follows UPLOADS_ROOT instead of assuming ./uploads.
function resolveUploadDiskPath(publicUrl) {
  if (!publicUrl) return null;
  const rel = String(publicUrl).replace(/^\/?uploads\/?/, '');
  return path.join(UPLOADS_ROOT, rel);
}

module.exports = { UPLOADS_ROOT, resolveUploadDiskPath };
