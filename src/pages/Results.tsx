import { asset } from '@/lib/asset'
/**
 * VECTO Results / Rewards — results.md.
 * Route: /results (payload handed over via sessionStorage 'vecto-result-v1').
 * Variants: level clear · chapter-complete · gentle try-again · daily ribbon.
 * Star tally, XP bar (+level-up interlude), gears, concept-card flip unlock,
 * confetti, tap-to-fast-forward, aria-live reward summary.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Eye, Map as MapIcon, RotateCcw, Sparkles } from 'lucide-react'
import { loadResult, getLevel } from '@/game/levels'
import type { ResultPayload } from '@/game/levels'
import { BADGES, CARD_CATALOG, CHAPTER_CARDS } from '@/game/cards'
import type { ConceptCard } from '@/game/cards'
import { clamp } from '@gridverse/kit/engine'
import { Chip, NeonButton, StarMeter, XpBar } from '@gridverse/kit/ui'
import {
  chapterName,
  selectPlayerLevel,
  selectPlayerTitle,
  selectXpIntoLevel,
  useGameStore,
} from '@/store/gameStore'
import { haptics, sfx, cn } from '@gridverse/kit/lib'

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const
const gentle = { type: 'spring', stiffness: 180, damping: 22 } as const

const ZONE_IMG: Record<number, string> = {
  1: asset('zone-vector-valley.png'),
  2: asset('zone-windfall-isles.png'),
  3: asset('zone-warp-works.png'),
  4: asset('zone-tandem-towers.png'),
  5: asset('zone-eigen-keep.png'),
  6: asset('zone-rewind-rift.png'),
}
const CH_TONE = { 1: 'mint', 2: 'cyan', 3: 'amber', 4: 'violet', 5: 'magenta', 6: 'coral' } as const

/* ---------------- tiny count-up ---------------- */
function CountUp({ to, duration = 0.7, delay = 0 }: { to: number; duration?: number; delay?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() + delay * 1000
    const step = (t: number) => {
      const k = clamp((t - t0) / (duration * 1000), 0, 1)
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, duration, delay])
  return <>{n}</>
}

/* ---------------- confetti burst (canvas, 48 streamers, ~1.6s) ---------------- */
function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !fire || reduceMotion) return
    const ctx = canvas.getContext('2d')!
    const w = (canvas.width = canvas.offsetWidth)
    const h = (canvas.height = canvas.offsetHeight)
    const colors = ['#FFD166', '#3DFFA2', '#22D3EE', '#FFB020', '#8B5CF6', '#FF2E93']
    const parts = Array.from({ length: 48 }, (_, i) => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.28,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 8 - 2,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
      len: 6 + Math.random() * 8,
    }))
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const el = t - t0
      ctx.clearRect(0, 0, w, h)
      if (el > 1600) return
      const alpha = el > 1200 ? 1 - (el - 1200) / 400 : 1
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.35
        p.rot += p.vr
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.strokeStyle = p.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(-p.len / 2, 0)
        ctx.lineTo(p.len / 2, 0)
        ctx.stroke()
        ctx.restore()
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [fire, reduceMotion])
  if (!fire || reduceMotion) return null
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-20 h-full w-full" aria-hidden />
}

/* ---------------- concept card (3:4 flip) ---------------- */
function ConceptCardFlip({ card, delay = 0 }: { card: ConceptCard; delay?: number }) {
  const [flipped, setFlipped] = useState(false)
  const [dealt, setDealt] = useState(false)
  useEffect(() => {
    const t1 = window.setTimeout(() => setDealt(true), delay * 1000)
    return () => window.clearTimeout(t1)
  }, [delay])
  return (
    <div className="flex flex-col items-center gap-2" style={{ perspective: 900 }}>
      <motion.div
        initial={{ y: 120, rotate: -14, opacity: 0 }}
        animate={dealt ? { y: 0, rotate: 0, opacity: 1 } : {}}
        transition={gentle}
        className="relative h-[224px] w-[168px] cursor-pointer"
        style={{ transformStyle: 'preserve-3d' }}
        onClick={() => {
          setFlipped((f) => !f)
          haptics.tick()
          sfx.tick()
        }}
        role="button"
        aria-label={`Concept card ${card.flavor}. Tap to flip.`}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* front — illustration + flavor name */}
          <div
            className="absolute inset-0 overflow-hidden rounded-lg border-2 bg-night-2"
            style={{ borderColor: card.accent, backfaceVisibility: 'hidden', boxShadow: `0 0 24px ${card.accent}44` }}
          >
            <img src={card.img} alt={card.flavor} className="h-full w-full object-cover" draggable={false} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night-0/95 to-transparent px-2 pb-1.5 pt-6">
              <p className="text-title font-extrabold text-hi">{card.flavor}</p>
              <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: card.accent }}>
                concept card
              </p>
            </div>
          </div>
          {/* back — Nerd Note */}
          <div
            className="absolute inset-0 flex flex-col gap-1.5 rounded-lg border-2 bg-night-2 p-3"
            style={{
              borderColor: card.accent,
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              boxShadow: `0 0 24px ${card.accent}44`,
            }}
          >
            <img src={asset('card-back.png')} alt="" className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-cover opacity-25" draggable={false} />
            <p className="relative text-[10px] font-extrabold uppercase tracking-widest" style={{ color: card.accent }}>
              nerd note
            </p>
            <p className="relative text-title font-extrabold text-hi">{card.term}</p>
            <p className="relative text-[13px] font-semibold leading-snug text-mid">{card.note}</p>
            <p className="relative mt-auto rounded-sm bg-night-3 px-2 py-1 font-mono text-[11px] font-bold text-cyan">
              {card.example}
            </p>
          </div>
        </motion.div>
      </motion.div>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-low">tap to flip</p>
    </div>
  )
}

