import { asset } from '@/lib/asset'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Check } from 'lucide-react'
import {
  GridBackdrop,
  NeonButton,
  Chip,
  XpBar,
  BottomSheet,
  Toast,
} from '@gridverse/kit/ui'
import { haptics, sfx, cn } from '@gridverse/kit/lib'
import {
  useGameStore,
  selectTotalStars,
  selectHasAnyProgress,
  selectPlayerLevel,
  selectXpIntoLevel,
  selectPlayerTitle,
  chapterName,
} from '@/store/gameStore'

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

const logoPop = { type: 'spring', stiffness: 420, damping: 24 } as const

function LogoMark({
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
          transition={stagger ? { ...logoPop, delay: 0.4 + i * 0.06 } : undefined}
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
        transition={stagger ? { ...logoPop, delay: 0.78 } : undefined}
        style={{ transformOrigin: '156px 96px' }}
      />
    </svg>
  )
}

/**
 * Home / Title screen — home.md. The arcade attract mode: animated grid
 * horizon, Vex idle, big PLAY, daily puzzle card, streak strip.
 * Route `/` · no TopBar · BottomNav (Home active) comes from Layout.
 */

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const
const outExpo = [0.16, 1, 0.3, 1] as [number, number, number, number]
const inOut = [0.65, 0, 0.35, 1] as [number, number, number, number]

function msToMidnight(): number {
  const now = new Date()
  const mid = new Date(now)
  mid.setHours(24, 0, 0, 0)
  return mid.getTime() - now.getTime()
}
function fmtCountdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
const today = () => new Date().toISOString().slice(0, 10)

const MECHANICS = ['arrow chains', 'wind mixing', 'warp levers', 'tandem machines', 'unmoved paths', 'rewind rifts']

