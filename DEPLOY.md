# Deploying to Hostinger

This app is a single Node.js process that serves both the API (`/api/*`) and
the built React app (everything else) from the same origin. Your Hostinger
plan must support **Node.js hosting** (Premium / Business / Cloud / VPS — any
plan with a "Node.js Setup" or shell access).

## 1. One-time checks before deploying 

- **MySQL credentials in `.env`** are already pointed at your Hostinger DB
  (`srv1836.hstgr.io`, `u957836715_quotation_gen`). The DB will be reachable
  from the Hostinger Node.js process too.
- The `client/public/Company_Logos/` folder contains the four bundled brand
  logos used on quotations/invoices. They get baked into the React build, so
  they ship with the deploy automatically.
- The `uploads/` folder holds admin-uploaded sidebar/header logos. It must
  exist and be writable at runtime; the `.gitkeep` file keeps the empty
  folder committed.

## ⚠️ Data persistence — READ THIS (how we avoid losing files)

User-uploaded files (signed delivery-note scans, admin logos) are **not** in
Git. If they were stored inside the deployed app folder, every redeploy that
rebuilds from the repo would erase them — which is how a batch of signed
documents was lost once.

**This is now handled automatically.** `config/paths.js` resolves the uploads
root to a deploy-safe location:

1. `UPLOADS_DIR` env var, if set (explicit override); else
2. in production, `<home>/quotation_gen_data/uploads`
   (e.g. `/home/u957836715/quotation_gen_data/uploads`) — **outside** the
   deployed app folder, so a redeploy can never touch it; else
3. in local dev, `./uploads`.

You do **not** have to set anything for this to work in production. On startup
the server logs the active location:

```
📁 Uploads stored at: /home/u957836715/quotation_gen_data/uploads
```

Confirm that path is **outside** your domain's `public_html` / app directory.
If you ever want a custom location, set `UPLOADS_DIR` to an absolute path that
lives outside the deploy folder.

### Backups — the only real guarantee against *any* data loss

Code keeps files out of harm's way, but the database (all quotations,
invoices, delivery notes, clients) and the uploaded files still need backups
to survive disk failure, accidental deletion, or a bad migration:

- **Database:** enable Hostinger's automatic backups for the MySQL database,
  **and/or** schedule a daily dump via cron:
  `mysqldump -h <host> -u <user> -p<pass> <db> | gzip > ~/backups/db-$(date +\%F).sql.gz`
- **Files:** back up the persistent uploads dir on the same schedule:
  `tar czf ~/backups/uploads-$(date +\%F).tar.gz -C ~/quotation_gen_data uploads`
- Keep at least 7–14 daily copies, and periodically download one off-server.

## 2. Push code to Hostinger

You have two common options:

### Option A — Git deploy (recommended)
1. Push this repo to GitHub/GitLab.
2. In hPanel → **Websites** → your domain → **Git** → connect the repo and
   the branch (e.g. `main`).
3. Set the deploy directory (Hostinger calls it the "Repository path").

### Option B — File Manager / FTP
Upload everything **except** `node_modules`, `client/node_modules`,
`client/build`, and `.env` to your Hostinger directory (e.g.
`/home/u957836715/domains/your-domain.com/public_html` or a sub-path).

## 3. Configure the Node.js app in hPanel

hPanel → **Advanced** → **Node.js**:
- **Application root**: the folder you uploaded into (where `server.js` lives).
- **Application URL**: your domain or sub-domain.
- **Application startup file**: `server.js`
- **Node.js version**: 18 or 20 (matches `engines` in `package.json`).
- **Environment variables** — add these in the hPanel UI (do not commit them):
  - `NODE_ENV=production`
  - `PORT` — leave blank if Hostinger assigns one automatically
  - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (copy from your local `.env`)
  - `SESSION_SECRET` — paste a fresh random string (`openssl rand -hex 64`)
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — only used the first time you run migrate
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — only if you use Google login

Click **Save**.

## 4. Install dependencies and build the client

In hPanel → Node.js → **Run npm install** (or open the terminal and run it):

```bash
cd <application-root>
npm install        # also triggers `postinstall` -> `npm run build`
```

The `postinstall` hook checks `NODE_ENV` and runs `npm run build` only when
`NODE_ENV=production`, so:
- on Hostinger the React app is built automatically;
- on your local laptop a normal `npm install` does **not** waste time
  rebuilding the client.

If for any reason the build was skipped, run it manually:
```bash
npm run build
```

This produces `client/build/` which Express serves as static files.

## 5. Run the database migration (once)

The schema lives in `database/schema.sql` and the idempotent migration in
`database/migrate.js`. Run it once on Hostinger:

```bash
npm run migrate
```

It will:
- create any missing columns,
- backfill `created_by` on existing quotations/invoices,
- promote the account in `ADMIN_EMAIL` to admin (or create it with
  `ADMIN_PASSWORD` if it doesn't exist).

Safe to re-run any time.

## 6. Start (or restart) the app

In hPanel → Node.js click **Restart application**. The startup file
`server.js` runs `node server.js`. Logs appear under the same page.

You should see:
```
🚀 Server is running on port <PORT> (production)
📱 API available at http://localhost:<PORT>/api
```

Open your domain → the login page loads → sign in with the admin credentials
from step 3.

## 7. Hook up your domain to HTTPS

Hostinger issues a free Let's Encrypt certificate per domain. Make sure SSL
is enabled (hPanel → SSL). Session cookies are configured with
`secure: true` in production, so HTTPS is **required**, otherwise sign-in
will appear to succeed but the session won't persist.

## 8. (Optional) Google OAuth in production

If `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set:
- In **Google Cloud Console → Credentials → OAuth 2.0 Client IDs**, add
  these as Authorised redirect URIs:
  - `https://your-domain.com/api/auth/google/callback`
- That's it; the app uses the same route in dev and prod.

## What's NOT stored on Hostinger

- **PDFs** — generated client-side via `html2canvas`+`jspdf` and downloaded
  to the user. Nothing is stored on the server.
- **Bundled logos** in `client/public/Company_Logos/` — part of the React
  build, not the database.

## Routine maintenance

- **Add new staff**: log in as admin → User Management → Add User.
- **Add new company**: drop its logo into `client/public/Company_Logos/`,
  redeploy, then either INSERT into `companies` or add a UI for it.
- **Check storage usage**: admin sidebar → Storage Usage. Database and
  uploads folder sizes are reported live.
- **Rotate the admin password**: log in as admin → User Management → Edit
  your row → New Password.

## Updating after a code change

```bash
git pull            # or re-upload changed files
npm install         # installs new deps and rebuilds the client
npm run migrate     # if you added a DB column
# then click "Restart application" in hPanel
```

## Troubleshooting

- **Page loads but API calls return 404** → the React build wasn't created.
  Run `npm run build` manually. Check that `client/build/index.html` exists.
- **Login succeeds but immediately bounces to /login** → HTTPS is off, or
  `secure` cookies are being blocked. Enable SSL on the domain.
- **`ER_ACCESS_DENIED_ERROR`** → DB credentials in env vars don't match
  hPanel → Databases → MySQL user.
- **Logos work locally but 404 on production** → make sure `client/build/`
  was regenerated after you added logos to `client/public/Company_Logos/`.
- **Express 5 "Missing parameter name" error** → you're running an old
  cached copy of `server.js`; clear Hostinger's build cache and restart.
