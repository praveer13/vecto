import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

/** IconButton per design.md §13 — 44px circle, bg-2, 1px line. Pressed: scale 0.92. */
export default function IconButton({
  children,
  onClick,
  ariaLabel,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  ariaLabel: string
  className?: string
}) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.09 }}
      onClick={() => {
        haptics.tick()
        sfx.tick()
        onClick?.()
      }}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full border border-line bg-night-2 text-mid',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}
