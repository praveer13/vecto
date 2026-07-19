import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { sfx } from '@/lib/sfx'

/**
 * BottomSheet per design.md §13 — top radius 20, drag handle 32×4,
 * spring sheet entrance (y 100%→0), scrim fade 200ms, swipe-down dismiss
 * with velocity carry. z-40 sheet layer.
 */
const sheetSpring = { type: 'spring', stiffness: 320, damping: 28 } as const

export default function BottomSheet({
  open,
  onClose,
  children,
  ariaLabel,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel?: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="scrim fixed inset-0 z-40"
            onClick={() => {
              sfx.whoosh()
              onClose()
            }}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetSpring}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) {
                sfx.whoosh()
                onClose()
              }
            }}
            className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 rounded-t-[20px] border border-line bg-night-2 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-panel"
          >
            <div className="mx-auto mt-2 h-1 w-8 rounded-pill bg-line" />
            <div className="px-4 pt-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
