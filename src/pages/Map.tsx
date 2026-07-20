import { asset } from '@/lib/asset'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import type { AnimationPlaybackControls } from 'framer-motion'
import { Lock, X, Crosshair, Sparkles, ChevronUp, Skull, BookOpen } from 'lucide-react'
import { TopBar, BottomSheet, NeonButton, IconButton, Chip, StarMeter, Toast, XpBar } from '@gridverse/kit/ui'
import { useGameStore, selectPlayerLevel } from '@/store/gameStore'
import {
  ZONES,
  ZONE_LEVELS,
  CARDS,
  cardsForLevel,
  currentNodeId,
  finaleIdOf,
  isLevelUnlocked,
  zoneStars,
} from '@/lib/content'
import type { LevelMeta } from '@/lib/content'
import { haptics, sfx, cn } from '@gridverse/kit/lib'

/**
 * The Gridverse — world map (chapters.md). Route /map.
 * A ~4900px tall world in a custom momentum-pan viewport (no page scroll):
 * 6 zones stacked bottom-to-top (Ch1 at the bottom — you climb), 54 level
 * nodes (8 circles + 1 finale hex per zone) along an S-curve dashed path,
 * parallax nebula (0.5×) and zone vignettes (0.85×), zone gates, a boss
 * gate, level-preview BottomSheet deep-linking to /play?level=X, zone
 * accordions and a chapter-complete celebration overlay.
 *
 * Pan physics: drag with velocity tracking, momentum friction 0.94/frame,
 * edge rubber-banding (0.35 resistance) + spring settle. Double-tap or the
 * FAB recenters on the current node. Pan persists per session.
 */

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const
const gentle = { type: 'spring', stiffness: 180, damping: 22 } as const
const outExpo = [0.16, 1, 0.3, 1] as [number, number, number, number]
const outBack = [0.34, 1.56, 0.64, 1] as [number, number, number, number]

const ZONE_H = 700
const GATE_H = 64
const BOSS_GATE_H = 136
const TOP_PAD = 110
const BOTTOM_PAD = 220
const HEX_CLIP = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'

const TONES = ['mint', 'cyan', 'amber', 'violet', 'magenta', 'coral'] as const
const toneOf = (chapter: number) => TONES[chapter - 1]

/** gate (boundary above zone c, i.e. between chapter c-1 and c) heights */
const gateH = (boundaryChapter: number) => (boundaryChapter === 6 ? BOSS_GATE_H : GATE_H)

/** screen-top y of a zone inside the world (ch6 at the top, ch1 at bottom) */
function zoneTop(chapter: number): number {
  let y = TOP_PAD
  for (let k = 6; k > chapter; k--) y += ZONE_H + gateH(k)
  return y
}

const WORLD_H = zoneTop(1) + ZONE_H + BOTTOM_PAD

interface NodePos {
  meta: LevelMeta
  x: number
  y: number
  story: number // 0..53 bottom-to-top
}

/** catmull-rom → cubic bezier smooth path through points */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

const loadCelebrated = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem('vecto-map-celebrated') ?? '[]') as number[]
  } catch {
    return []
  }
}

/* ---------------- tiny memoized perpetuals ---------------- */

/** Vex hopping on the current node; long-press = spin + squeak */
const VexMarker = memo(function VexMarker({ still }: { still: boolean }) {
  const [spin, setSpin] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  return (
    <motion.img
      src={asset('mascot-vex.png')}
      alt="Vex is here"
      draggable={false}
      className="pointer-events-auto absolute -top-14 left-1/2 h-14 w-14 select-none"
      style={{ x: '-50%' }}
      animate={{ y: still ? 0 : [0, -9, 0], rotate: spin * 360 }}
      transition={{
        y: { duration: 1.2, repeat: still ? 0 : Infinity, ease: 'easeInOut' },
        rotate: gentle,
      }}
      onPointerDown={() => {
        clear()
        timer.current = setTimeout(() => {
          setSpin((s) => s + 1)
          sfx.squeak()
          haptics.purr()
        }, 400)
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
    />
  )
})

/** pulsing glow ring on the current node */
const CurrentRing = memo(function CurrentRing({ accent, size }: { accent: string; size: number }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full border-2"
      style={{ borderColor: accent, width: size, height: size }}
      animate={{ scale: [1, 1.22], opacity: [0.85, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
    />
  )
})

/** zone backdrop vignette with slow Ken-Burns drift (parallax layer) */
const ZoneVignette = memo(function ZoneVignette({
  src,
  top,
  still,
}: {
  src: string
  top: number
  still: boolean
}) {
  return (
    <div className="absolute inset-x-0" style={{ top }}>
      <motion.img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-60 w-full select-none object-cover opacity-70"
        style={{
          maskImage: 'linear-gradient(to bottom, black 45%, transparent 96%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 45%, transparent 96%)',
        }}
        animate={still ? undefined : { scale: [1, 1.045] }}
        transition={{ duration: 8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
      />
    </div>
  )
})

/** deterministic pseudo-random (render-pure) from an index + salt */
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** radial confetti/spark burst (celebrations, gate dissolve) */
const Burst = memo(function Burst({ colors, count = 24 }: { colors: string[]; count?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + rnd(i, 1) * 0.6,
        dist: 70 + rnd(i, 2) * 130,
        size: 3 + rnd(i, 3) * 5,
        color: colors[i % colors.length],
        delay: rnd(i, 4) * 0.12,
      })),
    [colors, count],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.8, delay: p.delay, ease: outExpo }}
        />
      ))}
    </div>
  )
})

