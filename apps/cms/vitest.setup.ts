import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Every test run gets a fresh, isolated data directory so tests never touch real data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-test-'))
process.env.DATA_DIR = dir
process.env.PAYLOAD_SECRET = 'test-secret-test-secret-test-secret'
process.env.HR_DB_PUSH = 'true'
process.env.HR_EMAIL_CAPTURE = '1'
process.env.HR_QUEUE_WORKER = 'false'
