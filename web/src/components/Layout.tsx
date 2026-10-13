import { NavLink, Outlet } from 'react-router-dom'
import type { Role } from '../api/client'
import type { PixelIconName } from '../assets/pixel/icons'
import { t } from '../i18n'
import { useAuthStore } from '../stores/auth'
import { PixelIcon } from './PixelIcon'

type NavItem = { to: string; label: string; icon: PixelIconName }

const links: Record<Role, NavItem[]> = {
  student: [
    { to: '/', label: t.nav.quizzes, icon: 'review' },
    { to: '/classes', label: t.nav.classes, icon: 'courses' },
    { to: '/evaluations', label: t.nav.evaluations, icon: 'deadlines' },
    { to: '/notes', label: t.nav.grades, icon: 'grades' },
    { to: '/dragon', label: t.nav.pet, icon: 'pet' },
  ],
  trainer: [
    { to: '/', label: t.nav.quizzes, icon: 'review' },
    { to: '/classes', label: t.nav.classes, icon: 'courses' },
    { to: '/evaluations', label: t.nav.evaluations, icon: 'deadlines' },
    { to: '/notes', label: t.nav.grades, icon: 'grades' },
    { to: '/suivi', label: t.nav.dashboard, icon: 'pet' },
  ],
}

const navItem = (isActive: boolean) =>
  `flex flex-col items-center gap-0.5 px-1 py-1 text-xs font-semibold sm:flex-row sm:px-1.5 sm:text-sm ${
    isActive ? 'px-box px-flat [--frame:var(--color-accent-soft)] bg-accent-tint text-ink' : 'text-ink-muted hover:text-ink'
  }`

export function Layout() {
  const user = useAuthStore((s) => s.user)!
  const logout = useAuthStore((s) => s.logout)
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-2 pb-12 sm:pb-4">
      <header className="flex flex-wrap items-center justify-between gap-1 py-2">
        <NavLink to="/" className="font-pixel text-xl font-semibold">
          {t.appName}
        </NavLink>
        <div className="flex items-center gap-1">
          <span className="hidden text-sm text-ink-muted md:inline">{user.display_name}</span>
          <span className="px-box px-flat bg-accent-tint px-1 text-xs font-semibold [--frame:var(--color-accent-soft)]">
            {t.auth.roles[user.role]}
          </span>
          <button type="button" onClick={logout} className="text-sm text-ink-muted underline hover:text-ink">
            {t.auth.logout}
          </button>
        </div>
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-border bg-surface sm:static sm:w-full sm:border-0 sm:bg-transparent"
        >
          <ul className="flex justify-around sm:justify-start sm:gap-0.5">
            {links[user.role].map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.to === '/'} className={({ isActive }) => navItem(isActive)}>
                  <PixelIcon name={link.icon} />
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="flex flex-1 flex-col gap-3">
        <Outlet />
      </main>
    </div>
  )
}