/* ---------------- chapter-complete celebration ---------------- */

function ChapterCelebration({ chapter, onDone }: { chapter: number; onDone: () => void }) {
  const zone = ZONES[chapter - 1]
  const cards = CARDS.filter((c) => c.chapter === chapter)
  const title = `${zone.name.toUpperCase()} CLEARED!`

  useEffect(() => {
    sfx.win()
    haptics.star()
    const t1 = setTimeout(() => haptics.star(), 320)
    const t2 = setTimeout(() => haptics.star(), 640)
    const t = setTimeout(onDone, 2200)
    return () => {
      clearTimeout(t)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [onDone])

  return (
    <motion.div
      role="alertdialog"
      aria-label={`${zone.name} cleared!`}
      className="scrim fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onDone}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={pop}
        className="relative h-28 w-28"
        style={{ filter: `drop-shadow(0 0 24px ${zone.accent}80)` }}
      >
        <img
          src={zone.vignette}
          alt={`${zone.name} emblem`}
          className="h-full w-full object-cover"
          style={{ clipPath: HEX_CLIP }}
        />
      </motion.div>

      <h2 className="text-center font-display text-display-l" style={{ color: zone.accent, textShadow: `0 0 12px ${zone.accent}99` }}>
        {title.split('').map((ch, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0, y: -24, rotate: -6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ ...pop, delay: 0.15 + i * 0.035 }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </motion.span>
        ))}
      </h2>

      <div className="relative flex items-end justify-center">
        {cards.map((c, i) => (
          <motion.img
            key={c.id}
            src={c.img}
            alt={`Concept card: ${c.flavor}`}
            className="h-32 w-24 rounded-md border bg-night-2 object-cover shadow-panel"
            style={{ borderColor: `${zone.accent}66`, marginLeft: i > 0 ? -20 : 0, zIndex: i === 1 ? 2 : 1 }}
            initial={{ rotate: 0, y: 48, opacity: 0 }}
            animate={{ rotate: (i - 1) * 12, y: i === 1 ? -10 : 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5, ease: outBack }}
          />
        ))}
      </div>

      <Burst colors={[zone.accent, '#FFD166', '#EAF2FF']} count={32} />
      <p className="text-caption font-extrabold uppercase text-mid">Tap to keep climbing</p>
    </motion.div>
  )
}

/* ---------------- level preview sheet ---------------- */

function LevelSheet({
  level,
  onClose,
  onToast,
}: {
  level: LevelMeta | null
  onClose: () => void
  onToast: (msg: string) => void
}) {
  const navigate = useNavigate()
  const levels = useGameStore((s) => s.levels)
  const ownedCards = useGameStore((s) => s.cards)
  const zone = level ? ZONES[level.chapter - 1] : null
  const prog = level ? levels[level.id] : undefined
  const newCards = level ? cardsForLevel(level.id).filter((c) => !ownedCards.includes(c.id)) : []

  return (
    <BottomSheet open={!!level} onClose={onClose} ariaLabel={level ? `Level ${level.name}` : undefined}>
      {level && zone && (
        <div className="flex flex-col gap-3 pb-2">
          {/* Row 1 — chip + name + close */}
          <motion.div
            className="flex items-center justify-between gap-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.28, ease: outExpo }}
          >
            <div className="flex items-center gap-2">
              <Chip tone={toneOf(level.chapter)}>
                {level.boss ? 'BOSS' : level.finale ? `FINALE ${level.chapter}` : `LV ${level.chapter}-${level.index}`}
              </Chip>
              <h2 className="text-h2 font-black text-hi">{level.name}</h2>
            </div>
            <IconButton ariaLabel="Close level preview" onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </motion.div>

          {/* Row 2 — goal */}
          <motion.div
            className="flex items-center gap-3 rounded-md border border-line bg-night-1 px-3 py-2.5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.28, ease: outExpo }}
          >
            <svg width="22" height="22" style={{ color: zone.accent }} aria-hidden>
              <use href={asset(`icons-game.svg#${zone.icon}`)} />
            </svg>
            <p className="text-body font-semibold text-hi">{level.goal}</p>
          </motion.div>

          {/* Row 3 — stat chips */}
          <motion.div
            className="flex flex-wrap items-center gap-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.28, ease: outExpo }}
          >
            <Chip tone="gold">PAR {level.par}</Chip>
            <Chip tone="neutral" className="gap-1.5">
              BEST
              {prog?.completed ? (
                <StarMeter stars={prog.stars} size={11} />
              ) : (
                <span className="text-low">—</span>
              )}
            </Chip>
            <Chip tone="mint">
              +{level.xp} XP · +{level.gears}
              <svg width="12" height="12" aria-hidden>
                <use href={asset('icons-game.svg#i-gear-currency')} />
              </svg>
            </Chip>
          </motion.div>

          {/* Row 4 — card teaser (first clear only) */}
          {newCards.length > 0 && (
            <motion.div
              className="flex items-center gap-3 rounded-md border border-violet/40 bg-violet/10 px-3 py-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.28, ease: outExpo }}
            >
              <motion.img
                src={asset('card-back.png')}
                alt=""
                className="h-12 w-9 rounded-sm border border-violet/50 object-cover"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              <p className="flex items-center gap-1.5 text-body font-bold text-violet">
                <Sparkles className="h-4 w-4" />
                {newCards.length > 1 ? `${newCards.length} cards inside!` : 'Card inside!'}
              </p>
            </motion.div>
          )}

          {/* Row 5 — PLAY + how to play */}
          <motion.div
            className="flex flex-col items-stretch gap-1 pt-1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.28, ease: outExpo }}
          >
            <NeonButton
              className="w-full"
              onClick={() => {
                sfx.whoosh()
                navigate(level.boss ? '/boss' : `/play?level=${level.id}`)
              }}
              ariaLabel={`Play ${level.name}`}
            >
              PLAY
            </NeonButton>
            <NeonButton
              variant="ghost"
              ariaLabel="How to play — watch the ghost hand"
              onClick={() => {
                onToast('Watch the ghost hand!')
                navigate(level.boss ? '/boss?tutorial=1' : `/play?level=${level.id}&tutorial=1`)
              }}
            >
              How to play
            </NeonButton>
          </motion.div>
        </div>
      )}
    </BottomSheet>
  )
}

/* ---------------- the map itself ---------------- */

type NodeState = 'cleared' | 'current' | 'locked'

export default function Map() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const levels = useGameStore((s) => s.levels)
  const ownedCards = useGameStore((s) => s.cards)
  const gears = useGameStore((s) => s.gears)
  const xp = useGameStore((s) => s.xp)
  const playerLevel = selectPlayerLevel(xp)
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)

  const viewportRef = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(390)
  const [vh, setVh] = useState(0)

  const [selected, setSelected] = useState<LevelMeta | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [expandedCh, setExpandedCh] = useState<number | null>(null)
  const [celebrate, setCelebrate] = useState<number | null>(null)
  const [gateBurst, setGateBurst] = useState<number | null>(null)
  const [intro, setIntro] = useState(false)

  /* ----- world geometry (rebuilds with width) ----- */
  const nodes: NodePos[] = useMemo(() => {
    const cx = vw / 2
    const amp = Math.min(vw * 0.27, 116)
    const out: NodePos[] = []
    ZONE_LEVELS.forEach((zoneLevels, zi) => {
      const chapter = zi + 1
      const zt = zoneTop(chapter)
      zoneLevels.forEach((meta, ii) => {
        const story = zi * 9 + ii // 0..53, bottom-to-top
        out.push({
          meta,
          story,
          x: cx + amp * Math.sin(story * 0.52),
          // node 1 at the zone's bottom, finale near its top (you climb)
          y: zt + 640 - (ii / 8) * 460,
        })
      })
    })
    return out
  }, [vw])

  // NB: component is named `Map`, so the global Map constructor needs globalThis
  const nodeById = useMemo(() => {
    const m = new globalThis.Map<string, NodePos>()
    nodes.forEach((n) => m.set(n.meta.id, n))
    return m
  }, [nodes])
  const currentId = useMemo(() => currentNodeId(levels), [levels])
  const currentNode = nodeById.get(currentId)
  const currentIdRef = useRef(currentId)
  useEffect(() => {
    currentIdRef.current = currentId
  }, [currentId])

  const pathFull = useMemo(() => smoothPath(nodes.map((n) => ({ x: n.x, y: n.y }))), [nodes])
  const pathDone = useMemo(() => {
    const cur = currentNode
    if (!cur) return ''
    const pts = nodes.filter((n) => n.story <= cur.story)
    return pts.length > 1 ? smoothPath(pts.map((n) => ({ x: n.x, y: n.y }))) : ''
  }, [nodes, currentNode])

  /* ----- pan machinery ----- */
  const pan = useMotionValue(0)
  const maxPan = Math.max(0, WORLD_H - vh)
  const worldY = useTransform(pan, (v) => -v)
  const nebulaY = useTransform(pan, (v) => -v * 0.5)
  const vignY = useTransform(pan, (v) => -v * 0.85)
  const nebulaH = vh + maxPan * 0.5 + 128

  /** vignette anchors: aligned with their zone when the zone is centered */
  const vignettes = useMemo(
    () =>
      ZONES.map((z) => {
        const zt = zoneTop(z.chapter)
        const centerPan = Math.min(maxPan, Math.max(0, zt + ZONE_H / 2 - vh / 2))
        return { chapter: z.chapter, src: z.vignette, top: zt - 0.15 * centerPan - 30 }
      }),
    [vh, maxPan],
  )

  const drag = useRef({
    active: false,
    moved: false,
    startY: 0,
    lastY: 0,
    lastT: 0,
    vel: 0,
    raf: 0,
    anim: null as AnimationPlaybackControls | null,
  })
  const suppressClick = useRef(false)
  const lastTap = useRef(0)

  const persistPan = useCallback(() => {
    try {
      sessionStorage.setItem('vecto-map-pan', String(Math.round(pan.get())))
      sessionStorage.setItem('vecto-map-current', currentIdRef.current)
    } catch {
      /* private mode */
    }
  }, [pan])

  const stopMotion = useCallback(() => {
    cancelAnimationFrame(drag.current.raf)
    drag.current.anim?.stop()
  }, [])

  const settleEdge = useCallback(() => {
    const v = pan.get()
    if (v < 0 || v > maxPan) {
      drag.current.anim = animate(pan, Math.min(maxPan, Math.max(0, v)), {
        type: 'spring',
        stiffness: 260,
        damping: 30,
        onComplete: persistPan,
      })
    }
  }, [pan, maxPan, persistPan])

  const focusNode = useCallback(
    (id: string, animateIt = true) => {
      const n = nodeById.get(id)
      if (!n || vh === 0) return
      const target = Math.min(maxPan, Math.max(0, n.y - vh * 0.55))
      stopMotion()
      if (animateIt && !reduceMotion) {
        drag.current.anim = animate(pan, target, { duration: 0.5, ease: outExpo, onComplete: persistPan })
      } else {
        pan.set(target)
        persistPan()
      }
    },
    [nodeById, vh, maxPan, pan, stopMotion, persistPan, reduceMotion],
  )

  /* ----- viewport size ----- */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setVw(el.clientWidth)
      setVh(el.clientHeight)
    })
    setVw(el.clientWidth)
    setVh(el.clientHeight)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ----- mount: restore/focus camera, detect celebrations, intro flags ----- */
  const didInit = useRef(false)
  useEffect(() => {
    if (vh === 0 || didInit.current) return
    didInit.current = true

    const firstVisit = !sessionStorage.getItem('vecto-map-seen')
    sessionStorage.setItem('vecto-map-seen', '1')
    setIntro(firstVisit && !reduceMotion)

    // camera: deep-linked zone > stored pan > settle on current node
    const state = location.state as { focusChapter?: number; chapterCleared?: number } | null
    const zoneParam = Number(searchParams.get('zone'))
    const focusChapter = state?.focusChapter ?? (zoneParam >= 1 && zoneParam <= 6 ? zoneParam : null)
    const storedPan = Number(sessionStorage.getItem('vecto-map-pan'))

    if (focusChapter) {
      const zoneNode = nodes.find((n) => n.meta.chapter === focusChapter && !levels[n.meta.id]?.completed)
      focusNode((zoneNode ?? nodes.find((n) => n.meta.chapter === focusChapter))?.meta.id ?? currentId, false)
    } else if (!Number.isNaN(storedPan) && sessionStorage.getItem('vecto-map-pan') !== null) {
      // restore last camera; if the current node advanced since (level win),
      // travel from the old spot to the new node (chapters.md §1 entry)
      pan.set(Math.min(maxPan, Math.max(0, storedPan)))
      const prevCurrent = sessionStorage.getItem('vecto-map-current')
      if (prevCurrent && prevCurrent !== currentId) {
        drag.current.anim = animate(pan, Math.min(maxPan, Math.max(0, (nodeById.get(currentId)?.y ?? 0) - vh * 0.55)), {
          duration: reduceMotion ? 0.15 : 0.6,
          ease: outExpo,
          onComplete: persistPan,
        })
      }
    } else {
      const n = nodeById.get(currentId)
      if (n) {
        const target = Math.min(maxPan, Math.max(0, n.y - vh * 0.55))
        pan.set(Math.min(maxPan, target + 160))
        drag.current.anim = animate(pan, target, { duration: reduceMotion ? 0.15 : 0.5, ease: outExpo, onComplete: persistPan })
      }
    }

    // celebration: a finale cleared that we haven't celebrated yet
    const celebrated = loadCelebrated()
    const forced = state?.chapterCleared
    const pending = forced
      ? [forced]
      : ZONES.map((z) => z.chapter).filter(
          (c) => levels[finaleIdOf(c)]?.completed && !celebrated.includes(c),
        )
    if (pending.length > 0) setCelebrate(Math.max(...pending))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vh])

  /* ----- celebration dismiss → mark, gate burst, climb into new zone ----- */
  const dismissCelebration = useCallback(() => {
    if (celebrate === null) return
    try {
      const celebrated = loadCelebrated()
      if (!celebrated.includes(celebrate)) {
        localStorage.setItem('vecto-map-celebrated', JSON.stringify([...celebrated, celebrate]))
      }
    } catch {
      /* private mode */
    }
    const ch = celebrate
    setCelebrate(null)
    if (ch < 6) {
      setGateBurst(ch + 1)
      setTimeout(() => setGateBurst(null), 900)
    }
    focusNode(currentId)
  }, [celebrate, currentId, focusNode])

  /* ----- pointer handlers: momentum pan + tap/double-tap ----- */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    stopMotion()
    const d = drag.current
    d.active = true
    d.moved = false
    d.startY = e.clientY
    d.lastY = e.clientY
    d.lastT = performance.now()
    d.vel = 0
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    const now = performance.now()
    const dy = e.clientY - d.lastY
    const dt = Math.max(1, now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    if (!d.moved && Math.abs(e.clientY - d.startY) > 6) d.moved = true
    if (dy !== 0) {
      let next = pan.get() - dy
      if (next < 0) next *= 0.35
      else if (next > maxPan) next = maxPan + (next - maxPan) * 0.35
      pan.set(next)
      d.vel = 0.8 * d.vel + 0.2 * ((-dy / dt) * 16.7)
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    if (d.moved) {
      suppressClick.current = true
      setTimeout(() => {
        suppressClick.current = false
      }, 60)
      // momentum, friction 0.94/frame
      let v = d.vel
      const step = () => {
        if (Math.abs(v) < 0.05) {
          settleEdge()
          persistPan()
          return
        }
        const next = pan.get() + v
        if (next < 0 || next > maxPan) {
          settleEdge()
          return
        }
        pan.set(next)
        v *= 0.94
        d.raf = requestAnimationFrame(step)
      }
      d.raf = requestAnimationFrame(step)
    } else {
      settleEdge()
      // double-tap recenters on the current node
      const now = performance.now()
      if (now - lastTap.current < 300) focusNode(currentId)
      lastTap.current = now
      persistPan()
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  /* ----- node taps ----- */
  const tapNode = (n: NodePos) => {
    const state: NodeState = levels[n.meta.id]?.completed
      ? 'cleared'
      : n.meta.id === currentId
        ? 'current'
        : isLevelUnlocked(n.meta, levels)
          ? 'current' // unlocked but not current shouldn't happen; treat as playable
          : 'locked'
    if (state === 'locked') {
      setShakeId(n.meta.id)
      setToast('Clear the level before it!')
      haptics.error()
      sfx.error()
      return
    }
    haptics.tick()
    sfx.tick()
    setSelected(n.meta)
  }

  const nodeLabel = (n: NodePos): string => {
    const prog = levels[n.meta.id]
    const kind = n.meta.boss ? 'Boss' : n.meta.finale ? `${ZONES[n.meta.chapter - 1].name} finale` : `Level ${n.meta.chapter}-${n.meta.index}`
    if (prog?.completed) return `${kind}, ${n.meta.name}, cleared${n.meta.finale ? '' : `, ${prog.stars} of 3 stars`}`
    if (n.meta.id === currentId) return `${kind}, ${n.meta.name}, current level`
    if (isLevelUnlocked(n.meta, levels)) return `${kind}, ${n.meta.name}, unlocked`
    return `${kind}, locked. Clear the level before it!`
  }

  /* ----- render ----- */
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        title="THE GRIDVERSE"
        gears={gears}
        avatarSrc={asset('mascot-vex.png')}
        level={playerLevel}
        onProfile={() => navigate('/profile')}
        onSettings={() => navigate('/settings')}
      />

      <div
        ref={viewportRef}
        aria-label="The Gridverse world map — drag to pan, double-tap to recenter"
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        {/* nebula base — 0.5× parallax */}
        <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ y: nebulaY, height: nebulaH }}>
          <div
            className="h-full w-full opacity-80"
            style={{ backgroundImage: 'url(/nebula-bg.png)', backgroundRepeat: 'repeat', backgroundSize: '480px 854px' }}
          />
          <div className="absolute inset-0 bg-night-0/30" />
        </motion.div>

        {/* zone vignettes — 0.85× parallax */}
        <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ y: vignY }}>
          {vignettes.map((v) => (
            <ZoneVignette key={v.chapter} src={v.src} top={v.top} still={reduceMotion} />
          ))}
        </motion.div>

        {/* world — 1.0× */}
        <motion.div className="absolute inset-x-0 top-0" style={{ y: worldY, height: WORLD_H }}>
          {/* grid overlay */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(rgba(56,189,248,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.15) 1px, transparent 1px)',
              backgroundSize: '44px 44px, 44px 44px, 220px 220px, 220px 220px',
            }}
          />

          {/* star path */}
          <svg aria-hidden width={vw} height={WORLD_H} className="absolute inset-0">
            <path d={pathFull} fill="none" stroke="#223354" strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" />
            {pathDone && (
              <>
                <motion.path
                  d={pathDone}
                  fill="none"
                  stroke="rgba(34,211,238,0.14)"
                  strokeWidth={8}
                  strokeLinecap="round"
                  initial={intro ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.5, ease: outExpo }}
                />
                <motion.path
                  d={pathDone}
                  fill="none"
                  stroke="rgba(34,211,238,0.4)"
                  strokeWidth={3}
                  strokeDasharray="2 10"
                  strokeLinecap="round"
                  initial={intro ? { pathLength: 0 } : false}
                  animate={reduceMotion ? { pathLength: 1 } : { pathLength: 1, strokeDashoffset: [0, -24] }}
                  transition={{
                    pathLength: { duration: 1.5, ease: outExpo },
                    strokeDashoffset: { duration: 1, repeat: Infinity, ease: 'linear' },
                  }}
                />
              </>
            )}
          </svg>

          {/* zone gates (boundary above zone c = between chapter c-1 and c) */}
          {[2, 3, 4, 5, 6].map((c) => {
            const y = zoneTop(c) + ZONE_H
            const unlocked = !!levels[finaleIdOf(c - 1)]?.completed
            if (c === 6) {
              // boss gate — double-height band at the end of Eigen Keep
              return (
                <div
                  key={c}
                  className="absolute inset-x-0 flex items-center justify-center gap-4 px-6"
                  style={{ top: y, height: BOSS_GATE_H }}
                >
                  <img
                    src={asset('boss-eigen.png')}
                    alt="EIGEN, the Unmoved"
                    className="h-[110px] w-[110px] object-contain"
                    style={
                      unlocked
                        ? { filter: 'drop-shadow(0 0 18px rgba(255,46,147,.55))' }
                        : { filter: 'brightness(0.35) drop-shadow(0 0 18px rgba(255,46,147,.45))' }
                    }
                  />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-px w-40" style={{ background: 'rgba(255,46,147,0.6)', boxShadow: '0 0 12px rgba(255,46,147,0.5)' }} />
                    <Chip tone="magenta" className="bg-night-1/90">
                      {unlocked ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> THE RIFT IS OPEN
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3" /> EIGEN sleeps… for now.
                        </>
                      )}
                    </Chip>
                    <div className="h-px w-40" style={{ background: 'rgba(255,46,147,0.6)', boxShadow: '0 0 12px rgba(255,46,147,0.5)' }} />
                  </div>
                  {gateBurst === c && <Burst colors={['#FF2E93', '#8B5CF6', '#EAF2FF']} count={18} />}
                </div>
              )
            }
            return (
              <div key={c} className="absolute inset-x-6 flex flex-col items-center justify-center gap-2" style={{ top: y, height: GATE_H }}>
                <div className="h-px w-full" style={{ background: 'rgba(139,92,246,0.55)', boxShadow: '0 0 10px rgba(139,92,246,0.45)' }} />
                {unlocked ? (
                  <Chip tone="violet" className="bg-night-1/90">
                    <ChevronUp className="h-3 w-3" /> ZONE OPEN
                  </Chip>
                ) : (
                  <Chip tone="neutral" className="bg-night-1/90">
                    <Lock className="h-3 w-3" /> {ZONES[c - 1].gateLabel}
                  </Chip>
                )}
                {gateBurst === c && <Burst colors={['#8B5CF6', '#22D3EE']} count={16} />}
              </div>
            )
          })}

          {/* zone headers + accordions */}
          {ZONES.map((z) => {
            const zt = zoneTop(z.chapter)
            const stars = zoneStars(z.chapter, levels)
            const open = expandedCh === z.chapter
            const zoneCards = CARDS.filter((c) => c.chapter === z.chapter)
            return (
              <div key={z.chapter}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${z.name} zone details`}
                  onClick={() => {
                    haptics.tick()
                    sfx.tick()
                    setExpandedCh(open ? null : z.chapter)
                  }}
                  className="absolute inset-x-3 flex items-center gap-3 rounded-lg border border-line/60 bg-night-1/70 p-2.5 text-left backdrop-blur-sm"
                  style={{ top: zt + 16, borderColor: `${z.accent}44` }}
                >
                  <img src={z.vignette} alt="" loading="lazy" className="h-16 w-24 rounded-sm border border-line object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="text-caption font-extrabold uppercase" style={{ color: z.accent }}>
                      CHAPTER {z.chapter}
                    </p>
                    <p className="truncate font-display text-h1 leading-none text-hi">{z.name}</p>
                    <p className="mt-0.5 truncate text-title font-bold text-mid">{z.tagline}</p>
                  </div>
                  <Chip tone="gold" className="shrink-0">
                    {stars}/24
                    <svg width="11" height="11" aria-hidden>
                      <use href={asset('icons-game.svg#i-star')} />
                    </svg>
                  </Chip>
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div
                      key="accordion"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: outExpo }}
                      className="absolute inset-x-3 z-20 overflow-hidden"
                      style={{ top: zt + 112 }}
                    >
                      <div className="flex flex-col gap-3 rounded-lg border border-line bg-night-2 p-3 shadow-panel">
                        <img src={z.vignette} alt={`${z.name} vista`} className="h-[120px] w-full rounded-md object-cover" />
                        <div className="flex justify-center gap-2">
                          {zoneCards.map((c, i) => {
                            const owned = ownedCards.includes(c.id)
                            return (
                              <motion.button
                                key={c.id}
                                type="button"
                                aria-label={owned ? `Concept card ${c.flavor} — view in codex` : 'Locked concept card — view in codex'}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ ...pop, delay: 0.1 + i * 0.06 }}
                                onClick={() => navigate(`/profile?ch=${z.chapter}#codex`)}
                                className="relative h-20 w-[60px] overflow-hidden rounded-sm border border-line"
                              >
                                {owned ? (
                                  <img src={c.img} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <>
                                    <img src={asset('card-back.png')} alt="" className="h-full w-full object-cover opacity-50" />
                                    <span className="absolute inset-0 flex items-center justify-center font-display text-h2 text-low">?</span>
                                  </>
                                )}
                              </motion.button>
                            )
                          })}
                        </div>
                        <p className="text-body font-semibold text-mid">{z.flavor}</p>
                        <div className="flex items-center gap-3">
                          <XpBar ratio={stars / 24} className="flex-1" />
                          <span className="text-caption font-extrabold uppercase text-low">{stars}/24 ★</span>
                        </div>
                        <NeonButton variant="ghost" ariaLabel="Jump to current level" onClick={() => focusNode(currentId)}>
                          Jump to current
                        </NeonButton>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          {/* level nodes */}
          {nodes.map((n) => {
            const prog = levels[n.meta.id]
            const cleared = !!prog?.completed
            const isCurrent = n.meta.id === currentId
            const unlocked = cleared || isCurrent || isLevelUnlocked(n.meta, levels)
            const accent = ZONES[n.meta.chapter - 1].accent
            const size = n.meta.finale ? 68 : 56
            return (
              <div
                key={n.meta.id}
                className="absolute"
                style={{ left: n.x, top: n.y, translate: '-50% -50%', width: size, height: size }}
              >
                <motion.button
                  type="button"
                  aria-label={nodeLabel(n)}
                  onClick={() => tapNode(n)}
                  initial={intro ? { scale: 0 } : false}
                  animate={shakeId === n.meta.id ? { scale: 1, rotate: [0, -6, 6, -4, 4, 0] } : { scale: 1, rotate: 0 }}
                  transition={
                    shakeId === n.meta.id
                      ? { duration: 0.3 }
                      : { ...pop, delay: intro ? 0.35 + n.story * 0.04 : 0 }
                  }
                  onAnimationComplete={() => {
                    if (shakeId === n.meta.id) setShakeId(null)
                  }}
                  className={cn(
                    'relative flex h-full w-full items-center justify-center',
                    !n.meta.finale && 'rounded-full border-2',
                    !n.meta.finale && !unlocked && 'border-line bg-night-2/50',
                  )}
                  style={
                    n.meta.finale
                      ? {
                          // hexagon painted via SVG below; drop-shadow follows the shape
                          filter: isCurrent
                            ? `drop-shadow(0 0 8px ${accent}73) drop-shadow(0 0 24px ${accent}2e)`
                            : cleared
                              ? `drop-shadow(0 0 6px ${accent}59)`
                              : undefined,
                        }
                      : {
                          borderColor: unlocked ? accent : undefined,
                          background: !unlocked
                            ? undefined
                            : cleared
                              ? `${accent}33`
                              : `${accent}59`,
                          boxShadow: isCurrent ? `0 0 16px ${accent}73, 0 0 48px ${accent}2e` : undefined,
                        }
                  }
                >
                  {n.meta.finale && (
                    <svg aria-hidden viewBox="0 0 68 68" className="absolute inset-0 h-full w-full">
                      <polygon
                        points="17,2 51,2 66,34 51,66 17,66 2,34"
                        fill={!unlocked ? 'rgba(17,27,48,0.5)' : cleared ? `${accent}33` : `${accent}59`}
                        stroke={unlocked ? '#223354' : accent}
                        strokeWidth={2}
                      />
                    </svg>
                  )}
                  <span className="relative flex items-center justify-center">
                    {!unlocked ? (
                      n.meta.boss ? (
                        <Skull className="h-6 w-6 text-low" />
                      ) : (
                        <Lock className="h-5 w-5 text-low" />
                      )
                    ) : n.meta.boss ? (
                      <Skull className="h-7 w-7" style={{ color: cleared ? '#FFD166' : accent }} />
                    ) : n.meta.finale ? (
                      <svg width="26" height="26" style={{ color: cleared ? '#FFD166' : accent }} aria-hidden>
                        <use href={asset(`icons-game.svg#${ZONES[n.meta.chapter - 1].icon}`)} />
                      </svg>
                    ) : (
                      <span className="font-mono text-mono-m font-bold text-hi">{n.meta.index}</span>
                    )}
                  </span>
                  {isCurrent && !reduceMotion && <CurrentRing accent={accent} size={size} />}
                </motion.button>

                {/* mini stars under cleared standard nodes */}
                {cleared && !n.meta.finale && (
                  <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2">
                    <StarMeter stars={prog.stars} size={9} />
                  </div>
                )}

                {/* Vex stands on the current node */}
                {isCurrent && <VexMarker still={reduceMotion} />}
              </div>
            )
          })}
        </motion.div>

        {/* recenter FAB */}
        <div className="absolute bottom-3 right-3 z-20">
          <IconButton ariaLabel="Recenter on current level" onClick={() => focusNode(currentId)}>
            <Crosshair className="h-5 w-5" />
          </IconButton>
        </div>

        {/* codex shortcut FAB */}
        <div className="absolute bottom-3 left-3 z-20">
          <IconButton ariaLabel="Open the concept codex" onClick={() => navigate('/codex')}>
            <BookOpen className="h-5 w-5" />
          </IconButton>
        </div>
      </div>

      <LevelSheet level={selected} onClose={() => setSelected(null)} onToast={setToast} />

      <AnimatePresence>
        {celebrate !== null && <ChapterCelebration chapter={celebrate} onDone={dismissCelebration} />}
      </AnimatePresence>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}
