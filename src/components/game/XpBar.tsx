import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * XpBar per design.md §13 — 8px track bg-3, fill gradient mint→cyan,
 * fill tween 900ms out-expo, shimmer sweep on completion.
 * `ratio` 0..1 (xp into current level / 100).
 */
export default function XpBar({
  ratio,
  className,
  shimmer = false,
}: {
  ratio: number
  className?: string
  shimmer?: boolean
}) {
  const pct = Math.min(1, Math.max(0, ratio)) * 100
  return (
    <div
      className={cn('relative h-2 overflow-hidden rounded-pill bg-night-3', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-pill bg-gradient-to-r from-mint to-cyan"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
      />
      {shimmer && pct >= 100 && (
        <span className="pointer-events-none absolute inset-y-0 w-1/3 animate-shimmer bg-white/30" />
      )}
    </div>
  )
}
