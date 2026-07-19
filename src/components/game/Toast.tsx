import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Toast per design.md §13 — top-center, slide down 12px + fade 180ms,
 * auto-dismiss 2.4s, max 1 visible. Controlled by the parent:
 *   const [msg, setMsg] = useState<string | null>(null)
 *   <Toast message={msg} onDone={() => setMsg(null)} />
 */
export default function Toast({
  message,
  onDone,
}: {
  message: string | null
  onDone: () => void
}) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 2400)
    return () => clearTimeout(t)
  }, [message, onDone])

  return (
    <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+12px)] z-50 -translate-x-1/2">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="rounded-pill border border-line bg-night-2/95 px-4 py-2 text-body font-semibold text-hi shadow-panel backdrop-blur"
            role="status"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
