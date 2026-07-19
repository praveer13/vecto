import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

/**
 * NeonButton per design.md §13 — pill, 56px default.
 * primary: amber fill, #1A1206 text, glow-amber
 * secondary: cyan outline 1.5px, cyan text, cyan@08% fill
 * ghost: text only
 * Press: scale 0.96 90ms + tick haptic. Disabled: text-low, no glow.
 */
export default function NeonButton({
  children,
  variant = 'primary',
  className,
  disabled,
  onClick,
  ariaLabel,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  className?: string
  disabled?: boolean
  onClick?: () => void
  ariaLabel?: string
}) {
  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.09 }}
      onClick={() => {
        if (disabled) return
        haptics.release()
        sfx.tick()
        onClick?.()
      }}
      className={cn(
        'flex h-14 items-center justify-center gap-2 rounded-pill px-8 text-title font-extrabold',
        'transition-shadow duration-100',
        variant === 'primary' &&
          'bg-amber text-[#1A1206] shadow-glow-amber active:shadow-[0_0_24px_rgba(255,176,32,.7),0_0_72px_rgba(255,176,32,.3)]',
        variant === 'secondary' &&
          'border-[1.5px] border-cyan bg-cyan/10 text-cyan active:shadow-glow-cyan',
        variant === 'ghost' && 'h-11 px-4 text-mid',
        disabled && 'cursor-not-allowed text-low shadow-none opacity-60',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}
