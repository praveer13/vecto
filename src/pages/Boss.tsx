import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Pause, RotateCcw, Map as MapIcon, Settings as SettingsIcon, Hand, Crosshair, X } from 'lucide-react'
import IconButton from '@/components/game/IconButton'
import NeonButton from '@/components/game/NeonButton'
import EquationChip from '@/components/game/EquationChip'
import Toast from '@/components/game/Toast'
import { useGameStore, type SettingsState } from '@/store/gameStore'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'
import { cn } from '@/lib/utils'
import { BossEngine, type HudState } from '@/game/boss/engine'
import { clamp } from '@/game/boss/math2'

/**
 * Eigen Keep boss fight — boss.md. Route `/boss`. Immersive (no BottomNav).
 * Turret duel vs EIGEN, the Unmoved: shots ride the warped grid; only
 * eigen-direction shots fly straight; damage = |λ|; negative λ reverses the
 * shot; phase 3a (pure rotation) is an invulnerable survival set-piece.
 * Canvas for the world, DOM for the chrome (design.md §3).
 */

const pop = { type: 'spring', stiffness: 420, damping: 24 } as const
const sheetSpring = { type: 'spring', stiffness: 320, damping: 28 } as const

type MatrixModal = 'closed' | 'magnify' | 'nerd'

const fmtM = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/* ---------------- banner (Display L magenta, letter stagger 40ms, 1.6s hold) ---------------- */

