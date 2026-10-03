# HR Management System

A human resource management system built with **Astro** (HR staff interface), **Payload CMS** (data model,
authentication, access control and admin panel) and **SQLite**. It is designed to run on low-cost shared cPanel
hosting (z.com Web Hosting "Personal") as a single Node.js process.

## Features

| Area | What it does |
|---|---|
| **Branding & theme** | Company name, tagline and logo; a 6-color palette with presets, live preview and contrast warnings; default light/dark/system mode, with a per-user toggle that is remembered. |
| **Employee profiles** | Every field from the HR masterlist, including SSS/Pag-IBIG/TIN/PhilHealth (validated and stored in one canonical format with leading zeros kept), COS/Contractual/Regular classification, employment status and a profile picture. Age and length of service are always calculated from today (Asia/Manila). |
| **Advanced search** | Free text across names, IDs, email, phone and government numbers, plus filters for status, classification, branch, gender, region, civil status, blood type, education, position, date-hired range, age range and years of service. Sortable and paginated. "Export these results" downloads exactly what's on screen. |
| **Statistics dashboard** | Active/Resigned/Retired/Terminated counts, male vs female split (overall and per status), classification by status, positions/designations, hires vs separations per year. Filter by branch and classification. Every chart has a table view. |
| **Onboarding tracker** | Applicants with all document requirements (PDS, Specimen Sign, …, OR/CR). Edit requirement status inline. FDS Requirements Status is calculated automatically. Shows recent hires and this year's separations. "Convert to employee" pre-fills an employee record. |
| **Wellness leave** | Default 5 days per year, changeable by HR, with per-year overrides. Counts Mon–Fri working days minus an HR-maintained holiday list. Blocks filings that exceed the allowance or overlap another filing, splits Dec–Jan leave across years, and shows remaining days per filing. Includes monthly and per-employee charts. |
| **Company branches** | Branch cards with address and COS/Contractual/Regular headcount (active only or all statuses), a stacked chart, and an employee list per branch. |
| **Annual requirements** | Income Tax Return, Sworn Declaration, Personal Data Sheet and IPCR (with rating period and CSC adjectival rating). Per-year compliance %, a "not yet complied" list, and one-click generation of rows for all active employees. |
| **Import / export** | Export ALL data (one workbook, one sheet per module) or any single module. Import templates with dropdowns. Imports are validated cell by cell and rehearsed through the real business rules, show a change preview, and are saved **all-or-nothing**. |
| **Security** | Registration requires Super Admin approval (the first account becomes Super Admin). Roles: Super Admin, HR Admin, HR Staff. Lockout after 5 failed logins, per-IP rate limits, httpOnly session cookies, CSRF protection, server-side session revocation on logout, and an audit log of every change (before → after). Uploaded files are only served to signed-in staff. |

## Project layout

```
apps/cms/          Payload 3 + Next.js: collections, hooks, access rules, migrations, admin panel (/admin), REST (/api)
  src/collections/   Employees, Branches, Applications, WellnessLeaves, compliance (ITR/Sworn/PDS/IPCR), Users, …
  src/server/        stats (SQL aggregates), leave rules, Excel import/export, staged imports
apps/web/          Astro 7 (server-rendered): every HR screen; talks to Payload's Local API in-process
packages/shared/   enums, date-only helpers (Asia/Manila), working days, PH ID validators, module/Excel column definitions
server.mjs         production entry: /admin, /api, /_next → Next.js; everything else → Astro
scripts/           backup.mjs, package-release.mjs, check-host.sh, e2e-server.mjs, shot.mjs (dev screenshots)
```

`packages/shared/src/modules.ts` is the single definition of every form field and Excel column. Forms, exports,
templates and imports all use it, so they can't drift apart.

## Development

Requirements: Node 22.12+, pnpm 10/11.

```bash
pnpm install
cp .env.example .env              # DATA_DIR can stay empty in development (uses ./data)
pnpm --filter @hr/web dev         # first run: creates the database (answer "yes" if asked about schema changes)
pnpm seed                         # optional: 140 sample employees, leave, onboarding and requirements
pnpm dev                          # Astro on http://localhost:4321 (+ Payload admin proxied from :3001)
```

Open http://localhost:4321/register to create the first (Super Admin) account.

**Changing the data model:** edit a collection in `apps/cms/src/collections`, then create a migration
(`pnpm migrate:create <name>`) and commit it. Production applies migrations automatically on start.
Add new form/Excel fields to `packages/shared/src/modules.ts` as well.

## Tests

```bash
pnpm test         # unit tests (dates, working days, ID formats, colors) + Payload integration tests
pnpm build && pnpm test:e2e     # browser tests against the production build on a throwaway database
```

The integration tests cover, among other things:
- registration can't grant itself a role, and pending users can't sign in;
- leave allowance, overlap and holiday rules;
- an export re-imports with **zero** changes (round trip);
- a single bad row means **nothing** is imported, and a failure part-way through a commit rolls everything back.

## Data accuracy notes

- Dates without a time (birthdays, hire dates, leave dates) are stored as `YYYY-MM-DDT12:00:00Z` and compared as calendar dates, so they never shift a day between Manila and UTC.
- Government ID numbers are text in a canonical dashed format. Excel imports warn when a leading zero was lost.
- Ambiguous Excel dates like `03/05/2024` are rejected on import. Use real date cells or `YYYY-MM-DD`.
- Remaining leave days are calculated when read, never stored, so editing or cancelling an earlier filing can't leave stale balances.
- Deleting an employee who has leave or requirement history is blocked; set the employment status instead.

**Assumption to confirm:** the IPCR column list in the brief repeats DATE and JOB TITLE. They are modelled as
*Rating Period* (Jan–Jun / Jul–Dec), *Period From/To*, *Date Submitted* and *Date Received*.

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)**: build a release locally, upload it, and set up the cPanel Node.js app, backups and updates.
