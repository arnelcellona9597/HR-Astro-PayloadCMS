# Deploying to z.com Web Hosting (cPanel, "Personal" plan)

The app runs as **one Node.js 22 process** under cPanel's *Setup Node.js App* (CloudLinux + Passenger).
Nothing is built on the server: you build a release on your computer, upload it, and point cPanel at it.

```
~/hr-app/     ← the release (code + node_modules). Replaced on every update.
~/hr-data/    ← hr.db (SQLite database), media/ (uploads), imports/, backups/. NEVER replaced.
```

## 1. Check the server once

Upload `scripts/check-host.sh` (it's also inside every release) and run it over SSH:

```bash
bash check-host.sh mail.yourdomain.com
```

| Check | Needed | If not |
|---|---|---|
| Node 22 | `v22.12.0` or newer | Choose Node 22 in *Setup Node.js App*, or ask z.com support |
| glibc | ≥ 2.18 (server has 2.28 ✓) | — |
| Filesystem | `ext4`/`xfs` | If it prints `nfs`, add `HR_SQLITE_WAL=false` to `.env` |
| Memory | ~350–500 MB for the app | cPanel → *Resource Usage*; upgrade the plan if it keeps restarting |
| SMTP 465/587 | open | **Needed for sign-in codes, notifications and payslips.** Without it, sign-in codes are written to `~/hr-app/stderr.log` and no emails go out |

## 2. Build a release (on your computer)

Requirements: Node 22, pnpm (`corepack enable`), Linux or WSL (the release contains Linux binaries).

```bash
pnpm install
pnpm test
pnpm release
```

This produces `release/hr-app-<date>.tar.gz` (~150 MB).

## 3. Upload and unpack

```bash
scp release/hr-app-*.tar.gz USER@yourdomain.com:~/
ssh USER@yourdomain.com
mkdir -p ~/hr-data
tar -xzf ~/hr-app-*.tar.gz -C ~/          # creates ~/hr-app
cp ~/hr-app/.env.example ~/hr-app/.env
nano ~/hr-app/.env
```

Fill in `.env`:

```bash
DATA_DIR=/home/USER/hr-data
PAYLOAD_SECRET=<run: openssl rand -hex 32>
SERVER_URL=https://hr.yourdomain.com
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=465
SMTP_USER=hr@yourdomain.com
SMTP_PASS=...
SMTP_FROM_ADDRESS=hr@yourdomain.com
```

Keep `PAYLOAD_SECRET` safe and never change it: changing it signs everyone out.

## 4. Create the Node.js app in cPanel

cPanel → **Setup Node.js App** → **Create Application**

| Field | Value |
|---|---|
| Node.js version | **22.x** |
| Application mode | **Production** |
| Application root | `hr-app` |
| Application URL | your domain or subdomain, e.g. `hr.yourdomain.com` |
| Application startup file | `passenger.cjs` |
| Environment variables | `NODE_ENV=production`, `NODE_OPTIONS=--max-old-space-size=384` |

Click **Create**, then **Restart**. **Do not** click "Run NPM Install": the release already includes `node_modules`.
Enable HTTPS for the domain: cPanel → *SSL/TLS Status* → *Run AutoSSL*.

The first start creates the database and runs the migrations automatically. Open the site and go to
**`/register` right away**: the first account (after confirming its email with the emailed code) becomes the
**System Admin**. Later sign-ups confirm their email, then wait for approval on **HR Accounts**.

Then open **Email Settings** in the app: send a test email, set the **maximum emails per hour** to your host's
limit (ask z.com; 100 is a safe default), and copy the cron line shown there (next section).

## 5. Cron jobs

cPanel → **Cron Jobs**:

| When | Command | Why |
|---|---|---|
| Every 5 minutes (`*/5 * * * *`) | `curl -s "https://hr.yourdomain.com/internal/queue?key=<key from Email Settings>" > /dev/null` | Sends queued emails (payslips, announcements) even while the app is idle |
| Daily at 02:00 | see below | Backups |

### Nightly backups

cPanel → **Cron Jobs** → once per day (e.g. 02:00):

```bash
/opt/alt/alt-nodejs22/root/usr/bin/node /home/USER/hr-app/scripts/backup.mjs >> /home/USER/hr-data/backup.log 2>&1
```

Each run writes `~/hr-data/backups/hr-<date>.db` (a consistent, integrity-checked copy, safe while the app
runs) and `media-<date>.tar.gz`. It keeps 14 days (`BACKUP_KEEP` in `.env`).
**Download the backups regularly**: a backup that only lives on the same server doesn't protect you.

**Restore**
1. Stop the app in *Setup Node.js App*.
2. Delete `~/hr-data/hr.db-wal` and `~/hr-data/hr.db-shm`, then copy the chosen `hr-<date>.db` to `~/hr-data/hr.db`.
3. Unpack the matching media archive: `tar -xzf media-<date>.tar.gz -C ~/hr-data`.
4. Start the app.

## 6. Email and sign-in codes

- Every sign-in needs a 6-digit code emailed to the user; new accounts confirm their email the same way.
- Sessions end **12 hours after sign-in**; users then sign in again (with a new code).
- **If email stops working**, nobody is locked out: the code is written to the private server log.
  A System Admin can read it in cPanel → File Manager → `hr-app/stderr.log` (look for `[2FA]`), and every
  signed-in user sees a red "Email problem" banner until it's fixed. Fix SMTP in `.env`, then restart.
- The Payload admin panel (`/admin`) uses the same sign-in: its own login page redirects to `/login`.

## 7. Updating to a new version

```bash
# on your computer
pnpm release && scp release/hr-app-*.tar.gz USER@yourdomain.com:~/
# on the server
/opt/alt/alt-nodejs22/root/usr/bin/node ~/hr-app/scripts/backup.mjs   # always back up first
mkdir -p ~/hr-app-new && tar -xzf ~/hr-app-<date>.tar.gz -C ~/hr-app-new --strip-components=1
cp ~/hr-app/.env ~/hr-app-new/.env
mv ~/hr-app ~/hr-app-old && mv ~/hr-app-new ~/hr-app
mkdir -p ~/hr-app/tmp && touch ~/hr-app/tmp/restart.txt      # or press Restart in cPanel
```

Database changes (migrations) run automatically on start. If something is wrong, move `~/hr-app-old` back,
restore the backup you just made, and restart. Delete `~/hr-app-old` once you're happy.

## Troubleshooting

- **Logs:** `~/hr-app/stderr.log` (Passenger) and the *Setup Node.js App* page.
- **First page after a quiet period is slow (5–15 s):** Passenger stops idle apps to save memory, so the first request after idle starts it again. This is normal on shared plans.
- **App keeps restarting / 503:** usually the memory limit. Check cPanel → *Resource Usage*. Lower `NODE_OPTIONS=--max-old-space-size` to 320, or upgrade the plan.
- **"Too many attempts":** sign-in, registration and password reset are rate-limited per IP (20 tries per 15 min), and an account locks for 15 minutes after 5 wrong passwords. A System Admin can unlock it on *HR Accounts*.
- **Emails are slow to arrive:** check *Messages* for queued/failed rows and *Email Settings* for the hourly limit and SMTP status. Make sure the queue cron job runs.
- **Uploads fail above a few MB:** Apache/ModSecurity body limits. The app accepts up to 10 MB; ask support to raise `LimitRequestBody` if needed.
