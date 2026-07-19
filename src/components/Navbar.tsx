import { NavLink, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import { Home, Map, BookOpen, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

/**
 * BottomNav per design.md §13 — file is named Navbar.tsx by contract,
 * but this is the app-shell bottom navigation (64px + safe area).
 * 4 tabs: Home, Map, Codex, Profile. Active tab: amber icon+label,
 * 6px glow dot above, pill bg amber@10%, spring pop on switch.
 * Rendered by Layout — pages must not render it themselves.
 */

const TABS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/codex', label: 'Codex', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: User },
] as const

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-line bg-night-1/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-[12px]"
    >
      <div className="grid h-16 grid-cols-4">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                haptics.tick()
                sfx.tick()
              }}
              className="relative flex min-h-[44px] flex-col items-center justify-center gap-0.5"
            >
              {active && (
                <motion.span
                  layoutId="bottomnav-pill"
                  transition={pop}
                  className="absolute inset-x-3 inset-y-1.5 rounded-pill bg-amber/10"
                />
              )}
              {active && (
                <motion.span
                  layoutId="bottomnav-dot"
                  transition={pop}
                  className="absolute top-0.5 h-1.5 w-1.5 rounded-full bg-amber shadow-glow-amber"
                />
              )}
              <Icon
                className={cn('relative h-5 w-5', active ? 'text-amber' : 'text-low')}
                strokeWidth={active ? 2.4 : 2}
              />
              <span
                className={cn(
                  'relative text-[10px] font-extrabold uppercase tracking-[0.08em]',
                  active ? 'text-amber' : 'text-low',
                )}
              >
                {label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