function Banner({ main, sub }: { main: string; sub: string }) {
  const reduce = useGameStore((s) => s.settings.reduceMotion)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="pointer-events-none absolute inset-x-0 top-[21%] z-30 flex flex-col items-center gap-2 px-6 text-center"
    >
      <h2
        className="font-display text-display-l text-magenta"
        style={{ textShadow: '0 0 12px rgba(255,46,147,.6), 0 0 48px rgba(255,46,147,.25)' }}
      >
        {reduce
          ? main
          : main.split('').map((ch, i) => (
              <motion.span
                key={`${i}-${ch}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block"
              >
                {ch === ' ' ? ' ' : ch}
              </motion.span>
            ))}
      </h2>
      {sub !== '' && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.4, duration: 0.3 }}
          className="text-caption font-extrabold uppercase tracking-[0.14em] text-mid"
        >
          {sub}
        </motion.p>
      )}
    </motion.div>
  )
}

/* ---------------- ghost hand tutorial (boss.md §8, design.md §11) ---------------- */

function GhostHand({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2 * 1600 + 500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="pointer-events-none absolute inset-0 z-[60]" aria-hidden>
      <motion.div
        className="absolute left-1/2 top-[66%]"
        animate={{
          x: [-32, -32, -92, -92, 76, 76, -32],
          y: [0, 0, -150, -150, 30, 30, 0],
          opacity: [0, 1, 1, 1, 1, 0, 0],
        }}
        transition={{ duration: 1.6, repeat: 1, times: [0, 0.1, 0.45, 0.6, 0.82, 0.96, 1], ease: 'easeInOut' }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber/40 shadow-glow-amber">
          <Hand className="h-8 w-8 text-amber" />
        </div>
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="absolute inset-x-0 top-[46%] text-center text-body font-bold text-amber"
      >
        Drag to aim. Tap to fire.
      </motion.p>
    </div>
  )
}

/* ---------------- FIRE button with 900ms reload ring (boss.md §2) ---------------- */

function FireButton({
  locked,
  lockLambda,
  reloadKey,
  onFire,
}: {
  locked: boolean
  lockLambda: number | null
  reloadKey: number
  onFire: () => void
}) {
  const R = 29
  const CIRC = 2 * Math.PI * R
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        aria-label="Fire"
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.09 }}
        onClick={onFire}
        className={cn(
          'relative flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] bg-cyan/10',
          locked ? 'border-magenta text-magenta shadow-glow-magenta' : 'border-cyan text-cyan',
        )}
      >
        <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" stroke="#223354" strokeWidth="3" />
          <motion.circle
            key={reloadKey}
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={locked ? '#FF2E93' : '#22D3EE'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            initial={{ strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 0.9, ease: 'linear' }}
          />
        </svg>
        <Crosshair className="h-6 w-6" />
      </motion.button>
      <span className={cn('font-mono text-[10px] font-bold', locked ? 'text-magenta' : 'text-low')}>
        {locked && lockLambda !== null ? `×${fmtM(Math.abs(lockLambda))} LOCK` : 'FIRE'}
      </span>
    </div>
  )
}

/* ---------------- center modal shell (design.md §13 modal) ---------------- */

function CenterModal({
  onClose,
  children,
  ariaLabel,
  dismissable = true,
}: {
  onClose: () => void
  children: React.ReactNode
  ariaLabel: string
  dismissable?: boolean
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="scrim fixed inset-0 z-40"
        onClick={() => dismissable && onClose()}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={pop}
        className="fixed left-1/2 top-1/2 z-40 w-[86%] max-w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-night-2 p-5 shadow-panel"
      >
        {children}
      </motion.div>
    </>
  )
}

/* ---------------- the page ---------------- */

export default function Boss() {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<BossEngine | null>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hud, setHud] = useState<HudState | null>(null)
  const [eqText, setEqText] = useState('M=[2 0; 0 0.5] · P1 STONE SENTINEL')
  const [banner, setBanner] = useState<{ main: string; sub: string; key: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [edgeFlash, setEdgeFlash] = useState(0)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [victory, setVictory] = useState<{ stars: number } | null>(null)
  const [matrixModal, setMatrixModal] = useState<MatrixModal>('closed')
  const [ghostOn, setGhostOn] = useState(false)

  const hearts = hud?.hearts ?? 3
  const ghostHints = useGameStore(
    (s) => (s.settings as SettingsState & { ghostHints?: boolean }).ghostHints ?? true,
  )
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion)

  /* engine lifecycle */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new BossEngine(canvas, {
      onHud: (h) => setHud(h),
      onBanner: (main, sub) => {
        setBanner({ main, sub, key: Date.now() })
        if (bannerTimer.current) clearTimeout(bannerTimer.current)
        bannerTimer.current = setTimeout(() => setBanner(null), main.length * 40 + 1600 + 500)
      },
      onFired: () => setReloadKey((k) => k + 1),
      onPlayerHit: () => setEdgeFlash((n) => n + 1),
      onToast: (t) => setToast(t),
      onFail: () => setFailed(true),
      onVictory: ({ stars }) => setVictory({ stars }),
      onEquation: (t) => setEqText(t),
      onPauseRequest: () => setPauseOpen(true),
    })
    engineRef.current = engine
    engine.start()

    // first-time ghost-hand demo (never blocks input; replayable from pause)
    const lv = useGameStore.getState().levels
    const hintsOn =
      (useGameStore.getState().settings as SettingsState & { ghostHints?: boolean }).ghostHints ??
      true
    if (hintsOn && !lv['5-8']?.completed && !lv['boss']?.completed) setGhostOn(true)

    return () => {
      engine.destroy()
      engineRef.current = null
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
    }
  }, [])

  /* pause the sim while DOM modals are open */
  const modalOpen = pauseOpen || matrixModal !== 'closed'
  useEffect(() => {
    engineRef.current?.setPaused(modalOpen)
  }, [modalOpen])

  /* victory → write chapter-5 completion, then route to results */
  useEffect(() => {
    if (!victory) return
    const s = useGameStore.getState()
    s.completeLevel('5-8', victory.stars, 150, 200)
    s.setCurrentLevel('6-1')
    s.setResumeLevel(null)
    const t = setTimeout(() => navigate('/results?level=5-8'), 1400)
    return () => clearTimeout(t)
  }, [victory, navigate])

  const fire = () => engineRef.current?.fire()

  const retry = () => {
    setFailed(false)
    engineRef.current?.retryPhase()
  }

  const replayGhost = () => {
    setPauseOpen(false)
    setGhostOn(true)
  }

  /* matrix chip tap vs long-press (400ms) → magnify / nerd note (boss.md §3) */
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chipDown = () => {
    chipTimer.current = setTimeout(() => {
      chipTimer.current = null
      haptics.purr()
      setMatrixModal('nerd')
    }, 400)
  }
  const chipUp = () => {
    if (chipTimer.current) {
      clearTimeout(chipTimer.current)
      chipTimer.current = null
      haptics.tick()
      sfx.tick()
      setMatrixModal('magnify')
    }
  }

  const m = hud?.matrix ?? { a: 2, b: 0, c: 0, d: 0.5 }
  const invuln = hud?.invulnerable ?? false
  const survival = hud?.survivalLeft ?? null

  return (
    <div className="relative flex-1 overflow-hidden bg-night-0">
      {/* world canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, touchAction: 'none' }}
        aria-hidden
      />

      {/* boss HUD: pause · name · hearts (48px + safe) */}
      <div className="absolute inset-x-0 top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex h-12 items-center justify-between px-3">
          <IconButton ariaLabel="Pause" onClick={() => setPauseOpen(true)}>
            <Pause className="h-5 w-5" />
          </IconButton>
          <h1
            className="font-display text-[15px] text-magenta"
            style={{ textShadow: '0 0 12px rgba(255,46,147,.6)' }}
          >
            EIGEN · THE UNMOVED
          </h1>
          <div className="flex items-center gap-1" role="img" aria-label={`${hearts} of 3 hearts`}>
            {[0, 1, 2].map((i) => (
              <motion.svg
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...pop, delay: 0.3 + i * 0.08 }}
                width="22"
                height="22"
                viewBox="0 0 24 24"
                className={i < hearts ? 'text-coral' : 'text-night-3'}
                style={i < hearts ? { filter: 'drop-shadow(0 0 6px rgba(255,107,74,.5))' } : undefined}
                aria-hidden
              >
                <use href="/icons-game.svg#i-heart" />
              </motion.svg>
            ))}
          </div>
        </div>

        {/* segmented HP bar (12px) — survival countdown during 3a */}
        <div className="px-4">
          {invuln ? (
            <div className="flex h-3 items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded-[4px] border border-line/60 bg-night-3">
                <div
                  className="h-full bg-violet transition-[width] duration-200"
                  style={{ width: `${clamp(((survival ?? 0) / 12) * 100, 0, 100)}%` }}
                />
              </div>
              <span className="font-mono text-[10px] font-bold text-violet">
                {survival !== null ? `SURVIVE ${Math.ceil(survival)}s` : 'INVULNERABLE'}
              </span>
            </div>
          ) : (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex h-3 origin-left gap-[3px]"
              role="img"
              aria-label={`Boss HP ${Math.ceil(hud?.hp ?? 0)} of ${hud?.maxHp ?? 0}`}
            >
              {Array.from({ length: hud?.maxHp ?? 6 }).map((_, i) => {
                const fill = clamp((hud?.hp ?? 0) - i, 0, 1)
                return (
                  <div key={i} className="flex-1 overflow-hidden rounded-[3px] border border-line/60 bg-night-3">
                    <div
                      className="h-full bg-magenta transition-[width] duration-200"
                      style={{
                        width: `${fill * 100}%`,
                        boxShadow: fill > 0 ? '0 0 8px rgba(255,46,147,.5)' : undefined,
                      }}
                    />
                  </div>
                )
              })}
            </motion.div>
          )}
        </div>
      </div>

      {/* phase / intro banner */}
      <AnimatePresence>{banner && <Banner key={banner.key} main={banner.main} sub={banner.sub} />}</AnimatePresence>

      {/* accessibility mirror (aria-live) above the control strip */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom)+8px)] z-30 flex justify-center">
        <EquationChip text={eqText} />
      </div>

      {/* control strip: matrix chip · FIRE (96px + safe) */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-night-0/95 via-night-0/60 to-transparent"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex h-24 items-end justify-between gap-3 px-4 pb-2">
          {/* matrix chip — tap to magnify, long-press for the Nerd Note */}
          <motion.button
            key={hud?.phaseIdx ?? 0}
            type="button"
            aria-label={`Arena matrix ${fmtM(m.a)} ${fmtM(m.b)} ${fmtM(m.c)} ${fmtM(m.d)}. Tap to magnify, hold for nerd note.`}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={pop}
            onPointerDown={chipDown}
            onPointerUp={chipUp}
            onPointerLeave={() => chipTimer.current && clearTimeout(chipTimer.current)}
            className="flex flex-col items-center gap-0.5 rounded-md border border-violet/50 bg-night-2/90 px-3 py-2 shadow-glow-violet"
          >
            <span className="font-mono text-mono-s font-bold leading-tight text-violet">
              [{fmtM(m.a)} {fmtM(m.b)}]
            </span>
            <span className="font-mono text-mono-s font-bold leading-tight text-violet">
              [{fmtM(m.c)} {fmtM(m.d)}]
            </span>
            <span className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-low">matrix</span>
          </motion.button>

          <FireButton
            locked={hud?.locked ?? false}
            lockLambda={hud?.lockLambda ?? null}
            reloadKey={reloadKey}
            onFire={fire}
          />
        </div>
      </div>

      {/* player-hit edge flash */}
      <AnimatePresence>
        {edgeFlash > 0 && (
          <motion.div
            key={edgeFlash}
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pointer-events-none absolute inset-0 z-30"
            style={{ boxShadow: 'inset 0 0 64px rgba(255,77,109,.85)' }}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* ghost-hand tutorial */}
      {ghostOn && !reduceMotion && <GhostHand onDone={() => setGhostOn(false)} />}

      {/* toast (echo hints) */}
      <Toast message={toast} onDone={() => setToast(null)} />

      {/* pause menu */}
      <AnimatePresence>
        {pauseOpen && (
          <CenterModal key="pause" onClose={() => setPauseOpen(false)} ariaLabel="Paused">
            <h2 className="mb-4 text-center font-display text-h1 text-hi">PAUSED</h2>
            <div className="flex flex-col gap-2">
              <NeonButton onClick={() => setPauseOpen(false)}>Resume</NeonButton>
              <NeonButton
                variant="secondary"
                onClick={() => {
                  engineRef.current?.retryPhase()
                  setPauseOpen(false)
                }}
              >
                <RotateCcw className="h-4 w-4" /> Restart
              </NeonButton>
              <NeonButton variant="secondary" onClick={replayGhost}>
                <Hand className="h-4 w-4" /> Show me again
              </NeonButton>
              <NeonButton variant="secondary" onClick={() => navigate('/settings')}>
                <SettingsIcon className="h-4 w-4" /> Settings
              </NeonButton>
              <NeonButton variant="ghost" onClick={() => navigate('/map')}>
                <MapIcon className="h-4 w-4" /> Quit to map
              </NeonButton>
            </div>
          </CenterModal>
        )}
      </AnimatePresence>

      {/* soft fail — checkpointed, no shame (boss.md §5) */}
      <AnimatePresence>
        {failed && (
          <CenterModal key="fail" onClose={() => {}} ariaLabel="The Keep holds" dismissable={false}>
            <div className="flex flex-col items-center gap-3 text-center">
              <img src="/mascot-vex.png" alt="Vex, powered down" className="h-20 w-20 opacity-50 grayscale" />
              <h2 className="font-display text-h1 text-hi">THE KEEP HOLDS…</h2>
              <p className="text-body font-semibold text-mid">this time.</p>
              <div className="mt-2 flex w-full flex-col gap-2">
                <NeonButton onClick={retry}>Retry phase</NeonButton>
                <NeonButton variant="ghost" onClick={() => navigate('/map')}>
                  Map
                </NeonButton>
              </div>
            </div>
          </CenterModal>
        )}
      </AnimatePresence>

      {/* matrix magnify / Nerd Note (boss.md §3) */}
      <AnimatePresence>
        {matrixModal !== 'closed' && (
          <CenterModal key="matrix" onClose={() => setMatrixModal('closed')} ariaLabel="Arena matrix">
            <div className="flex flex-col items-center gap-3">
              <div className="flex w-full items-center justify-between">
                <span className="text-caption font-extrabold uppercase tracking-[0.12em] text-violet">
                  {hud?.phaseName ?? ''}
                </span>
                <IconButton ariaLabel="Close" onClick={() => setMatrixModal('closed')} className="h-9 w-9">
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="flex flex-col items-center rounded-lg border border-violet/50 bg-night-1 px-6 py-4 shadow-glow-violet">
                <span className="font-mono text-2xl font-bold text-violet">
                  [{fmtM(m.a)}  {fmtM(m.b)}]
                </span>
                <span className="font-mono text-2xl font-bold text-violet">
                  [{fmtM(m.c)}  {fmtM(m.d)}]
                </span>
              </div>
              {matrixModal === 'nerd' ? (
                <p className="text-center text-body font-semibold text-mid">
                  Shots that don’t curve are its <span className="text-magenta">eigen-directions</span>.
                  Their stretch is the <span className="text-magenta">eigenvalue</span> — that’s your damage.
                </p>
              ) : (
                <p className="text-center text-caption font-bold uppercase tracking-[0.1em] text-low">
                  hold the chip for a nerd note
                </p>
              )}
            </div>
          </CenterModal>
        )}
      </AnimatePresence>

      {/* victory: letterbox + KEEP CLEARED (boss.md §6) */}
      <AnimatePresence>
        {victory && (
          <div key="victory" className="absolute inset-0 z-40">
            <motion.div
              initial={{ y: -60 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 top-0 h-[60px] bg-black"
            />
            <motion.div
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 h-[60px] bg-black"
            />
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <motion.h2
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={sheetSpring}
                className="font-display text-display-xl text-magenta"
                style={{ textShadow: '0 0 12px rgba(255,46,147,.7), 0 0 48px rgba(255,46,147,.3)' }}
              >
                KEEP CLEARED
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-caption font-extrabold uppercase tracking-[0.16em] text-gold"
              >
                the unmoved path is yours
              </motion.p>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
