const path = require('path');
const fs = require('fs');

// Where runtime user uploads live (signed delivery-note scans, admin-uploaded
// company logos). These files are NOT in Git, so if they sit inside the app
// directory they get wiped every time the host redeploys/rebuilds from the
// repo. In production, set UPLOADS_DIR to a PERSISTENT absolute path OUTSIDE
// the deployed app folder (e.g. /home/<user>/persistent/uploads) so uploads
// survive deploys. Falls back to ./uploads for local development.
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'uploads');

// Make sure the root exists at startup so static serving and multer have a
// directory to work with even on a brand-new persistent volume.
try {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
} catch {
  /* best effort — multer/static will surface a clearer error if it can't write */
}

// Map a public upload URL ("/uploads/signed/foo.jpg") to its on-disk path under
// UPLOADS_ROOT, wherever that lives. Used when deleting/replacing a stored file
// so the lookup follows UPLOADS_ROOT instead of assuming ./uploads.
function resolveUploadDiskPath(publicUrl) {
  if (!publicUrl) return null;
  const rel = String(publicUrl).replace(/^\/?uploads\/?/, '');
  return path.join(UPLOADS_ROOT, rel);
}

module.exports = { UPLOADS_ROOT, resolveUploadDiskPath };
