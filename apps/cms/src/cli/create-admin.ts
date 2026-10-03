// Server command to create the first System Admin (public sign-up is disabled) or reset a password.
//
//   node scripts/create-admin.mjs                          create a System Admin (asks for details)
//   node scripts/create-admin.mjs --reset-password <email> set a new password for an existing account
//   node scripts/create-admin.mjs --force                  create another System Admin
//   --name "…" --email … (with HR_ADMIN_PASSWORD in the environment) runs without questions (automation)
//
// On z.com run it with Node 22: /opt/alt/alt-nodejs22/root/usr/bin/node scripts/create-admin.mjs
import { getPayload } from 'payload'
import readline from 'node:readline'

import { validateEmail } from '@hr/shared'
import config from '../payload.config'

// NODE_ENV and HR_QUEUE_WORKER are set before any import by the bundle banner (see build:cli).

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream }
      out._writeToOutput = (s: string) => {
        if (s.includes(question)) out.output.write(s)
        else out.output.write('*'.repeat(s.length))
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

const flag = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function askPassword(): Promise<string> {
  const fromEnv = process.env.HR_ADMIN_PASSWORD
  if (fromEnv) {
    if (fromEnv.length < 10 || !/[A-Za-z]/.test(fromEnv) || !/\d/.test(fromEnv)) throw new Error('HR_ADMIN_PASSWORD is too weak.')
    return fromEnv
  }
  for (;;) {
    const p1 = await ask('Password (min. 10 characters, letters and numbers): ', true)
    const p2 = await ask('Repeat password: ', true)
    if (p1 !== p2) console.log('Passwords do not match. Try again.')
    else if (p1.length < 10 || !/[A-Za-z]/.test(p1) || !/\d/.test(p1)) console.log('Too weak. Use at least 10 characters with letters and numbers.')
    else return p1
  }
}

async function main() {
  if (!process.env.DATA_DIR && process.env.NODE_ENV === 'production') {
    throw new Error('DATA_DIR is not set. Run this from the app folder that contains .env (cd ~/hr-app).')
  }
  const args = process.argv.slice(2)
  const payload = await getPayload({ config })
  const resetIdx = args.indexOf('--reset-password')

  if (resetIdx >= 0) {
    const email = (args[resetIdx + 1] ?? (await ask('Email of the account: '))).toLowerCase()
    const res = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
    const user = res.docs[0]
    if (!user) throw new Error(`No account with email ${email}.`)
    const password = await askPassword()
    await payload.update({ collection: 'users', id: user.id, data: { password } as never, overrideAccess: true, context: { passwordChange: true } })
    await payload.unlock({ collection: 'users', data: { email } as never, overrideAccess: true, context: { trustedAuth: true } } as never)
    console.log(`\nPassword updated for ${email}. Sign in at the website (an email code is still required).`)
    return
  }

  const admins = await payload.count({ collection: 'users', where: { role: { equals: 'system-admin' } }, overrideAccess: true })
  if (admins.totalDocs > 0 && !args.includes('--force')) {
    throw new Error('A System Admin already exists. Add more accounts from the HR Accounts page, or run again with --force.')
  }
  console.log('Create a System Admin account\n')
  const name = flag('--name') ?? (await ask('Full name: '))
  if (!name) throw new Error('A name is required.')
  const email = (flag('--email') ?? (await ask('Email: '))).toLowerCase()
  if (!email || validateEmail(email)) throw new Error('A valid email address is required.')
  const password = await askPassword()
  await payload.create({
    collection: 'users',
    data: { name, email, password, role: 'system-admin', status: 'approved' } as never,
    overrideAccess: true,
    context: { passwordChange: true },
  })
  console.log(`\nSystem Admin ${email} created. Sign in at the website; the first sign-in confirms the email with a code.`)
  console.log('Next: Settings → Email server — enter the SMTP details so sign-in codes and notifications are emailed.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\nError: ${(err as Error).message}`)
    process.exit(1)
  })
