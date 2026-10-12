import { NavLink, Outlet } from 'react-router-dom'
import type { PixelIconName } from '../assets/pixel/icons'
import { useReminderScheduler } from '../hooks/useReminderScheduler'
import { t } from '../i18n'
import { PixelIcon } from './PixelIcon'

const links: { to: string; label: string; icon: PixelIconName }[] = [
  { to: '/', label: t.nav.courses, icon: 'courses' },
  { to: '/fiches', label: t.nav.cards, icon: 'cards' },
  { to: '/reviser', label: t.nav.review, icon: 'review' },
  { to: '/echeances', label: t.nav.deadlines, icon: 'deadlines' },
  { to: '/notes', label: t.nav.grades, icon: 'grades' },
  { to: '/dragon', label: t.nav.pet, icon: 'pet' },
]

const navItem = (isActive: boolean) =>
  `flex flex-col items-center gap-0.5 px-1 py-1 text-xs font-semibold sm:flex-row sm:px-1.5 sm:text-sm ${
    isActive ? 'px-box px-flat [--frame:var(--color-accent-soft)] bg-accent-tint text-ink' : 'text-ink-muted hover:text-ink'
  }`

export function Layout() {
  useReminderScheduler()
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-2 pb-12 sm:pb-4">
      <header className="flex items-center justify-between gap-1 py-2">
        <NavLink to="/" className="font-pixel text-xl font-semibold">
          {t.appName}
        </NavLink>
        <div className="flex items-center gap-1">
          <nav
            aria-label="Navigation principale"
            className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-border bg-surface sm:static sm:border-0 sm:bg-transparent"
          >
            <ul className="flex justify-around sm:gap-0.5">
              {links.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} end={link.to === '/'} className={({ isActive }) => navItem(isActive)}>
                    <PixelIcon name={link.icon} />
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <NavLink
            to="/reglages"
            aria-label={t.nav.settings}
            title={t.nav.settings}
            className={({ isActive }) => `p-1 ${isActive ? 'px-box px-flat [--frame:var(--color-accent-soft)] bg-accent-tint text-ink' : 'text-ink-muted hover:text-ink'}`}
          >
            <PixelIcon name="settings" />
          </NavLink>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-3">
        <Outlet />
      </main>
    </div>
  )
}
