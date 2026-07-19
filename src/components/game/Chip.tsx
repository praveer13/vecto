import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Chip per design.md §13 — pill r-sm, Caption style.
 * tone maps to the semantic accent; used for level chips ("LV 2-3 · WINDFALL ISLES"),
 * coordinate chips, reward chips, etc.
 */
const TONES = {
  amber: 'border-amber/40 bg-amber/10 text-amber',
  cyan: 'border-cyan/40 bg-cyan/10 text-cyan',
  mint: 'border-mint/40 bg-mint/10 text-mint',
  violet: 'border-violet/40 bg-violet/10 text-violet',
  magenta: 'border-magenta/40 bg-magenta/10 text-magenta',
  coral: 'border-coral/40 bg-coral/10 text-coral',
  gold: 'border-gold/40 bg-gold/10 text-gold',
  neutral: 'border-line bg-night-2 text-mid',
} as const

export default function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: keyof typeof TONES
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-caption font-extrabold uppercase',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
