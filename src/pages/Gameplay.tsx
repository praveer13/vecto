/**
 * VECTO Gameplay — gameplay.md. Full-screen canvas world + chapter-specific
 * control dock + HUD + live EquationChip + ghost-hand hint + pause menu.
 * Route: /play?level=X-Y&daily=1&resume=1&r=freshKey&hint=1
 * Chapters 1–4 & 6 mechanics live in src/game/ sessions on the canvas;
 * this file owns all DOM chrome.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftRight,
  Combine,
  Hand,
  Layers,
  Map as MapIcon,
  Minus,
  MoveRight,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings as SettingsIcon,
  Wind,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Vec } from '@gridverse/kit/engine'
import { clamp, fmt } from '@gridverse/kit/engine'
import type { LevelDef } from '@/game/levels'
import {
  clearMidLevel,
  dailyLevelId,
  getLevel,
  hasSeenMechanic,
  loadMidLevel,
  markMechanicSeen,
  nextLevelId,
  saveResult,
  starsFor,
} from '@/game/levels'
import { badgesForLevel } from '@/game/cards'
import type { Session, UiState } from '@gridverse/kit/session'
import { createSession } from '@/game/sessions'
import { Ch1Session } from '@/game/ch1'
import { Chip, IconButton, NeonButton, StarMeter, EquationChip, Toast } from '@gridverse/kit/ui'
import { useGameStore, chapterName } from '@/store/gameStore'
import { haptics, cn } from '@gridverse/kit/lib'

const CH_TONE = { 1: 'mint', 2: 'cyan', 3: 'amber', 4: 'violet', 6: 'coral' } as const
const CH_ICON: Record<number, LucideIcon> = { 1: MoveRight, 2: Wind, 3: Wrench, 4: Layers, 6: RotateCcw }
const pop = { type: 'spring', stiffness: 420, damping: 24 } as const

/** Vecto-specific VectoUiState extras consumed by the chapter docks. */
type VectoUiExtras = {
  tray?: Vec[]
  chainLen?: number
  windA?: number
  windB?: number
  hasV?: boolean
  newWindActive?: boolean
  collected?: number
  colA?: Vec
  colB?: Vec
  det?: number
  order?: number[]
  merged?: boolean
  editMachine?: number
  warped?: boolean
  canMerge?: boolean
}
type VectoUiState = UiState<VectoUiExtras>

function plainWords(level: LevelDef): string {
  switch (level.chapter) {
    case 1:
      return 'Chained arrows add tip-to-tail — land on the gold pad'
    case 2:
      return 'The beam lands wherever the mixed winds blow'
    case 3:
      return 'The machine moves every crate to M× its spot'
    case 4:
      return 'Crates ride the first tower, then the next'
    case 6:
      return 'Build the machine that undoes the warp'
    default:
      return 'Drag, snap, win!'
  }
}

