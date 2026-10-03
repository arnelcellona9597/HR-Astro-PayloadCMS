// Automatic emails triggered by HR records (kept separate from collections to avoid import cycles).
import { formatDate, toYmd } from '@hr/shared'
import type { PayloadRequest } from 'payload'

import { queueMessage, templateByKey } from './mailer'

type LeaveDoc = { id: number; employee: number | { id: number }; inclusiveDateFrom: string; inclusiveDateTo: string; days?: number | null; status: string }

export async function leaveNotification(req: PayloadRequest, leave: LeaveDoc, kind: 'filed' | 'status') {
  const { payload } = req
  try {
    const settings = await payload.findGlobal({ slug: 'notification-settings', overrideAccess: true, req })
    if (kind === 'filed' && settings.leaveFiledToEmployee === false) return
    if (kind === 'status' && settings.leaveStatusToEmployee === false) return
    const from = toYmd(leave.inclusiveDateFrom)
    const to = toYmd(leave.inclusiveDateTo)
    const dates = from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`
    const key = kind === 'filed' ? 'leave-filed' : 'leave-status'
    const t = await templateByKey(payload, key, { subject: 'Wellness leave: {{leaveDates}}', body: 'Hi {{firstName}},\n\nYour wellness leave on {{leaveDates}} is {{leaveStatus}}.' }, req)
    await queueMessage(payload, {
      ...t,
      category: 'Leave',
      automatic: true,
      sentBy: req.user as never,
      recipients: [
        {
          employeeId: typeof leave.employee === 'object' ? leave.employee.id : leave.employee,
          context: { leaveDates: dates, leaveDays: leave.days ?? '', leaveStatus: leave.status },
        },
      ],
      audienceLabel: 'Employee (automatic)',
      related: { collection: 'wellness-leaves', id: leave.id },
      req,
    })
  } catch (err) {
    // A notification problem must never block saving the leave.
    payload.logger.warn({ err, msg: 'Could not queue the leave notification' })
  }
}
