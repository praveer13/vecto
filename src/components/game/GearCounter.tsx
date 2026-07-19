import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * GearCounter per design.md §13 — gear-currency icon + Mono M count;
 * count-up tween 500ms on change; +N floats up and fades 600ms.
 */
export default function GearCounter({ count, className }: { count: number; className?: string }) {
  const [shown, setShown] = useState(count)
  const [delta, setDelta] = useState<number | null>(null)
  const prev = useRef(count)
  const shownRef = useRef(count)

  useEffect(() => {
    const d = count - prev.current
    prev.current = count
    if (d === 0) return
    if (d > 0) setDelta(d)
    const start = shownRef.current
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 500)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(start + (count - start) * eased)
      shownRef.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const clear = setTimeout(() => setDelta(null), 650)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(clear)
    }
  }, [count])

  return (
    <span className={cn('relative inline-flex items-center gap-1.5', className)}>
      <svg width="18" height="18" viewBox="0 0 24 24" className="text-gold" aria-hidden>
        <use href="/icons-game.svg#i-gear-currency" />
      </svg>
      <span className="font-mono text-mono-m font-bold text-hi">{shown}</span>
      <AnimatePresence>
        {delta !== null && (
          <motion.span
            key={`${count}-${delta}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -14 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute -top-1 right-0 font-mono text-mono-s font-bold text-gold"
          >
            +{delta}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
