import { asset } from '@/lib/asset'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { BottomSheet, Chip, Toast } from '@gridverse/kit/ui'
import { useGameStore } from '@/store/gameStore'
import { CARDS, ZONES } from '@/lib/content'
import type { CardMeta } from '@/lib/content'
import { haptics, sfx, cn } from '@gridverse/kit/lib'

/**
 * Concept Codex (profile.md §4) — shared by the /codex route and the
 * Profile page's #codex section. Chapter pill tabs, 3-column card grid,
 * locked silhouettes, violet "new" ribbons until first flip, and a
 * full-card BottomSheet with a 3D flip to the Nerd Note back.
 */

const gentle = { type: 'spring', stiffness: 180, damping: 22 } as const
const outExpo = [0.16, 1, 0.3, 1] as [number, number, number, number]

const VIEWED_KEY = 'vecto-cards-viewed'
const loadViewed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(VIEWED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
const markViewed = (id: string) => {
  try {
    const v = loadViewed()
    if (!v.includes(id)) localStorage.setItem(VIEWED_KEY, JSON.stringify([...v, id]))
  } catch {
    /* private mode */
  }
}

/* ---------------- full-card flip (sheet content) ---------------- */

function BigCard({
  card,
  startFlipped,
  onFlipped,
}: {
  card: CardMeta
  startFlipped: boolean
  onFlipped: (id: string) => void
}) {
  const [flipped, setFlipped] = useState(startFlipped)
  const accent = ZONES[card.chapter - 1].accent

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ perspective: 1200 }}>
        <motion.button
          type="button"
          aria-label={
            flipped
              ? `${card.flavor} — Nerd Note: ${card.term}. ${card.note} Tap to see the art.`
              : `Concept card: ${card.flavor}. Tap to flip for the Nerd Note.`
          }
          onClick={() => {
            const next = !flipped
            setFlipped(next)
            if (next) {
              markViewed(card.id)
              onFlipped(card.id)
            }
            haptics.tick()
            sfx.whoosh()
          }}
          className="relative block h-[320px] w-[240px]"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ ...gentle, duration: 0.6 }}
        >
          {/* front — illustration + flavor name */}
          <div
            className="absolute inset-0 overflow-hidden rounded-lg border-2 bg-night-2"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              borderColor: `${accent}88`,
              boxShadow: '0 0 16px rgba(139,92,246,.35), 0 0 48px rgba(139,92,246,.14)',
            }}
          >
            <img src={card.img} alt={card.flavor} className="h-full w-full object-cover" />
            <div
              className="absolute inset-x-0 bottom-0 px-2 py-1.5 text-center text-title font-extrabold text-hi"
              style={{ background: 'rgba(6,10,19,0.78)', color: accent }}
            >
              {card.flavor}
            </div>
          </div>
          {/* back — Nerd Note */}
          <div
            className="absolute inset-0 flex flex-col gap-2 overflow-hidden rounded-lg border-2 border-violet/60 bg-night-2 p-4 text-left"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              boxShadow: '0 0 16px rgba(139,92,246,.35), 0 0 48px rgba(139,92,246,.14)',
            }}
          >
            <p className="text-caption font-extrabold uppercase text-violet">NERD NOTE</p>
            <p className="text-title font-extrabold text-cyan">{card.term}</p>
            <p className="text-body font-semibold text-hi">{card.note}</p>
            <p className="mt-auto rounded-sm border border-line bg-night-1 px-2 py-1.5 text-center font-mono text-mono-s text-mid">
              {card.example}
            </p>
          </div>
        </motion.button>
      </div>
      <p className="text-caption font-extrabold uppercase text-low">
        {flipped ? 'Tap to see the art' : 'Tap the card for the Nerd Note'}
      </p>
    </div>
  )
}

/* ---------------- the section ---------------- */

