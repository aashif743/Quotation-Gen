const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { UPLOADS_ROOT, resolveUploadDiskPath } = require('../config/paths');

// Payment proof documents (bank slips, receipts, transfer screenshots) for
// client payments on invoices and payments made to vendors. Stored under
// <UPLOADS_ROOT>/payment-proofs/ — the same persistent, outside-the-deploy-dir
// location as signed delivery notes, so redeploys never touch them — and
// served by the static middleware at /uploads/payment-proofs/.
const PROOF_DIR = path.join(UPLOADS_ROOT, 'payment-proofs');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.pdf']);

function makeProofUpload(kind) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(PROOF_DIR)) fs.mkdirSync(PROOF_DIR, { recursive: true });
      cb(null, PROOF_DIR);
    },
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '').toLowerCase() || '.bin';
      const id = req.params.paymentId || req.params.id || 'x';
      cb(null, `proof-${kind}-${id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });
  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '') || '').toLowerCase();
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || ALLOWED_EXT.has(ext)) {
        return cb(null, true);
      }
      cb(new Error('Only image or PDF files are allowed'));
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  });
}

// Wrap multer so a rejected file (wrong type / too large) returns a clean 400
// instead of an unhandled error.
function acceptProofFile(upload) {
  return (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        error: tooLarge ? 'File is too large (max 10 MB).' : (err.message || 'Upload failed'),
      });
    });
  };
}

const publicProofUrl = (filename) => `/uploads/payment-proofs/${filename}`;

// Best-effort removal of a just-uploaded file when the request is rejected
// after multer already wrote it (so no orphan files are left behind).
function discardUploaded(req) {
  if (req.file && req.file.path) {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
  }
}

// Delete a stored proof file by its public URL. Only called on an explicit
// admin "remove" or "replace" — never as a side effect of deleting a payment.
function deleteStoredProof(publicUrl) {
  const p = resolveUploadDiskPath(publicUrl);
  if (!p) return;
  try { fs.unlinkSync(p); } catch { /* file may already be gone */ }
}

// Original file name, trimmed to fit the column.
const originalName = (file) => String((file && file.originalname) || '').slice(0, 255) || null;

module.exports = {
  makeProofUpload, acceptProofFile, publicProofUrl, discardUploaded, deleteStoredProof, originalName,
};