export default function Home() {
  const navigate = useNavigate()
  // first visit decides the orchestrated entrance (repeat visits: 300ms fade)
  const firstVisit = useRef(!useGameStore.getState().visited).current
  const mountTime = useRef(performance.now())

  const streakDays = useGameStore((s) => s.streakDays)
  const xp = useGameStore((s) => s.xp)
  const levels = useGameStore((s) => s.levels)
  const currentLevel = useGameStore((s) => s.currentLevel)
  const resumeLevel = useGameStore((s) => s.resumeLevel)
  const dailyLastCompleted = useGameStore((s) => s.dailyLastCompleted)
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)

  const totalStars = selectTotalStars({ levels })
  const hasProgress = selectHasAnyProgress({ levels })
  const playerLevel = selectPlayerLevel(xp)
  const playerTitle = selectPlayerTitle(playerLevel)
  const xpRatio = selectXpIntoLevel(xp) / 100
  const dailyDone = dailyLastCompleted === today()

  const [ff, setFf] = useState(false) // fast-forward entrances on early tap
  const [zooming, setZooming] = useState(false)
  const [dailyOpen, setDailyOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(() => fmtCountdown(msToMidnight()))
  const [spins, setSpins] = useState(0)
  const [inflated, setInflated] = useState(false)
  const [landed, setLanded] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  useEffect(() => {
    useGameStore.getState().touchStreak()
    useGameStore.getState().markVisited()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setCountdown(fmtCountdown(msToMidnight())), 30_000)
    return () => clearInterval(t)
  }, [])

  /** transition helper — fast-forward / repeat visits collapse to a 300ms fade */
  const tr = (delay: number, dur = 0.5) =>
    ff || !firstVisit ? { duration: 0.3 } : { delay, duration: dur, ease: outExpo }

  const handleRootPointerDown = () => {
    if (firstVisit && !ff && performance.now() - mountTime.current < 1200) setFf(true)
  }

  // ---- Vex interactions: tap = spin + squeak, long-press (400ms) = inflate + purr
  const vexPointerDown = () => {
    longPressed.current = false
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      setInflated(true)
      haptics.purr()
    }, 400)
  }
  const vexPointerUp = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    setInflated(false)
    if (!longPressed.current) {
      setSpins((s) => s + 1)
      sfx.squeak()
      haptics.tick()
    }
    longPressed.current = false
  }

  // ---- CTA: zoom toward the button, then route (home.md §3)
  const ctaTarget = resumeLevel ? `/play?level=${resumeLevel}` : hasProgress ? '/map' : '/play?level=1-1'
  const handlePlay = () => {
    sfx.warp()
    setZooming(true)
    setTimeout(() => navigate(ctaTarget), 450)
  }

  const mechanic = MECHANICS[new Date().getDate() % MECHANICS.length]

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      onPointerDown={handleRootPointerDown}
    >
      {/* Section 1 — animated backdrop */}
      <img
        src={asset('nebula-bg.png')}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      />
      {reduceMotion ? (
        <img
          src={asset('grid-horizon.png')}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-3/4 w-full object-cover opacity-80"
        />
      ) : (
        <GridBackdrop />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 animate-breathe bg-[radial-gradient(ellipse_at_50%_62%,rgba(255,176,32,0.12),transparent_55%)]"
      />

      {/* content */}
      <div className="relative z-10 flex flex-1 flex-col px-4">
        {/* Section 2 — logo & mascot */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={tr(0, 0.4)}
          className="flex flex-col items-center pt-[calc(env(safe-area-inset-top)+56px)]"
        >
          <div className="relative">
            <div className={cn(!reduceMotion && 'animate-pulse-glow')}>
              <LogoMark width={240} stagger={firstVisit && !ff} />
            </div>
            {/* Vex floats right of the logo, overlapping its baseline, tilted −6° */}
            <motion.div
              initial={firstVisit && !ff ? { y: -120, opacity: 0 } : { opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={
                ff || !firstVisit ? { duration: 0.3 } : { ...pop, delay: 0.8 }
              }
              onAnimationComplete={() => {
                if (!landed) {
                  setLanded(true)
                  haptics.tick()
                  sfx.snap()
                }
              }}
              className="absolute -bottom-3 -right-14"
            >
              <motion.div
                animate={{ rotate: spins * 360 - 6, scale: inflated ? 1.15 : 1 }}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <motion.img
                  src={asset('mascot-vex.png')}
                  alt="Vex, your arrow-spark buddy"
                  width={96}
                  height={96}
                  draggable={false}
                  animate={reduceMotion ? undefined : { y: [-6, 6, -6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  onPointerDown={vexPointerDown}
                  onPointerUp={vexPointerUp}
                  onPointerLeave={() => {
                    if (pressTimer.current) clearTimeout(pressTimer.current)
                    setInflated(false)
                  }}
                  className="h-24 w-24 cursor-pointer select-none"
                />
              </motion.div>
              {/* landing spark burst */}
              <AnimatePresence>
                {landed && firstVisit && !ff && (
                  <>
                    {Array.from({ length: 6 }, (_, i) => {
                      const a = (i / 6) * Math.PI * 2
                      return (
                        <motion.span
                          key={i}
                          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                          animate={{ opacity: 0, x: Math.cos(a) * 26, y: Math.sin(a) * 26, scale: 0.3 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.5, ease: outExpo }}
                          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber shadow-glow-amber"
                        />
                      )
                    })}
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={tr(0.7, 0.3)}
            className="mt-3 text-caption font-extrabold uppercase text-mid [@media(max-height:640px)]:hidden"
          >
            Tiny arrows. Big adventures.
          </motion.p>
        </motion.div>

        {/* Section 3 — primary CTA */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={tr(0.9)}>
            <NeonButton
              ariaLabel="Play VECTO"
              onClick={handlePlay}
              className={cn('h-16 w-60 text-h2 font-black', !reduceMotion && 'animate-pulse-glow')}
            >
              <motion.svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden
                animate={reduceMotion ? undefined : { x: [0, 4, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <use href={asset('icons-game.svg#i-unit-arrow')} />
              </motion.svg>
              {hasProgress ? 'CONTINUE' : 'PLAY'}
            </NeonButton>
          </motion.div>
          {hasProgress && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tr(1.0, 0.3)}>
              {resumeLevel ? (
                <Chip tone="mint">RESUME LV {resumeLevel}</Chip>
              ) : (
                <Chip tone="cyan">
                  LV {currentLevel} · {chapterName(currentLevel).toUpperCase()}
                </Chip>
              )}
            </motion.div>
          )}
        </div>

        {/* Section 4 — Daily Drift card */}
        <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={tr(1.05)}>
          <button
            type="button"
            aria-label="Open Daily Drift puzzle"
            onClick={() => {
              haptics.tick()
              sfx.whoosh()
              setDailyOpen(true)
            }}
            className="relative flex h-24 w-full items-center gap-3 rounded-lg border border-line bg-night-2 p-3 text-left shadow-panel [@media(max-height:640px)]:h-20"
          >
            <span className="relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-sm border border-gold/70">
              <img
                src={asset('daily-drift.png')}
                alt="Vex surfing a comet across the grid"
                className={cn('h-full w-full object-cover', dailyDone && 'saturate-[0.6]')}
              />
              {!dailyDone && !reduceMotion && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-gold/25 to-transparent"
                  animate={{ x: ['-120%', '240%'] }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 3.2, ease: 'easeOut' }}
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-caption font-extrabold uppercase text-gold">Daily Drift</span>
              <span className="truncate text-title font-extrabold text-hi">One grid. One puzzle.</span>
              <span className="text-caption uppercase text-low">
                {dailyDone ? 'Done! Come back tomorrow.' : `Resets in ${countdown}`}
              </span>
            </span>
            {dailyDone ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Check className="h-5 w-5" />
              </span>
            ) : (
              <Chip tone="gold" className="shrink-0">
                +40
              </Chip>
            )}
          </button>
        </motion.div>

        {/* Section 5 — streak & progress strip */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={ff || !firstVisit ? { duration: 0.3 } : { ...pop, delay: 1.15 }}
          className="mb-3 mt-3 grid h-14 grid-cols-3 divide-x divide-line rounded-lg border border-line bg-night-2/80"
        >
          <button
            type="button"
            aria-label="Day streak"
            onClick={() => setToast('Play daily to grow your streak!')}
            className="flex items-center justify-center gap-2"
          >
            <Flame
              className={cn('h-5 w-5', streakDays > 0 ? 'animate-flicker text-coral' : 'text-low')}
            />
            <span className="font-mono text-mono-m font-bold text-hi">{streakDays}</span>
            <span className="text-caption font-extrabold uppercase text-low">Day streak</span>
          </button>
          <button
            type="button"
            aria-label="Total stars"
            onClick={() => navigate('/profile')}
            className="flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M12 3.5 l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-2.9-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z"
                fill="#FFD166"
                style={{ filter: 'drop-shadow(0 0 4px rgba(255,209,102,.6))' }}
              />
            </svg>
            <span className="font-mono text-mono-m font-bold text-hi">{totalStars}</span>
            <span className="text-caption font-extrabold uppercase text-low">Stars</span>
          </button>
          <button
            type="button"
            aria-label="Player level"
            onClick={() => navigate('/profile')}
            className="flex items-center justify-center gap-2 px-2"
          >
            <XpBar ratio={xpRatio} className="w-10 shrink-0" />
            <span className="font-mono text-mono-m font-bold text-mint">LV {playerLevel}</span>
            <span className="truncate text-caption font-extrabold uppercase text-low">{playerTitle}</span>
          </button>
        </motion.div>
      </div>

      {/* CTA zoom exit (home.md §3 — screen zooms toward the button) */}
      <AnimatePresence>
        {zooming && (
          <motion.div
            key="zoom"
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 8, opacity: 1 }}
            transition={{ duration: 0.45, ease: inOut }}
            className="pointer-events-none fixed inset-0 z-50 m-auto h-40 w-40 rounded-full bg-[radial-gradient(circle,#FFB020_0%,#0B1220_70%)]"
          />
        )}
      </AnimatePresence>

      {/* Daily Drift sheet */}
      <BottomSheet open={dailyOpen} onClose={() => setDailyOpen(false)} ariaLabel="Daily Drift puzzle">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-h2 font-black text-hi">Daily Drift</h2>
            <Chip tone="gold">+40 gears</Chip>
          </div>
          <div className="overflow-hidden rounded-md border border-line">
            <img src={asset('daily-drift.png')} alt="" className="h-28 w-full object-cover" />
          </div>
          <p className="text-body font-semibold text-mid">
            One grid. One puzzle. Today's drift uses {mechanic}.
          </p>
          <p className="text-caption font-extrabold uppercase text-low">
            {streakDays}-day streak · next milestone +100 at 5
          </p>
          <div className="flex items-center gap-2 pt-1">
            <NeonButton className="flex-1" onClick={() => navigate('/play?daily=1')}>
              Play Daily
            </NeonButton>
            <NeonButton variant="ghost" onClick={() => setDailyOpen(false)}>
              Later
            </NeonButton>
          </div>
        </div>
      </BottomSheet>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
