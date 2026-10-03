// Navigation model shared by the sidebar and the topbar breadcrumbs.
export type NavItem = { href: string; label: string; icon: string }
export type NavGroup = { label: string; items: NavItem[] }

export function navGroups(role: string | undefined): NavGroup[] {
  const isSystemAdmin = role === 'system-admin'
  const admin: (NavItem & { show: boolean })[] = [
    { href: '/users', label: 'HR Accounts', icon: 'shield', show: isSystemAdmin },
    { href: '/settings', label: 'Branding & Theme', icon: 'settings', show: true },
    { href: '/settings/notifications', label: 'Email Settings', icon: 'send', show: true },
    { href: '/settings/email-server', label: 'Email Server (SMTP)', icon: 'mail', show: isSystemAdmin },
    { href: '/audit', label: 'Audit Log', icon: 'history', show: true },
  ]
  return [
    {
      label: 'Workspace',
      items: [
        { href: '/', label: 'Dashboard', icon: 'dashboard' },
        { href: '/employees', label: 'Employees', icon: 'users' },
        { href: '/onboarding', label: 'Onboarding Tracker', icon: 'clipboard' },
        { href: '/leave', label: 'Wellness Leave', icon: 'calendar' },
        { href: '/branches', label: 'Branches', icon: 'building' },
        { href: '/requirements', label: 'Annual Requirements', icon: 'file' },
        { href: '/payroll', label: 'Payroll', icon: 'wallet' },
        { href: '/messages', label: 'Messages', icon: 'mail' },
        { href: '/data', label: 'Import / Export', icon: 'sheet' },
      ],
    },
    { label: 'Administration', items: admin.filter((i) => i.show).map(({ show: _, ...i }) => i) },
  ]
}

/** `/settings` only matches itself; every other item also owns its sub-pages. */
export function isActive(href: string, path: string): boolean {
  if (href === '/' || href === '/settings') return path === href
  return path === href || path.startsWith(`${href}/`)
}

/** The nav item a page belongs to (longest matching prefix), for breadcrumbs. */
export function sectionFor(path: string, groups: NavGroup[]): NavItem | null {
  let best: NavItem | null = null
  for (const item of groups.flatMap((g) => g.items)) {
    const owns = item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`)
    if (owns && (!best || item.href.length > best.href.length)) best = item
  }
  return best
}

export function initials(name: string | null | undefined): string {
  return (
    (name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}