export default function CodexSection({
  initialChapter = 0, // 0 = All
  header = true,
}: {
  initialChapter?: number
  header?: boolean
}) {
  const navigate = useNavigate()
  const owned = useGameStore((s) => s.cards)
  const [tab, setTab] = useState(initialChapter)
  const [sheetCard, setSheetCard] = useState<{ card: CardMeta; flipped: boolean } | null>(null)
  const [wobbleId, setWobbleId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [viewed, setViewed] = useState<string[]>(loadViewed)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  // a flip clears the card's "new" ribbon (also persisted to localStorage)
  const handleFlipped = (id: string) => setViewed((v) => (v.includes(id) ? v : [...v, id]))

  const visible = useMemo(
    () => (tab === 0 ? CARDS : CARDS.filter((c) => c.chapter === tab)),
    [tab],
  )
  const ownedCount = CARDS.filter((c) => owned.includes(c.id)).length

  const openCard = (card: CardMeta, flipped: boolean) => {
    haptics.tick()
    sfx.tick()
    if (flipped) {
      markViewed(card.id)
      handleFlipped(card.id)
    }
    setSheetCard({ card, flipped })
  }

  const tapCard = (card: CardMeta) => {
    if (longPressed.current) return
    if (!owned.includes(card.id)) {
      setWobbleId(card.id)
      setToast(`Find it in Chapter ${card.chapter}!`)
      haptics.error()
      sfx.error()
      return
    }
    openCard(card, false)
  }

  const pressStart = (card: CardMeta) => {
    longPressed.current = false
    if (!owned.includes(card.id)) return
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      haptics.purr()
      openCard(card, true)
    }, 400)
  }
  const pressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  return (
    <div className="flex flex-col gap-3">
      {header && (
        <div className="flex items-center justify-between px-1">
          <h2 className="text-h2 font-black text-hi">CONCEPT CODEX</h2>
          <Chip tone="violet">{ownedCount}/18</Chip>
        </div>
      )}

      {/* chapter tabs */}
      <div role="tablist" aria-label="Filter cards by chapter" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ chapter: 0, name: 'All', accent: '#8B5CF6' }, ...ZONES].map((z) => {
          const active = tab === z.chapter
          return (
            <button
              key={z.chapter}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(z.chapter)
                haptics.tick()
                sfx.tick()
              }}
              className={cn(
                'min-h-[44px] shrink-0 rounded-pill border px-4 text-caption font-extrabold uppercase transition-colors',
                active ? 'border-transparent' : 'border-line text-low',
              )}
              style={
                active
                  ? { background: `${z.accent}26`, color: z.accent }
                  : undefined
              }
            >
              {z.chapter === 0 ? 'All' : `Ch${z.chapter}`}
            </button>
          )
        })}
      </div>

      {/* card grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-3 gap-2"
        >
          {visible.map((card, i) => {
            const has = owned.includes(card.id)
            const isNew = has && !viewed.includes(card.id)
            const accent = ZONES[card.chapter - 1].accent
            return (
              <motion.button
                key={card.id}
                type="button"
                aria-label={
                  has
                    ? `Concept card: ${card.flavor} — ${card.term}. Double-tap to flip.`
                    : `Locked concept card. Find it in Chapter ${card.chapter}.`
                }
                initial={{ opacity: 0, y: 12 }}
                animate={
                  wobbleId === card.id
                    ? { opacity: 1, y: 0, rotate: [0, -4, 4, -3, 3, 0] }
                    : { opacity: 1, y: 0, rotate: 0 }
                }
                transition={
                  wobbleId === card.id
                    ? { duration: 0.25 }
                    : { duration: 0.2, delay: i * 0.03, ease: outExpo }
                }
                onAnimationComplete={() => {
                  if (wobbleId === card.id) setWobbleId(null)
                }}
                onClick={() => tapCard(card)}
                onPointerDown={() => pressStart(card)}
                onPointerUp={pressEnd}
                onPointerLeave={pressEnd}
                className="relative aspect-[3/4] overflow-hidden rounded-md border bg-night-2"
                style={{ borderColor: has ? `${accent}66` : 'var(--line)' }}
              >
                {has ? (
                  <>
                    <img src={card.img} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <div
                      className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[11px] font-extrabold leading-tight"
                      style={{ background: 'rgba(6,10,19,0.78)', color: accent }}
                    >
                      {card.flavor}
                    </div>
                    {isNew && (
                      <span
                        aria-label="New card"
                        className="absolute right-0 top-0 h-0 w-0 border-b-[26px] border-l-[26px] border-b-transparent border-l-violet"
                        style={{ filter: 'drop-shadow(0 0 6px rgba(139,92,246,.8))' }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <img src={asset('card-back.png')} alt="" loading="lazy" className="h-full w-full object-cover opacity-40" />
                    <span className="absolute inset-0 flex items-center justify-center font-display text-h2 text-low">?</span>
                  </>
                )}
              </motion.button>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* full-card sheet */}
      <BottomSheet open={!!sheetCard} onClose={() => setSheetCard(null)} ariaLabel={sheetCard ? `Concept card ${sheetCard.card.flavor}` : undefined}>
        {sheetCard && (
          <div className="flex flex-col items-center gap-3 pb-2">
            <BigCard card={sheetCard.card} startFlipped={sheetCard.flipped} onFlipped={handleFlipped} />
            <button
              type="button"
              onClick={() => {
                setSheetCard(null)
                navigate(
                  sheetCard.card.foundIn === 'boss'
                    ? '/boss'
                    : `/play?level=${sheetCard.card.foundIn}`,
                )
              }}
              className="flex min-h-[44px] items-center gap-1.5 rounded-pill px-3 text-body font-bold text-mid"
            >
              <MapPin className="h-4 w-4 text-cyan" />
              Found in: <span className="text-cyan">{sheetCard.card.foundLabel}</span>
            </button>
          </div>
        )}
      </BottomSheet>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