/* ---------------- chapter-complete cards fan ---------------- */
function CardsFan({ chapter }: { chapter: number }) {
  const owned = useGameStore((s) => s.cards)
  const ids = CHAPTER_CARDS[chapter] ?? []
  return (
    <div className="flex items-center justify-center">
      {ids.map((id, i) => {
        const card = CARD_CATALOG[id]
        const has = owned.includes(id)
        return (
          <motion.div
            key={id}
            initial={{ y: 40, opacity: 0, rotate: 0 }}
            animate={{ y: 0, opacity: 1, rotate: (i - 1) * 12 }}
            transition={{ ...pop, delay: 0.12 * i }}
            className={cn('h-[120px] w-[86px] overflow-hidden rounded-md border-2 bg-night-2', i > 0 && '-ml-5')}
            style={{ borderColor: has ? card?.accent : '#223354', zIndex: i }}
          >
            {has && card ? (
              <img src={card.img} alt={card.flavor} className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-night-3 text-2xl font-black text-low">?</div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

/* ---------------- main screen ---------------- */

export default function Results() {
  const navigate = useNavigate()
  const payload = useMemo(() => loadResult(), [])
  const streak = useGameStore((s) => s.streakDays)
  const [phase, setPhase] = useState(0)
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)

  // staged reveal; tap anywhere fast-forwards
  useEffect(() => {
    if (!payload) return
    const steps = [500, 1300, 1900, 2500, 3100]
    const timers = steps.map((ms, i) => window.setTimeout(() => setPhase(i + 1), reduceMotion ? ms * 0.4 : ms))
    return () => timers.forEach(clearTimeout)
  }, [payload, reduceMotion])

  useEffect(() => {
    if (payload) sfx.win()
  }, [payload])

  if (!payload) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <img src={asset('mascot-vex.png')} alt="Vex" className="h-24 w-24 opacity-80" />
        <p className="text-body font-semibold text-mid">No run to report — the Gridverse awaits!</p>
        <NeonButton onClick={() => navigate('/map')}>
          <MapIcon size={18} /> To the map
        </NeonButton>
      </div>
    )
  }

  return (
    <ResultsBody payload={payload} phase={phase} setPhase={setPhase} navigate={navigate} streak={streak} />
  )
}

function ResultsBody({
  payload,
  phase,
  setPhase,
  navigate,
  streak,
}: {
  payload: ResultPayload
  phase: number
  setPhase: (p: number) => void
  navigate: (to: string) => void
  streak: number
}) {
  const level = getLevel(payload.levelId)
  const tone = CH_TONE[payload.chapter as keyof typeof CH_TONE] ?? 'mint'
  const tryAgain = !!payload.tryAgain
  const lvlBefore = selectPlayerLevel(payload.xpBefore)
  const lvlAfter = selectPlayerLevel(payload.xpAfter)
  const leveledUp = lvlAfter > lvlBefore
  const ratioTo = selectXpIntoLevel(payload.xpAfter) / 100
  const fresh = Date.now()
  const replayTo = `/play?level=${payload.levelId}&r=${fresh}`
  const nextTo = payload.nextLevelId ? `/play?level=${payload.nextLevelId}` : '/map'
  const card = payload.cardId ? CARD_CATALOG[payload.cardId] : undefined
  const badge = payload.newBadges[0] ? BADGES[payload.newBadges[0]] : undefined

  const headline = tryAgain
    ? 'SO CLOSE!'
    : payload.chapterComplete
      ? `${chapterName(payload.levelId).toUpperCase()} CLEARED!`
      : 'CLEAR!'

  return (
    <div
      className="relative flex flex-1 flex-col items-center overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-10"
      onClick={() => setPhase(5)}
    >
      <Confetti fire={!tryAgain && phase >= 1} />

      {/* aria-live reward summary */}
      <div className="sr-only" aria-live="polite">
        {`${headline} Level ${payload.levelId} ${payload.levelName}. ${payload.stars} of 3 stars. ` +
          `${payload.xpEarned} XP and ${payload.gearsEarned} gears earned. ` +
          (card ? `Concept card ${card.flavor} unlocked.` : '') +
          (payload.chapterComplete ? ' Chapter complete!' : '')}
      </div>

      {/* headline letters slam */}
      <div className="z-10 flex flex-wrap justify-center gap-x-2">
        {headline.split(' ').map((word, wi) => (
          <span key={wi} className="flex">
            {word.split('').map((ch, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, y: -30, rotate: -12 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                transition={{ ...pop, delay: 0.05 * (wi * 6 + i) }}
                className={cn(
                  'font-display text-[32px] leading-none tracking-wide',
                  tryAgain ? 'text-coral' : 'text-gold',
                )}
                style={{ textShadow: tryAgain ? '0 0 16px rgba(255,107,74,.5)' : '0 0 16px rgba(255,209,102,.5)' }}
              >
                {ch}
              </motion.span>
            ))}
          </span>
        ))}
      </div>

      {/* Vex */}
      <motion.img
        src={tryAgain ? asset('mascot-vex.png') : asset('mascot-vex-celebrate.png')}
        alt={tryAgain ? 'Vex catching its breath' : 'Vex celebrating'}
        initial={{ scale: 0, rotate: tryAgain ? 0 : -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={gentle}
        className="z-10 mt-3 h-28 w-28"
        draggable={false}
      />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="z-10 mt-1 text-center text-body font-semibold text-mid"
      >
        {tryAgain
          ? (payload.coachLine ?? level.coach)
          : `LV ${payload.levelId} · ${payload.levelName} — ${payload.moves} moves (par ${payload.par})`}
      </motion.p>

      {payload.daily && (
        <div className="z-10 mt-2">
          <Chip tone="gold">DAILY DRIFT · DAY {streak} STREAK</Chip>
        </div>
      )}

      {/* ---------- try-again variant ---------- */}
      {tryAgain ? (
        <div className="z-10 mt-8 flex w-full max-w-[300px] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <NeonButton onClick={() => navigate(replayTo)}>
            <RotateCcw size={18} /> Try again
          </NeonButton>
          <NeonButton variant="secondary" onClick={() => navigate(`${replayTo}&hint=1`)}>
            <Eye size={18} /> Watch a hint ghost
          </NeonButton>
          <NeonButton variant="ghost" onClick={() => navigate('/map')}>
            <MapIcon size={18} /> Map
          </NeonButton>
        </div>
      ) : (
        <>
          {/* ---------- star tally ---------- */}
          <div className="z-10 mt-4 h-[60px]">
            {phase >= 1 && <StarMeter stars={payload.stars} size={48} animateEarn />}
          </div>
          {payload.hintsUsed && phase >= 2 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="z-10 -mt-2 text-caption font-extrabold uppercase text-low">
              hint used — ★★ cap, kindly noted
            </motion.p>
          )}

          {/* ---------- reward rows ---------- */}
          <div className="z-10 mt-4 flex w-full max-w-[300px] flex-col gap-1.5">
            {phase >= 2 && (
              <>
                <motion.div initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center justify-between rounded-md border border-line bg-night-2 px-3 py-2">
                  <span className="text-title font-extrabold text-mint">XP</span>
                  <span className="font-mono text-mono-m font-bold text-mint">+<CountUp to={payload.xpEarned} /></span>
                </motion.div>
                <motion.div initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="flex items-center justify-between rounded-md border border-line bg-night-2 px-3 py-2">
                  <span className="text-title font-extrabold text-gold">GEARS</span>
                  <span className="font-mono text-mono-m font-bold text-gold">+<CountUp to={payload.gearsEarned} /></span>
                </motion.div>
                {!payload.firstClear && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-caption font-extrabold uppercase text-low">
                    replay pays light — practice pays off
                  </motion.p>
                )}
              </>
            )}
          </div>

          {/* ---------- XP bar ---------- */}
          {phase >= 3 && (
            <XpSection payload={payload} lvlAfter={lvlAfter} leveledUp={leveledUp} ratioTo={ratioTo} />
          )}

          {/* ---------- level-up interlude ---------- */}
          <AnimatePresence>
            {leveledUp && phase >= 3 && phase < 5 && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.2, opacity: 0 }}
                transition={pop}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-night-0/80 backdrop-blur-sm"
              >
                <Sparkles size={32} className="mb-2 text-gold" />
                <p className="font-display text-[28px] text-gold" style={{ textShadow: '0 0 20px rgba(255,209,102,.6)' }}>
                  LEVEL UP!
                </p>
                <p className="mt-1 text-h2 font-black text-hi">LV {lvlAfter} · {selectPlayerTitle(lvlAfter)}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ---------- chapter complete ---------- */}
          {payload.chapterComplete && phase >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="z-10 mt-5 flex w-full max-w-[320px] flex-col items-center gap-3 rounded-xl border border-line bg-night-2 p-4"
            >
              <div className="relative h-[86px] w-[128px] overflow-hidden rounded-lg border-2" style={{ borderColor: 'var(--amber)' }}>
                <img src={ZONE_IMG[payload.chapter]} alt={chapterName(payload.levelId)} className="h-full w-full object-cover" draggable={false} />
              </div>
              <CardsFan chapter={payload.chapter} />
              {badge && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ ...pop, delay: 0.4 }} className="flex items-center gap-2">
                  <img src={badge.img} alt={badge.name} className="h-12 w-12" draggable={false} />
                  <div>
                    <p className="text-caption font-extrabold uppercase text-low">badge earned</p>
                    <p className="text-title font-extrabold text-gold">{badge.name}</p>
                  </div>
                </motion.div>
              )}
              {payload.firstClear && (
                <Chip tone="gold">chapter bonus · +100 XP · +50 gears</Chip>
              )}
            </motion.div>
          )}

          {/* ---------- concept card unlock ---------- */}
          {phase >= 4 && (card || payload.cardDuplicate) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="z-10 mt-5 flex flex-col items-center gap-2">
              <p className="text-caption font-extrabold uppercase tracking-widest text-low">
                <Chip tone={tone}>concept card unlocked</Chip>
              </p>
              {card && <ConceptCardFlip card={card} />}
              {payload.cardDuplicate && !card && <Chip tone="gold">duplicate → +5 gears</Chip>}
            </motion.div>
          )}

          {/* ---------- buttons ---------- */}
          {phase >= 5 && (
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={pop}
              className="z-10 mt-6 flex w-full max-w-[300px] flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <NeonButton onClick={() => navigate(payload.chapterComplete ? '/map' : nextTo)}>
                {payload.chapterComplete ? 'Next chapter' : 'Next level'} <ChevronRight size={18} />
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => navigate(replayTo)}>
                <RotateCcw size={18} /> Replay
              </NeonButton>
              <NeonButton variant="ghost" onClick={() => navigate('/map')}>
                <MapIcon size={18} /> Map
              </NeonButton>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}


/* ---------------- XP bar with fill tween + level-up reset ---------------- */
function XpSection({
  payload,
  lvlAfter,
  leveledUp,
  ratioTo,
}: {
  payload: ResultPayload
  lvlAfter: number
  leveledUp: boolean
  ratioTo: number
}) {
  const [ratio, setRatio] = useState(() => selectXpIntoLevel(payload.xpBefore) / 100)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const timers: number[] = []
    if (leveledUp) {
      timers.push(window.setTimeout(() => setRatio(1), 250))
      timers.push(
        window.setTimeout(() => {
          setRatio(ratioTo)
          setDone(true)
        }, 1350),
      )
    } else {
      timers.push(
        window.setTimeout(() => {
          setRatio(ratioTo)
          setDone(true)
        }, 250),
      )
    }
    return () => timers.forEach(clearTimeout)
  }, [leveledUp, ratioTo])
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="z-10 mt-4 w-full max-w-[300px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-caption font-extrabold uppercase text-low">
          LV {lvlAfter} · {selectPlayerTitle(lvlAfter)}
        </span>
        <span className="font-mono text-mono-s font-bold text-low">
          {done ? selectXpIntoLevel(payload.xpAfter) : selectXpIntoLevel(payload.xpBefore)}/100
        </span>
      </div>
      <XpBar ratio={ratio} shimmer={done} />
    </motion.div>
  )
}
