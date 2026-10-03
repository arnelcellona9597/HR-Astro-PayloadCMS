import './sqlite-busy-timeout'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { Applications } from './collections/Applications'
import { AuditLogs } from './collections/AuditLogs'
import { Branches } from './collections/Branches'
import { ComplianceCollections } from './collections/compliance'
import { Employees } from './collections/Employees'
import { Holidays } from './collections/Holidays'
import { ImportJobs } from './collections/ImportJobs'
import { LoginChallenges } from './collections/LoginChallenges'
import { Media } from './collections/Media'
import { EmailTemplates, MessageRecipients, Messages, Notifications } from './collections/messaging'
import { PayrollPeriods, Payslips } from './collections/payroll'
import { Users } from './collections/Users'
import { WellnessLeaves } from './collections/WellnessLeaves'
import { captureAdapter } from './email/capture'
import { assertProductionEnv, DATA_DIR, DB_FILE, IS_PROD, PAYLOAD_SECRET, SERVER_URL } from './env'
import { LeaveSettings } from './globals/LeaveSettings'
import { NotificationSettings } from './globals/NotificationSettings'
import { PayslipSettings } from './globals/PayslipSettings'
import { SiteSettings } from './globals/SiteSettings'
import { ensureDefaults } from './server/defaults'
import { startQueueWorker } from './server/mailer'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const smtpPort = Number(process.env.SMTP_PORT || 465)
// HR_EMAIL_CAPTURE=1 writes emails to DATA_DIR/outbox.jsonl instead of sending (development and tests).
const capture = process.env.HR_EMAIL_CAPTURE === '1' && (!IS_PROD || process.env.HR_E2E === '1')
const email = capture
  ? captureAdapter(DATA_DIR)
  : process.env.SMTP_HOST
  ? nodemailerAdapter({
      defaultFromAddress: process.env.SMTP_FROM_ADDRESS || process.env.SMTP_USER || '',
      defaultFromName: process.env.SMTP_FROM_NAME || 'HR System',
      transportOptions: {
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      },
    })
  : undefined

export default buildConfig({
  serverURL: SERVER_URL,
  secret: PAYLOAD_SECRET,
  telemetry: false,
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · HR System Admin' },
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [
    Employees,
    Branches,
    Applications,
    WellnessLeaves,
    ...ComplianceCollections,
    PayrollPeriods,
    Payslips,
    Messages,
    MessageRecipients,
    EmailTemplates,
    Notifications,
    Holidays,
    Users,
    Media,
    AuditLogs,
    ImportJobs,
    LoginChallenges,
  ],
  globals: [SiteSettings, LeaveSettings, NotificationSettings, PayslipSettings],
  onInit: async (payload) => {
    assertProductionEnv()
    await ensureDefaults(payload)
    startQueueWorker(payload)
  },
  // Only same-site requests may use the cookie-authenticated API.
  csrf: [SERVER_URL, 'http://localhost:4321', 'http://localhost:3001'],
  cors: [SERVER_URL],
  graphQL: { disable: true },
  upload: { limits: { fileSize: 10 * 1024 * 1024 } },
  email,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: sqliteAdapter({
    client: { url: `file:${DB_FILE}` },
    // WAL lets readers keep working while an import writes. Disable with HR_SQLITE_WAL=false
    // if the host's home directory turns out to be on a network filesystem (NFS).
    wal: process.env.HR_SQLITE_WAL === 'false' ? false : true,
    busyTimeout: 30_000,
    // Enables real transactions, so a failed Excel import rolls back completely.
    transactionOptions: { behavior: 'immediate' },
    push: !IS_PROD && process.env.HR_DB_PUSH !== 'false',
    migrationDir: path.resolve(dirname, 'migrations'),
    prodMigrations: migrations,
  }),
})
