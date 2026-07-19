import { motion } from 'framer-motion'

/**
 * LogoMark — the VECTO wordmark as inline SVG (same letterforms as /logo.svg)
 * so the home entrance can stagger each letter (home.md §2: letters drop from
 * −24px with spring pop, stagger 60ms). Static contexts should use /logo.svg.
 */
const LETTERS = [
  'M60 78 L108 232 L156 78', // V
  'M292 78 L216 78 L216 232 L292 232 M216 155 L276 155', // E
  'M438 102 A78 78 0 1 0 438 208', // C
  'M474 78 L574 78 M524 78 L524 232', // T
  'M658 78 A77 77 0 1 0 658 232 A77 77 0 1 0 658 78', // O
]

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const

export default function LogoMark({
  width = 240,
  stagger = false,
  className,
}: {
  width?: number
  /** per-letter drop-in entrance (home first visit) */
  stagger?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 800 300"
      width={width}
      height={(width * 300) / 800}
      fill="none"
      className={className}
      role="img"
      aria-label="VECTO"
    >
      <defs>
        <linearGradient id="lm-grad" x1="0" y1="0" x2="800" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB020" />
          <stop offset="0.45" stopColor="#FFD166" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      {LETTERS.map((d, i) => (
        <motion.g
          key={i}
          initial={stagger ? { opacity: 0, y: -24 } : false}
          animate={stagger ? { opacity: 1, y: 0 } : undefined}
          transition={stagger ? { ...pop, delay: 0.4 + i * 0.06 } : undefined}
        >
          <path d={d} stroke="#22D3EE" strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <path d={d} stroke="url(#lm-grad)" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>
      ))}
      {/* arrowhead crowning the V */}
      <motion.path
        d="M156 78 L132 96 L146 104 L150 118 L162 106 L176 100 Z"
        fill="#FFD166"
        stroke="#22D3EE"
        strokeWidth={4}
        strokeLinejoin="round"
        initial={stagger ? { opacity: 0, scale: 0 } : false}
        animate={stagger ? { opacity: 1, scale: 1 } : undefined}
        transition={stagger ? { ...pop, delay: 0.78 } : undefined}
        style={{ transformOrigin: '156px 96px' }}
      />
    </svg>
  )
}
