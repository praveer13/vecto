import { asset } from '@/lib/asset'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { Check, ChevronRight, Flame, Pencil, RotateCcw, Settings } from 'lucide-react'
import { TopBar, BottomSheet, NeonButton, Chip, GearCounter, Toast } from '@gridverse/kit/ui'
import CodexSection from '@/pages/CodexSection'
import {
  useGameStore,
  selectPlayerLevel,
  selectXpIntoLevel,
  selectPlayerTitle,
  selectTotalStars,
} from '@/store/gameStore'
import {
  BADGES,
  SKINS,
  TRAILS,
  ZONES,
  countCleared,
  currentChapter,
  TOTAL_STARS,
} from '@/lib/content'
import type { BadgeMeta, SkinMeta, TrailMeta } from '@/lib/content'
import { haptics, sfx, cn } from '@gridverse/kit/lib'

/**
 * Profile — route /profile (profile.md). The trophy room: player header with
 * level ring + editable callsign, stats grid, 9 enamel badges with detail
 * sheets, the Concept Codex (shared CodexSection at #codex), and the Vex
 * Style shop (skins from the store, trails persisted locally — see report).
 * Anchors: #stats #badges #codex #style. Deep link: /profile?ch=3#codex.
 */

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const
const outExpo = [0.16, 1, 0.3, 1] as [number, number, number, number]
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'

const SKIN_SRC: Record<string, string> = Object.fromEntries(SKINS.map((s) => [s.id, s.img]))

const CALLSIGN_KEY = 'vecto-callsign'
const TRAILS_OWNED_KEY = 'vecto-trails-owned'
const TRAIL_ACTIVE_KEY = 'vecto-trail-active'
const BADGES_SEEN_KEY = 'vecto-badges-seen'

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}
const saveJSON = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

/* ---------------- scroll reveal + count-up ---------------- */

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay, ease: outExpo }}
    >
      {children}
    </motion.div>
  )
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.8 })
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!inView) return
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 600)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [inView, value])
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString()}
    </span>
  )
}

/* ---------------- small perpetual burst (purchase confetti) ---------------- */

/** deterministic pseudo-random (render-pure) from an index + salt */
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const Particles = memo(function Particles({ color }: { color: string }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        angle: (i / 16) * Math.PI * 2 + rnd(i, 1) * 0.5,
        dist: 40 + rnd(i, 2) * 70,
        size: 3 + rnd(i, 3) * 4,
        delay: rnd(i, 4) * 0.1,
      })),
    [],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: i % 3 === 0 ? '#FFD166' : color }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist, opacity: 0 }}
          transition={{ duration: 0.7, delay: p.delay, ease: outExpo }}
        />
      ))}
    </div>
  )
})

/* ---------------- trail preview canvas ---------------- */

const TrailPreview = memo(function TrailPreview({ trail, still }: { trail: string; still: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = 220
    const h = 120
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    let raf = 0

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2 + 6
      if (trail === 'comet') {
        for (let i = 0; i < 26; i++) {
          const p = (((t / 2600) % 1) - i * 0.014 + 1) % 1
          const a = p * Math.PI * 2
          ctx.globalAlpha = Math.max(0, 1 - i / 26) * 0.85
          ctx.fillStyle = '#FFD166'
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * 76, cy + Math.sin(a) * 26, Math.max(0.8, 3.6 - i * 0.12), 0, 7)
          ctx.fill()
        }
      } else if (trail === 'sparkler') {
        for (let i = 0; i < 20; i++) {
          const phase = (t / 900 + i * 0.37) % 1
          const a = i * 2.4 + Math.floor(t / 900 + i * 0.37) * 0.7
          ctx.globalAlpha = (1 - phase) * 0.9
          ctx.fillStyle = '#22D3EE'
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * 76 + Math.sin(i * 9) * 8, cy + Math.sin(a) * 26 + Math.cos(i * 7) * 6, 1.8 * (1 - phase) + 0.6, 0, 7)
          ctx.fill()
        }
      } else if (trail === 'ribbon') {
        ctx.globalAlpha = 0.85
        ctx.strokeStyle = '#8B5CF6'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        for (let x = 14; x <= w - 14; x += 5) {
          const y = cy + Math.sin(x * 0.055 - t * 0.0042) * 16
          if (x === 14) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.globalAlpha = 0.3
        ctx.lineWidth = 7
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [trail, still])

  if (trail === 'none') return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ width: 220, height: 120, position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)' }}
    />
  )
})

