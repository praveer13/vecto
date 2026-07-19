import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useEffect } from 'react'

/**
 * StarMeter per design.md §13 — 3 stars, gold filled / line empty with 1.5px stroke.
 * Earn animation: scale 0→1.3→1 spring pop, stagger 250ms, haptic per star.
 * Set `animateEarn` when displaying a just-earned tally.
 */
function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.5 l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-2.9-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z"
        fill={filled ? '#FFD166' : 'none'}
        stroke={filled ? '#FFD166' : '#223354'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        style={filled ? { filter: 'drop-shadow(0 0 6px rgba(255,209,102,.6))' } : undefined}
      />
    </svg>
  )
}

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const

export default function StarMeter({
  stars,
  size = 20,
  animateEarn = false,
  className,
}: {
  stars: number // 0–3
  size?: number
  animateEarn?: boolean
  className?: string
}) {
  useEffect(() => {
    if (!animateEarn) return
    const timers = Array.from({ length: stars }, (_, i) =>
      setTimeout(() => haptics.star(), 250 * i + 200),
    )
    return () => timers.forEach(clearTimeout)
  }, [animateEarn, stars])

  return (
    <div className={cn('flex items-center gap-1', className)} role="img" aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map((i) =>
        animateEarn && i < stars ? (
          <motion.span
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ ...pop, delay: 0.25 * i }}
          >
            <Star filled size={size} />
          </motion.span>
        ) : (
          <span key={i}>
            <Star filled={i < stars} size={size} />
          </span>
        ),
      )}
    </div>
  )
}