export default function Gameplay() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const daily = params.get('daily') === '1'
  const wantHint = params.get('hint') === '1'
  const wantResume = params.get('resume') === '1'
  const freshKey = params.get('r') ?? ''
  const storeCurrent = useGameStore((s) => s.currentLevel)
  const levelId = daily ? dailyLevelId(new Date().toISOString().slice(0, 10)) : (params.get('level') ?? storeCurrent)
  // Chapter 5 (Eigen Keep) plays in the boss arena — redirect all its nodes
  if (levelId === 'boss' || /^5(-|$)/.test(levelId ?? '')) return <Navigate to="/boss" replace />
  const level = getLevel(levelId)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<Session<LevelDef, VectoUiExtras> | null>(null)
  const [ui, setUi] = useState<VectoUiState | null>(null)
  const [intro, setIntro] = useState(true)
  const [paused, setPaused] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  /* ---------- win → store writes + results payload ---------- */
  const handleWin = useCallback(
    (moves: number, hintsUsed: number) => {
      const s = useGameStore.getState()
      const prev = s.levels[level.id]
      const firstClear = !prev?.completed
      const stars = starsFor(moves, level.par, hintsUsed)
      const starsDelta = Math.max(0, stars - (prev?.stars ?? 0))
      const chapterComplete = !!level.finale
      let xpEarned = firstClear ? 75 : 15
      let gearsEarned = (firstClear ? 10 : 2) + starsDelta * 5
      if (chapterComplete && firstClear) {
        xpEarned += 100
        gearsEarned += 50
      }
      let cardId: string | undefined
      let cardDuplicate = false
      if (level.cardId && firstClear) {
        if (s.cards.includes(level.cardId)) {
          cardDuplicate = true
          gearsEarned += 5
        } else {
          cardId = level.cardId
        }
      }
      const newBadges = badgesForLevel(level.id, level.finale).filter((b) => !s.badges.includes(b))
      const xpBefore = s.xp
      s.completeLevel(level.id, stars, gearsEarned, xpEarned)
      // map finale nodes carry "X-f" ids — mirror completion so zone gates open
      if (level.finale) s.completeLevel(`${level.chapter}-f`, stars, 0, 0)
      if (cardId) s.unlockCard(cardId)
      newBadges.forEach((b) => s.unlockBadge(b))
      if (daily) s.completeDaily(20)
      const next = nextLevelId(level.id)
      s.setCurrentLevel(next ?? level.id)
      s.setResumeLevel(null)
      clearMidLevel()
      saveResult({
        levelId: level.id,
        chapter: level.chapter,
        levelName: level.name,
        par: level.par,
        moves,
        stars,
        hintsUsed: hintsUsed > 0,
        xpEarned,
        gearsEarned,
        firstClear,
        cardId,
        cardDuplicate,
        chapterComplete,
        newBadges,
        nextLevelId: next,
        daily,
        xpBefore,
        xpAfter: xpBefore + xpEarned,
      })
      navigate('/results')
    },
    [level, daily, navigate],
  )
  const winRef = useRef(handleWin)
  winRef.current = handleWin

  /* ---------- session lifecycle ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const session = createSession(canvas, level, {
      onUi: (u) => setUi(u),
      onToast: (msg) => setToast(msg),
      onWin: (m, h) => winRef.current(m, h),
    })
    sessionRef.current = session
    if (wantResume) {
      const mid = loadMidLevel(level.id)
      if (mid) session.restore(mid)
    } else {
      clearMidLevel()
    }
    session.engine.start()
    session.frameContent()
    session.emit()
    setIntro(true)
    return () => {
      session.dispose()
      sessionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id, freshKey, daily])

  const startPlay = () => {
    setIntro(false)
    const s = sessionRef.current
    if (!s) return
    s.begin()
    const mechKey = `ch${level.chapter}`
    if (wantHint) {
      window.setTimeout(() => s.showHint(), 450)
    } else if (!hasSeenMechanic(mechKey)) {
      markMechanicSeen(mechKey)
      window.setTimeout(() => s.showHint(), 450)
    }
  }

  /* ---------- pause ---------- */
  const setPause = (p: boolean) => {
    setPaused(p)
    sessionRef.current?.setPaused(p)
  }
  const quitToMap = () => {
    useGameStore.getState().setResumeLevel(level.id)
    sessionRef.current?.setPaused(false)
    sessionRef.current?.persist()
    navigate('/map')
  }

  const tone = CH_TONE[level.chapter as keyof typeof CH_TONE] ?? 'mint'
  const Icon = CH_ICON[level.chapter] ?? MoveRight
  const playing = ui?.state === 'play'

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-night-1">
      {/* ---------- HUD bar ---------- */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex h-12 items-center justify-between px-3 pt-safe"
      >
        <IconButton ariaLabel="Pause" onClick={() => setPause(true)}>
          <Pause size={18} />
        </IconButton>
        <div className="flex items-center gap-2">
          {daily && <Chip tone="gold">DAILY DRIFT</Chip>}
          <Chip tone={tone}>
            LV {level.id} · {chapterName(level.id)}
          </Chip>
        </div>
        <div className="flex items-center gap-1.5" aria-label={`${ui?.moves ?? 0} of par ${level.par}`}>
          <StarMeter stars={starsFor(ui?.moves ?? 0, level.par, ui?.hints ?? 0)} size={14} />
          <span className="font-mono text-mono-s font-bold text-gold">
            {ui?.moves ?? 0}/{level.par}
          </span>
        </div>
      </motion.div>

      {/* ---------- canvas world ---------- */}
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
        />
        {/* pause / intro dim+blur */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 z-[5] bg-night-0/40 backdrop-blur-[4px] transition-opacity duration-200',
            paused || intro ? 'opacity-100' : 'opacity-0',
          )}
        />
        {/* EquationChip floats 12px above the dock */}
        <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
          <EquationChipLongPress text={ui?.equation ?? '…'} plain={plainWords(level)} onExplain={setToast} />
        </div>
      </div>

      {/* ---------- control dock ---------- */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 rounded-t-[20px] border-t border-line bg-night-2 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-panel"
      >
        <Dock level={level} ui={ui} sessionRef={sessionRef} playing={playing} onToast={setToast} />
      </motion.div>

      {/* ---------- level intro card ---------- */}
      <AnimatePresence>
        {intro && (
          <motion.div
            key="intro-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="scrim fixed inset-0 z-40 flex items-center justify-center px-6 backdrop-blur-[8px]"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={pop}
              className="flex w-full max-w-[320px] flex-col items-center gap-3 rounded-xl border border-line bg-night-2 p-6 text-center shadow-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Level ${level.id} ${level.name}`}
            >
              <Chip tone={tone}>
                LV {level.id} · {chapterName(level.id)}
              </Chip>
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-night-3">
                <Icon size={26} className="text-amber" />
              </div>
              <h2 className="text-h2 font-black text-hi">{level.name}</h2>
              <p className="text-body font-semibold text-mid">{level.goal}</p>
              <div className="flex items-center gap-2">
                <Chip tone="gold">PAR {level.par}</Chip>
                {level.finale && <Chip tone="magenta">FINALE</Chip>}
                {daily && <Chip tone="gold">DAILY</Chip>}
              </div>
              <NeonButton className="mt-1 w-full" onClick={startPlay}>
                GO
              </NeonButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- pause menu ---------- */}
      <AnimatePresence>
        {paused && !intro && (
          <motion.div
            key="pause-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="scrim fixed inset-0 z-40 flex items-center justify-center px-8 backdrop-blur-[8px]"
            onClick={() => setPause(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={pop}
              className="flex w-full max-w-[300px] flex-col gap-2 rounded-xl border border-line bg-night-2 p-5 shadow-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Paused"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="mb-1 text-center text-h2 font-black text-hi">Paused</h2>
              <NeonButton onClick={() => setPause(false)}>
                <Play size={18} /> Resume
              </NeonButton>
              <NeonButton
                variant="secondary"
                onClick={() => {
                  sessionRef.current?.reset()
                  setPause(false)
                }}
              >
                <RefreshCw size={18} /> Restart
              </NeonButton>
              <NeonButton
                variant="secondary"
                onClick={() => {
                  sessionRef.current?.showHint()
                  setPause(false)
                }}
              >
                <Hand size={18} /> Show me again
              </NeonButton>
              <NeonButton variant="ghost" onClick={() => navigate('/settings')}>
                <SettingsIcon size={18} /> Settings
              </NeonButton>
              <NeonButton variant="ghost" onClick={quitToMap}>
                <MapIcon size={18} /> Quit to map
              </NeonButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

/* ================= EquationChip with long-press explainer ================= */

function EquationChipLongPress({
  text,
  plain,
  onExplain,
}: {
  text: string
  plain: string
  onExplain: (msg: string) => void
}) {
  const timer = useRef<number>(0)
  return (
    <div
      className="pointer-events-auto"
      onPointerDown={() => {
        timer.current = window.setTimeout(() => {
          haptics.purr()
          onExplain(plain)
        }, 400)
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
    >
      <EquationChip text={text} className="pointer-events-auto max-w-[86vw] whitespace-nowrap" />
    </div>
  )
}

/* ================= dock router ================= */

function Dock({
  level,
  ui,
  sessionRef,
  playing,
  onToast,
}: {
  level: LevelDef
  ui: VectoUiState | null
  sessionRef: React.RefObject<Session<LevelDef, VectoUiExtras> | null>
  playing: boolean
  onToast: (m: string) => void
}) {
  const go = () => sessionRef.current?.go()
  switch (level.chapter) {
    case 1:
      return <DockCh1 ui={ui} sessionRef={sessionRef} playing={playing} go={go} />
    case 2:
      return <DockCh2 level={level} ui={ui} sessionRef={sessionRef} playing={playing} go={go} />
    case 3:
      return <DockMachine level={level} ui={ui} playing={playing} go={go} />
    case 4:
      return <DockCh4 level={level} ui={ui} sessionRef={sessionRef} playing={playing} go={go} onToast={onToast} />
    case 6:
      return <DockCh6 level={level} ui={ui} playing={playing} go={go} />
    default:
      return <DockMachine level={level} ui={ui} playing={playing} go={go} />
  }
}

/* ================= primary action button ================= */

function GoButton({
  label,
  lockOn,
  disabled,
  onPress,
}: {
  label: string
  lockOn: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      animate={lockOn ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={lockOn ? { duration: 1.1, repeat: Infinity } : { duration: 0.09 }}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        'flex h-[72px] w-[92px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg font-display text-[15px] transition-colors duration-200',
        lockOn ? 'bg-mint text-[#06210F] shadow-glow-mint' : 'bg-night-3 text-mid',
        disabled && 'opacity-50',
      )}
      aria-label={label}
    >
      {label}
      {lockOn && <span className="text-[9px] font-extrabold uppercase tracking-widest">ready!</span>}
    </motion.button>
  )
}

/* ================= Ch1 — Vector Tray ================= */

function DockCh1({
  ui,
  sessionRef,
  playing,
  go,
}: {
  ui: VectoUiState | null
  sessionRef: React.RefObject<Session<LevelDef, VectoUiExtras> | null>
  playing: boolean
  go: () => void
}) {
  const [ghost, setGhost] = useState<{ v: Vec; x: number; y: number } | null>(null)
  const drag = useRef<{ v: Vec; startX: number; startY: number; moved: boolean } | null>(null)

  const session = () => {
    const s = sessionRef.current
    return s instanceof Ch1Session ? s : null
  }

  const overCanvas = (x: number, y: number): boolean => {
    const s = sessionRef.current
    if (!s) return false
    const r = s.engine.canvas.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  const onDown = (e: React.PointerEvent, v: Vec) => {
    if (!playing) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { v, startX: e.clientX, startY: e.clientY, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8) d.moved = true
    if (!d.moved) return
    setGhost({ v: d.v, x: e.clientX, y: e.clientY })
    session()?.trayDragMove(overCanvas(e.clientX, e.clientY) ? d.v : null)
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGhost(null)
    const s = session()
    if (!s || !d) return
    s.trayDragMove(null)
    if (!d.moved) s.tapCard(d.v)
    else if (overCanvas(e.clientX, e.clientY)) s.trayDrop(d.v)
  }

  const tray = ui?.tray ?? []
  return (
    <div className="flex min-h-[168px] items-stretch gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-caption font-extrabold uppercase text-low">Vector tray · drag onto the grid</p>
        <div className="no-scrollbar flex flex-1 items-center gap-2 overflow-x-auto py-1">
          {tray.length === 0 && <p className="text-body font-semibold text-low">All arrows placed — hit GO!</p>}
          {tray.map((v, i) => (
            <motion.div
              key={`${v.x},${v.y},${i}`}
              initial={{ rotate: -8, y: 24, opacity: 0 }}
              animate={{ rotate: 0, y: 0, opacity: 1 }}
              transition={{ ...pop, delay: 0.08 * i }}
              className={cn(
                'flex h-[104px] w-[88px] shrink-0 touch-none flex-col items-center justify-center gap-1 rounded-md border border-line bg-night-3',
                !playing && 'opacity-50',
              )}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => onDown(e, v)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              role="button"
              aria-label={`Vector ${fmt(v.x)}, ${fmt(v.y)}. Drag onto the grid or tap to place.`}
            >
              <VectorGlyph v={v} />
              <span className="font-mono text-mono-s font-bold text-mid">
                ({fmt(v.x)},{fmt(v.y)})
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="flex items-center">
        <GoButton label="GO" lockOn={!!ui?.lockOn && playing} disabled={!playing} onPress={go} />
      </div>
      {/* floating drag ghost */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-50 flex h-[104px] w-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-md border border-amber/60 bg-night-3/95 shadow-glow-amber"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <VectorGlyph v={ghost.v} />
          <span className="font-mono text-mono-s font-bold text-mid">
            ({fmt(ghost.v.x)},{fmt(ghost.v.y)})
          </span>
        </div>
      )}
    </div>
  )
}

/** arrow glyph at true angle/length for tray cards */
function VectorGlyph({ v }: { v: Vec }) {
  const L = Math.hypot(v.x, v.y)
  const lenPx = clamp(L * 9, 12, 40)
  const angle = (Math.atan2(-v.y, v.x) * 180) / Math.PI
  return (
    <div className="flex h-12 w-12 items-center justify-center">
      <div className="relative" style={{ transform: `rotate(${angle}deg)`, width: lenPx, height: 0 }}>
        <div className="absolute -top-[2px] left-0 h-[4px] rounded-full bg-amber shadow-glow-amber" style={{ width: lenPx }} />
        <div
          className="absolute -top-[6px] h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-amber"
          style={{ left: lenPx - 4 }}
        />
      </div>
    </div>
  )
}

/* ================= Ch2 — Wind Mixer ================= */

function DockCh2({
  level,
  ui,
  sessionRef,
  playing,
  go,
}: {
  level: LevelDef
  ui: VectoUiState | null
  sessionRef: React.RefObject<Session<LevelDef, VectoUiExtras> | null>
  playing: boolean
  go: () => void
}) {
  const set = (which: 0 | 1, val: number) => {
    const s = sessionRef.current
    if (s && 'setScale' in s) (s as { setScale: (w: 0 | 1, v: number) => void }).setScale(which, val)
  }
  const step = (which: 0 | 1, dir: 1 | -1) => {
    const s = sessionRef.current
    if (s && 'stepScale' in s) (s as { stepScale: (w: 0 | 1, d: 1 | -1) => void }).stepScale(which, dir)
  }
  if (level.chapter !== 2) return null
  const vVec = ui?.colB ?? level.v
  return (
    <div className="flex min-h-[180px] items-stretch gap-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <WindSlider
          label={`u (${fmt(level.u.x)},${fmt(level.u.y)})`}
          color="#FFB020"
          value={ui?.windA ?? 0}
          disabled={!playing}
          onChange={(v) => set(0, v)}
          onStep={(d) => step(0, d)}
        />
        {vVec ? (
          <WindSlider
            label={`v (${fmt(vVec.x)},${fmt(vVec.y)})`}
            color="#22D3EE"
            value={ui?.windB ?? 0}
            disabled={!playing}
            onChange={(v) => set(1, v)}
            onStep={(d) => step(1, d)}
          />
        ) : (
          <div className="flex h-[76px] items-center justify-center rounded-md border border-dashed border-line text-caption font-extrabold uppercase text-low">
            {ui?.newWindActive ? 'grab the NEW WIND on the grid!' : 'one wind only'}
          </div>
        )}
        {level.targets.length > 1 && (
          <p className="text-caption font-extrabold uppercase text-gold">
            isles: {ui?.collected ?? 0}/{level.targets.length}
          </p>
        )}
      </div>
      <div className="flex items-center">
        <GoButton label="SAIL" lockOn={!!ui?.lockOn && playing} disabled={!playing} onPress={go} />
      </div>
    </div>
  )
}

/** big arc slider: drag radially −3…+3 in 0.5 steps */
function WindSlider({
  label,
  color,
  value,
  disabled,
  onChange,
  onStep,
}: {
  label: string
  color: string
  value: number
  disabled?: boolean
  onChange: (v: number) => void
  onStep: (d: 1 | -1) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const CX = 80
  const CY = 88
  const R = 52
  const polar = (deg: number) => ({ x: CX + R * Math.sin((deg * Math.PI) / 180), y: CY - R * Math.cos((deg * Math.PI) / 180) })
  const start = polar(-120)
  const end = polar(120)
  const thumb = polar(clamp((value / 3) * 120, -120, 120))

  const handle = (e: React.PointerEvent) => {
    if (disabled) return
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const dx = ((e.clientX - r.left) / r.width) * 160 - CX
    const dy = ((e.clientY - r.top) / r.height) * 120 - CY
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    deg = clamp(deg, -120, 120)
    onChange((deg / 120) * 3)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-[64px]">
        <span
          className="inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-mono-s font-bold"
          style={{ borderColor: `${color}66`, color }}
        >
          {label}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 160 120"
        className={cn('h-[76px] min-w-0 flex-1 touch-none', disabled && 'opacity-50')}
        style={{ touchAction: 'none' }}
        role="slider"
        aria-label={`Wind ${label}, strength ${fmt(value)}. Drag or use steppers.`}
        aria-valuenow={value}
        aria-valuemin={-3}
        aria-valuemax={3}
        onPointerDown={(e) => {
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
          handle(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) handle(e)
        }}
      >
        <path
          d={`M ${start.x} ${start.y} A ${R} ${R} 0 1 1 ${end.x} ${end.y}`}
          fill="none"
          stroke="#223354"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {[-120, -60, 0, 60, 120].map((d) => {
          const p = polar(d)
          return <circle key={d} cx={p.x} cy={p.y} r="2" fill="#223354" />
        })}
        {value !== 0 && (
          <path
            d={`M ${polar(0).x} ${polar(0).y} A ${R} ${R} 0 ${Math.abs(value) > 1.5 ? 1 : 0} ${value > 0 ? 1 : 0} ${thumb.x} ${thumb.y}`}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.5"
          />
        )}
        <circle cx={thumb.x} cy={thumb.y} r="13" fill={color} stroke="#0B1220" strokeWidth="3" />
        <text x={thumb.x} y={thumb.y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill="#0B1220">
          {fmt(value)}×
        </text>
      </svg>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          aria-label="increase wind strength"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-night-3 text-mid active:scale-90"
          onClick={() => onStep(1)}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          aria-label="decrease wind strength"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-night-3 text-mid active:scale-90"
          onClick={() => onStep(-1)}
        >
          <Minus size={14} />
        </button>
      </div>
    </div>
  )
}

/* ================= Ch3 — Machine Panel ================= */

function ColChip({ v, color, label }: { v?: Vec; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="rounded-md border bg-night-3 px-2 py-1 font-mono text-mono-m font-bold"
        style={{ borderColor: `${color}55`, color }}
      >
        [{fmt(v?.x ?? 0)};{fmt(v?.y ?? 0)}]
      </div>
      <span className="text-[10px] font-extrabold uppercase tracking-widest text-low">{label}</span>
    </div>
  )
}

function DockMachine({
  level,
  ui,
  playing,
  go,
}: {
  level: LevelDef
  ui: VectoUiState | null
  playing: boolean
  go: () => void
}) {
  const designer = level.chapter === 3 && level.designer
  return (
    <div className="flex min-h-[168px] items-stretch gap-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <p className="text-caption font-extrabold uppercase text-low">
          {designer ? 'drag î′ ĵ′ on the mini grid ↑' : 'the machine’s columns'}
        </p>
        <div className="flex items-center gap-3">
          <ColChip v={ui?.colA} color="#FFB020" label="î′ lands" />
          <ColChip v={ui?.colB} color="#22D3EE" label="ĵ′ lands" />
          {ui?.warped && <Chip tone="coral">warped — pull to undo</Chip>}
        </div>
        <p className="text-body font-semibold text-low">
          {designer ? 'You are writing the machine!' : 'Place crates, then pull!'}
        </p>
      </div>
      <div className="flex items-center">
        <GoButton
          label={ui?.warped ? 'UNDO' : 'LEVER'}
          lockOn={(!!ui?.lockOn && playing) || !!ui?.warped}
          disabled={!playing}
          onPress={go}
        />
      </div>
    </div>
  )
}

/* ================= Ch4 — Chain Panel ================= */

function DockCh4({
  level,
  ui,
  sessionRef,
  playing,
  go,
  onToast,
}: {
  level: LevelDef
  ui: VectoUiState | null
  sessionRef: React.RefObject<Session<LevelDef, VectoUiExtras> | null>
  playing: boolean
  go: () => void
  onToast: (m: string) => void
}) {
  if (level.chapter !== 4) return null
  const order = ui?.order ?? level.initialOrder
  const labels = level.machines.map((m) => m.label)
  const call = (fn: 'swap' | 'merge') => {
    const s = sessionRef.current
    if (s && fn in s) (s as unknown as Record<string, () => void>)[fn]()
  }
  const setOrder = (opt: number[]) => {
    const s = sessionRef.current
    if (s && 'setOrder' in s) (s as unknown as { setOrder: (o: number[]) => void }).setOrder(opt)
  }
  const setEdit = (i: number) => {
    const s = sessionRef.current
    if (s && 'setEditMachine' in s) (s as unknown as { setEditMachine: (n: number) => void }).setEditMachine(i)
  }

  return (
    <div className="flex min-h-[168px] items-stretch gap-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <p className="text-caption font-extrabold uppercase text-low">
          {level.designer ? 'tap a tower, drag its columns ↑' : 'crates ride in this order'}
        </p>
        {/* run-order chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {order.map((mi, pos) => (
            <span key={`${mi}-${pos}`} className="flex items-center gap-1.5">
              {pos > 0 && <span className="text-low">→</span>}
              <button
                type="button"
                disabled={!level.designer}
                onClick={() => setEdit(mi)}
                className={cn(
                  'rounded-sm border px-2.5 py-1.5 font-mono text-mono-m font-bold',
                  level.designer && (ui?.editMachine ?? 0) === mi
                    ? 'border-violet bg-violet/20 text-violet shadow-glow-violet'
                    : 'border-violet/40 bg-violet/10 text-violet',
                )}
                aria-label={`Tower ${labels[mi]}`}
              >
                {labels[mi]}
              </button>
            </span>
          ))}
        </div>
        {/* order options (4-4) */}
        {level.orderOptions && (
          <div className="flex flex-wrap gap-1.5">
            {level.orderOptions.map((opt, oi) => (
              <button
                key={oi}
                type="button"
                onClick={() => setOrder(opt)}
                className={cn(
                  'rounded-sm border px-2 py-1 text-caption font-extrabold',
                  order.join(',') === opt.join(',')
                    ? 'border-violet bg-violet/20 text-violet'
                    : 'border-line bg-night-3 text-mid',
                )}
              >
                {opt.map((i) => labels[i]).join('→')}
              </button>
            ))}
          </div>
        )}
        {/* swap + merge */}
        <div className="flex items-center gap-2">
          {level.swap && (
            <button
              type="button"
              onClick={() => call('swap')}
              disabled={!playing || !!ui?.warped}
              className="flex h-12 items-center gap-2 rounded-pill border-[1.5px] border-violet bg-violet/10 px-4 text-title font-extrabold text-violet active:scale-95"
              aria-label="Swap tower order"
            >
              <ArrowLeftRight size={18} /> SWAP
            </button>
          )}
          {ui?.canMerge && (
            <button
              type="button"
              onClick={() => {
                call('merge')
                onToast('B·A — one chip, one warp!')
              }}
              disabled={!playing || !!ui?.warped}
              className="flex h-12 items-center gap-2 rounded-pill border-[1.5px] border-mint bg-mint/10 px-4 text-title font-extrabold text-mint active:scale-95"
              aria-label="Merge towers into one"
            >
              <Combine size={18} /> MERGE
            </button>
          )}
          {ui?.merged && <Chip tone="mint">merged!</Chip>}
          {ui?.warped && <Chip tone="coral">warped</Chip>}
        </div>
      </div>
      <div className="flex items-center">
        <GoButton
          label={ui?.warped ? 'UNDO' : 'LEVER'}
          lockOn={(!!ui?.lockOn && playing) || !!ui?.warped}
          disabled={!playing}
          onPress={go}
        />
      </div>
    </div>
  )
}

/* ================= Ch6 — Rewind Panel ================= */

function DockCh6({
  level,
  ui,
  playing,
  go,
}: {
  level: LevelDef
  ui: VectoUiState | null
  playing: boolean
  go: () => void
}) {
  if (level.chapter !== 6) return null
  const det = ui?.det ?? 1
  const juice = clamp(Math.sqrt(Math.abs(det)), 0.12, 1.7)
  const collapse = !!level.collapse
  return (
    <div className="flex min-h-[168px] items-stretch gap-3">
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <p className="text-caption font-extrabold uppercase text-low">
          {collapse ? 'no machine can undo this…' : 'drag the rewind columns ↑'}
        </p>
        <div className="flex items-center gap-3">
          {!collapse && (
            <>
              <ColChip v={ui?.colA} color="#FFB020" label="î′ back" />
              <ColChip v={ui?.colB} color="#22D3EE" label="ĵ′ back" />
            </>
          )}
          {/* Area Juice gauge */}
          <div className="flex flex-col items-center gap-1">
            <motion.div
              animate={{
                scale: juice,
                scaleX: det < 0 ? -juice : juice,
                borderRadius: det < 0 ? '30%' : '50%',
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 14 }}
              className={cn(
                'h-12 w-12 border-2',
                Math.abs(det) < 0.05
                  ? 'border-low bg-low/20'
                  : det < 0
                    ? 'border-magenta bg-magenta/25 shadow-glow-magenta'
                    : 'border-coral bg-coral/25 shadow-glow-coral',
              )}
              aria-hidden
            />
            <span className="font-mono text-mono-s font-bold text-coral">det {fmt(det)}</span>
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-low">area juice</span>
          </div>
        </div>
        {collapse && (
          <p className="text-body font-semibold text-coral">
            critters home: {ui?.collected ?? 0}/{level.homes.length}
          </p>
        )}
      </div>
      <div className="flex items-center">
        <GoButton label="REWIND" lockOn={!!ui?.lockOn && playing} disabled={!playing} onPress={go} />
      </div>
    </div>
  )
}
