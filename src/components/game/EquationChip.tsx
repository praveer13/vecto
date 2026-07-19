import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * EquationChip per design.md §12/§13 — floating pill above the dock,
 * bg-2 95% + blur, Mono M. Pulses glow-cyan 300ms when content changes.
 * aria-live="polite" — the screen-reader mirror of canvas math state.
 */
export default function EquationChip({ text, className }: { text: string; className?: string }) {
  const [pulse, setPulse] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const on = setTimeout(() => setPulse(true), 0)
    const off = setTimeout(() => setPulse(false), 300)
    return () => {
      clearTimeout(on)
      clearTimeout(off)
    }
  }, [text])

  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none inline-flex items-center rounded-pill border border-line bg-night-2/95 px-4 py-2 font-mono text-mono-m font-bold text-hi backdrop-blur transition-shadow duration-300',
        pulse && 'shadow-glow-cyan',
        className,
      )}
    >
      {text}
    </div>
  )
}