/* ---------------- the page ---------------- */

export default function Profile() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const xp = useGameStore((s) => s.xp)
  const gears = useGameStore((s) => s.gears)
  const streakDays = useGameStore((s) => s.streakDays)
  const levels = useGameStore((s) => s.levels)
  const ownedCards = useGameStore((s) => s.cards)
  const ownedBadges = useGameStore((s) => s.badges)
  const ownedSkins = useGameStore((s) => s.skins)
  const activeSkin = useGameStore((s) => s.activeSkin)
  const addGears = useGameStore((s) => s.addGears)
  const unlockSkin = useGameStore((s) => s.unlockSkin)
  const setActiveSkin = useGameStore((s) => s.setActiveSkin)
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)

  const playerLevel = selectPlayerLevel(xp)
  const xpRatio = selectXpIntoLevel(xp) / 100
  const title = selectPlayerTitle(playerLevel)
  const totalStars = selectTotalStars({ levels })
  const cleared = countCleared(levels)
  const chapter = currentChapter(levels)
  const zone = ZONES[chapter - 1]
  const newPlayer = cleared === 0

  const [callsign, setCallsign] = useState(() => loadJSON<string>(CALLSIGN_KEY, 'PLAYER ONE'))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(callsign)
  const [savedTick, setSavedTick] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const [badgeSheet, setBadgeSheet] = useState<BadgeMeta | null>(null)
  const [spinBadge, setSpinBadge] = useState<string | null>(null)

  // style shop state
  const [previewSkin, setPreviewSkin] = useState(activeSkin)
  const [ownedTrails, setOwnedTrails] = useState<string[]>(() => loadJSON(TRAILS_OWNED_KEY, ['none']))
  const [activeTrail, setActiveTrail] = useState(() => loadJSON(TRAIL_ACTIVE_KEY, 'none'))
  const [previewTrail, setPreviewTrail] = useState(activeTrail)
  const [buyItem, setBuyItem] = useState<{ kind: 'skin'; meta: SkinMeta } | { kind: 'trail'; meta: TrailMeta } | null>(null)
  const [shakeItem, setShakeItem] = useState<string | null>(null)
  const [confettiKey, setConfettiKey] = useState(0)

  /* ----- deep links: hash scroll + codex tab preselect ----- */
  const codexChapter = useMemo(() => {
    const ch = Number(searchParams.get('ch'))
    return ch >= 1 && ch <= 6 ? ch : 0
  }, [searchParams])

  useEffect(() => {
    if (!location.hash) return
    const id = location.hash.slice(1)
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ----- newly earned badges → spin + toast (results routes here) ----- */
  useEffect(() => {
    const seen = loadJSON<string[]>(BADGES_SEEN_KEY, [])
    const fresh = ownedBadges.filter((b) => !seen.includes(b))
    if (fresh.length === 0) return
    saveJSON(BADGES_SEEN_KEY, [...seen, ...fresh])
    const meta = BADGES.find((b) => b.id === fresh[fresh.length - 1])
    if (!meta) return
    const t = setTimeout(() => {
      setSpinBadge(meta.id)
      setToast(`Badge earned: ${meta.name}!`)
      haptics.star()
      sfx.win()
    }, 700)
    return () => clearTimeout(t)
  }, [ownedBadges])

  /* ----- callsign ----- */
  const saveCallsign = () => {
    const clean = draft.toUpperCase().replace(/[^A-Z0-9 \-_]/g, '').slice(0, 12).trim() || 'PLAYER ONE'
    setCallsign(clean)
    saveJSON(CALLSIGN_KEY, clean)
    setEditing(false)
    setSavedTick(true)
    setTimeout(() => setSavedTick(false), 1200)
    sfx.snap()
    haptics.tick()
  }

  /* ----- shop ----- */
  const tapSkin = (skin: SkinMeta) => {
    setPreviewSkin(skin.id)
    haptics.tick()
    sfx.tick()
    if (ownedSkins.includes(skin.id)) {
      setActiveSkin(skin.id)
      sfx.snap()
      return
    }
    if (gears >= skin.price) {
      setBuyItem({ kind: 'skin', meta: skin })
      sfx.whoosh()
    } else {
      setShakeItem(skin.id)
      setToast(`Need ${skin.price - gears} more gears — Daily Drift pays 40!`)
      haptics.error()
      sfx.error()
    }
  }

  const tapTrail = (trail: TrailMeta) => {
    setPreviewTrail(trail.id)
    haptics.tick()
    sfx.tick()
    if (ownedTrails.includes(trail.id)) {
      setActiveTrail(trail.id)
      saveJSON(TRAIL_ACTIVE_KEY, trail.id)
      sfx.snap()
      return
    }
    if (gears >= trail.price) {
      setBuyItem({ kind: 'trail', meta: trail })
      sfx.whoosh()
    } else {
      setShakeItem(trail.id)
      setToast(`Need ${trail.price - gears} more gears — Daily Drift pays 40!`)
      haptics.error()
      sfx.error()
    }
  }

  const confirmBuy = () => {
    if (!buyItem) return
    const { kind, meta } = buyItem
    if (gears < meta.price) return
    addGears(-meta.price)
    if (kind === 'skin') {
      unlockSkin(meta.id)
      setActiveSkin(meta.id)
    } else {
      const next = [...ownedTrails, meta.id]
      setOwnedTrails(next)
      saveJSON(TRAILS_OWNED_KEY, next)
      setActiveTrail(meta.id)
      saveJSON(TRAIL_ACTIVE_KEY, meta.id)
    }
    setBuyItem(null)
    setConfettiKey((k) => k + 1)
    setToast(`${meta.name} ${kind === 'skin' ? 'Vex' : 'trail'} equipped!`)
    haptics.star()
    sfx.win()
  }

  const ringC = 2 * Math.PI * 40

  const statTiles = [
    { label: 'LEVELS CLEARED', value: cleared, color: '#3DFFA2', flavor: `${cleared} levels down — the Gridverse bows.` },
    { label: 'STARS', value: totalStars, suffix: `/${TOTAL_STARS}`, color: '#FFD166', flavor: `${totalStars} stars banked. ${TOTAL_STARS} make a full sky.` },
    { label: 'CONCEPT CARDS', value: ownedCards.length, suffix: '/18', color: '#8B5CF6', flavor: `${ownedCards.length} of 18 Nerd Notes collected.` },
    { label: 'BEST STREAK', value: streakDays, suffix: streakDays === 1 ? ' DAY' : ' DAYS', color: '#FF6B4A', flavor: `${streakDays}-day streak. Vex approves.` },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        title="PLAYER ONE"
        gears={gears}
        avatarSrc={asset('mascot-vex.png')}
        level={playerLevel}
        onProfile={() => navigate('/profile')}
        onSettings={() => navigate('/settings')}
      />

      <main className="flex flex-1 flex-col gap-7 px-4 py-4">
        {/* ============ Section 1 — Player Header ============ */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: outExpo }}
          className="flex items-center gap-4 rounded-lg border border-line bg-night-2 p-5 shadow-panel"
        >
          {/* avatar + level ring */}
          <button
            type="button"
            aria-label="Open Vex style shop"
            onClick={() => document.getElementById('style')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })}
            className="relative h-24 w-24 shrink-0"
          >
            <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="#182642" strokeWidth="3" />
              <motion.circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="#FFD166"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={ringC}
                initial={{ strokeDashoffset: ringC }}
                animate={{ strokeDashoffset: ringC * (1 - xpRatio) }}
                transition={{ duration: 0.9, delay: 0.3, ease: outExpo }}
                style={{ filter: 'drop-shadow(0 0 6px rgba(255,209,102,.6))' }}
              />
            </svg>
            <img
              src={SKIN_SRC[activeSkin] ?? asset('mascot-vex.png')}
              alt="Vex avatar"
              className={cn('absolute inset-0 m-auto h-[72px] w-[72px] rounded-full', !reduceMotion && 'animate-bob')}
            />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-pill bg-gold px-1.5 font-mono text-mono-s font-bold text-night-0">
              {playerLevel}
            </span>
          </button>

          {/* middle stack */}
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={draft}
                  maxLength={12}
                  onChange={(e) => setDraft(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveCallsign()
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  aria-label="Edit callsign"
                  className="h-10 w-full min-w-0 rounded-sm border border-cyan bg-night-1 px-2 text-h2 font-black uppercase text-hi outline-none"
                />
                <button
                  type="button"
                  aria-label="Save callsign"
                  onClick={saveCallsign}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mint/50 bg-mint/10 text-mint"
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-h2 font-black uppercase text-hi">{callsign}</h2>
                <button
                  type="button"
                  aria-label="Edit callsign"
                  onClick={() => {
                    setDraft(callsign)
                    setEditing(true)
                    haptics.tick()
                    sfx.tick()
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-low"
                >
                  {savedTick ? <Check className="h-4 w-4 text-mint" /> : <Pencil className="h-4 w-4" />}
                </button>
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Chip tone="mint">{title}</Chip>
              <span className="flex items-center gap-1 text-caption font-extrabold uppercase text-coral">
                <Flame className="h-3.5 w-3.5" /> STREAK {streakDays}
              </span>
            </div>
          </div>

          {/* chapter emblem */}
          <button
            type="button"
            aria-label={`Current chapter: ${zone.name} — open map there`}
            onClick={() => navigate(`/map?zone=${chapter}`)}
            className="relative h-12 w-12 shrink-0"
            style={{ filter: `drop-shadow(0 0 8px ${zone.accent}66)` }}
          >
            <img src={zone.vignette} alt="" className="h-full w-full object-cover" style={{ clipPath: HEX_CLIP }} />
          </button>
        </motion.section>

        {/* ============ Section 2 — Stats ============ */}
        <section id="stats" className="scroll-mt-16">
          <Reveal>
            <h2 className="mb-3 px-1 text-h2 font-black text-hi">STATS</h2>
            <div className="grid grid-cols-2 gap-3">
              {statTiles.map((t, i) => (
                <motion.button
                  key={t.label}
                  type="button"
                  onClick={() => setToast(t.flavor)}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.4, delay: i * 0.06, ease: outExpo }}
                  className="flex h-24 flex-col items-start justify-between rounded-md border border-line bg-night-2 p-3 text-left"
                >
                  <span className="text-caption font-extrabold uppercase text-low">{t.label}</span>
                  <span className="font-display text-[28px] leading-none" style={{ color: t.color }}>
                    <CountUp value={t.value} />
                    {t.suffix && <span className="ml-0.5 text-[16px] text-mid">{t.suffix}</span>}
                  </span>
                </motion.button>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ============ Section 3 — Badges ============ */}
        <section id="badges" className="scroll-mt-16">
          <Reveal>
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-h2 font-black text-hi">BADGES</h2>
              <Chip tone="gold">{ownedBadges.length}/9</Chip>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-4">
              {BADGES.map((b, i) => {
                const earned = ownedBadges.includes(b.id)
                const cryptic = b.hidden && !earned
                return (
                  <motion.button
                    key={b.id}
                    type="button"
                    aria-label={earned ? `Badge: ${b.name}. ${b.criteria}` : cryptic ? 'Hidden badge, locked' : `Locked badge: ${b.name}. ${b.hint}`}
                    onClick={() => {
                      setBadgeSheet(b)
                      haptics.tick()
                      sfx.tick()
                    }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ ...pop, delay: i * 0.04 }}
                    className="flex min-h-[44px] flex-col items-center gap-1.5"
                  >
                    <motion.span
                      className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                      animate={spinBadge === b.id ? { rotate: [0, 720] } : { rotate: 0 }}
                      transition={{ duration: 0.8, ease: outExpo }}
                      onAnimationComplete={() => {
                        if (spinBadge === b.id) setSpinBadge(null)
                      }}
                    >
                      <img
                        src={`/badges/${b.id}.svg`}
                        alt=""
                        className={cn('h-16 w-16', !earned && 'opacity-30 grayscale')}
                      />
                      {!earned && (
                        <span className="absolute inset-0 flex items-center justify-center font-display text-h2 text-low">?</span>
                      )}
                      {earned && !reduceMotion && (
                        <motion.span
                          aria-hidden
                          className="absolute inset-y-0 w-1/3 bg-white/25"
                          style={{ skewX: -18 }}
                          animate={{ x: ['-160%', '320%'] }}
                          transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 5.2, ease: 'easeOut' }}
                        />
                      )}
                    </motion.span>
                    <span className={cn('text-center text-caption font-extrabold uppercase leading-tight', earned ? 'text-mid' : 'text-low')}>
                      {cryptic ? '???' : b.name}
                    </span>
                  </motion.button>
                )
              })}
            </div>
            {newPlayer && (
              <p className="mt-3 text-center text-body font-semibold text-low">Your trophies live here.</p>
            )}
          </Reveal>
        </section>

        {/* ============ Section 4 — Concept Codex ============ */}
        <section id="codex" className="scroll-mt-16">
          <Reveal>
            <CodexSection initialChapter={codexChapter} />
          </Reveal>
        </section>

        {/* ============ Section 5 — Vex Style ============ */}
        <section id="style" className="scroll-mt-16">
          <Reveal>
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-h2 font-black text-hi">VEX STYLE</h2>
              <span className="rounded-sm border border-line bg-night-2 px-2 py-1">
                <GearCounter count={gears} />
              </span>
            </div>

            {/* preview stage */}
            <div className="relative mb-4 flex h-52 flex-col items-center justify-end overflow-hidden rounded-lg border border-line bg-night-2">
              <TrailPreview trail={previewTrail} still={reduceMotion} />
              {/* rotating pedestal ring */}
              <motion.svg
                viewBox="0 0 160 40"
                className="absolute bottom-6 h-10 w-40"
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
                aria-hidden
              >
                <ellipse cx="80" cy="20" rx="70" ry="14" fill="none" stroke="#223354" strokeWidth="2" strokeDasharray="6 8" />
              </motion.svg>
              <div className="absolute bottom-8 h-2 w-32 rounded-full bg-cyan/10 blur-sm" aria-hidden />
              <AnimatePresence mode="wait">
                <motion.img
                  key={previewSkin}
                  src={SKIN_SRC[previewSkin] ?? asset('mascot-vex.png')}
                  alt={`Vex preview — ${SKINS.find((s) => s.id === previewSkin)?.name ?? 'Default'}`}
                  className="relative mb-6 h-32 w-32"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.15 } }}
                  transition={pop}
                />
              </AnimatePresence>
              {confettiKey > 0 && <Particles key={confettiKey} color="#3DFFA2" />}
              <span className="absolute left-3 top-3">
                <Chip tone={previewSkin === activeSkin ? 'mint' : 'cyan'}>
                  {previewSkin === activeSkin ? 'EQUIPPED' : 'PREVIEW'}
                </Chip>
              </span>
            </div>

            {/* skins carousel */}
            <p className="mb-2 px-1 text-caption font-extrabold uppercase text-low">Skins</p>
            <div className="no-scrollbar -mx-4 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
              {SKINS.map((s) => {
                const owned = ownedSkins.includes(s.id)
                const equipped = activeSkin === s.id
                const previewing = previewSkin === s.id
                return (
                  <motion.button
                    key={s.id}
                    type="button"
                    aria-label={
                      equipped
                        ? `${s.name} Vex, equipped`
                        : owned
                          ? `${s.name} Vex, owned — tap to equip`
                          : `${s.name} Vex, ${s.price} gears`
                    }
                    onClick={() => tapSkin(s)}
                    animate={shakeItem === s.id ? { rotate: [0, -6, 6, -4, 4, 0] } : { rotate: 0 }}
                    transition={{ duration: 0.3 }}
                    onAnimationComplete={() => {
                      if (shakeItem === s.id) setShakeItem(null)
                    }}
                    className={cn(
                      'flex w-24 shrink-0 snap-start flex-col items-center gap-1.5 rounded-md border bg-night-2 p-2.5',
                      previewing ? 'border-cyan shadow-glow-cyan' : 'border-line',
                    )}
                  >
                    <img src={s.img} alt="" className="h-16 w-16" />
                    <span className="text-caption font-extrabold uppercase text-mid">{s.name}</span>
                    {equipped ? (
                      <Chip tone="mint">EQUIPPED</Chip>
                    ) : owned ? (
                      <span className="text-caption font-extrabold uppercase text-low">OWNED</span>
                    ) : (
                      <Chip tone="gold">
                        {s.price}
                        <svg width="11" height="11" aria-hidden>
                          <use href={asset('icons-game.svg#i-gear-currency')} />
                        </svg>
                      </Chip>
                    )}
                  </motion.button>
                )
              })}
            </div>

            {/* trails carousel */}
            <p className="mb-2 px-1 text-caption font-extrabold uppercase text-low">Trails</p>
            <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
              {TRAILS.map((t) => {
                const owned = ownedTrails.includes(t.id)
                const equipped = activeTrail === t.id
                const previewing = previewTrail === t.id
                return (
                  <motion.button
                    key={t.id}
                    type="button"
                    aria-label={
                      equipped
                        ? `${t.name} trail, equipped`
                        : owned
                          ? `${t.name} trail, owned — tap to equip`
                          : `${t.name} trail, ${t.price} gears`
                    }
                    onClick={() => tapTrail(t)}
                    animate={shakeItem === t.id ? { rotate: [0, -6, 6, -4, 4, 0] } : { rotate: 0 }}
                    transition={{ duration: 0.3 }}
                    onAnimationComplete={() => {
                      if (shakeItem === t.id) setShakeItem(null)
                    }}
                    className={cn(
                      'flex w-24 shrink-0 snap-start flex-col items-center gap-1.5 rounded-md border bg-night-2 p-2.5',
                      previewing ? 'border-cyan shadow-glow-cyan' : 'border-line',
                    )}
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-night-1">
                      {t.id === 'none' ? (
                        <RotateCcw className="h-6 w-6 text-low" aria-hidden />
                      ) : (
                        <span
                          className="h-8 w-8 rounded-full"
                          style={{ background: `radial-gradient(circle, ${t.color} 0%, transparent 70%)` }}
                        />
                      )}
                    </span>
                    <span className="text-caption font-extrabold uppercase text-mid">{t.name}</span>
                    {equipped ? (
                      <Chip tone="mint">EQUIPPED</Chip>
                    ) : owned ? (
                      <span className="text-caption font-extrabold uppercase text-low">OWNED</span>
                    ) : (
                      <Chip tone="gold">
                        {t.price}
                        <svg width="11" height="11" aria-hidden>
                          <use href={asset('icons-game.svg#i-gear-currency')} />
                        </svg>
                      </Chip>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </Reveal>
        </section>

        {/* ============ Section 6 — Footer row ============ */}
        <footer className="flex items-center justify-center gap-2 pb-2">
          <NeonButton variant="ghost" ariaLabel="Open settings" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" /> SETTINGS
          </NeonButton>
          <NeonButton variant="ghost" ariaLabel="Reset progress in settings" onClick={() => navigate('/settings#data')}>
            RESET PROGRESS <ChevronRight className="h-4 w-4" />
          </NeonButton>
        </footer>
      </main>

      {/* badge detail sheet */}
      <BottomSheet open={!!badgeSheet} onClose={() => setBadgeSheet(null)} ariaLabel={badgeSheet ? `Badge ${badgeSheet.name}` : undefined}>
        {badgeSheet && (
          <div className="flex flex-col items-center gap-3 pb-2 pt-1">
            <img
              src={`/badges/${badgeSheet.id}.svg`}
              alt=""
              className={cn('h-[120px] w-[120px]', !ownedBadges.includes(badgeSheet.id) && 'opacity-40 grayscale')}
            />
            <h2 className="text-h2 font-black text-hi">
              {badgeSheet.hidden && !ownedBadges.includes(badgeSheet.id) ? '???' : badgeSheet.name}
            </h2>
            <p className="max-w-[280px] text-center text-body font-semibold text-mid">
              {ownedBadges.includes(badgeSheet.id) ? badgeSheet.criteria : badgeSheet.hint}
            </p>
            <Chip tone={ownedBadges.includes(badgeSheet.id) ? 'mint' : 'neutral'}>
              {ownedBadges.includes(badgeSheet.id) ? 'EARNED' : 'LOCKED'}
            </Chip>
          </div>
        )}
      </BottomSheet>

      {/* purchase confirm sheet */}
      <BottomSheet open={!!buyItem} onClose={() => setBuyItem(null)} ariaLabel="Confirm purchase">
        {buyItem && (
          <div className="flex flex-col items-center gap-3 pb-2 pt-1">
            {buyItem.kind === 'skin' ? (
              <img src={(buyItem.meta as SkinMeta).img} alt="" className="h-24 w-24" />
            ) : (
              <span
                className="h-20 w-20 rounded-full"
                style={{ background: `radial-gradient(circle, ${buyItem.meta.color} 0%, transparent 70%)` }}
              />
            )}
            <h2 className="text-h2 font-black text-hi">
              {buyItem.meta.name} {buyItem.kind === 'skin' ? 'Vex' : 'Trail'}
            </h2>
            <div className="flex items-center gap-2">
              <Chip tone="gold">
                {buyItem.meta.price}
                <svg width="12" height="12" aria-hidden>
                  <use href={asset('icons-game.svg#i-gear-currency')} />
                </svg>
              </Chip>
              <span className="text-body font-semibold text-mid">
                Balance after: <span className="font-mono font-bold text-hi">{gears - buyItem.meta.price}</span>
              </span>
            </div>
            <NeonButton className="w-full" onClick={confirmBuy} ariaLabel={`Buy ${buyItem.meta.name}`}>
              BUY
            </NeonButton>
            <NeonButton variant="ghost" onClick={() => setBuyItem(null)} ariaLabel="Cancel purchase">
              Cancel
            </NeonButton>
          </div>
        )}
      </BottomSheet>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
