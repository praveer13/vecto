import { asset } from '@/lib/asset'
import { useGameStore } from '@/store/gameStore'
import { haptics } from '@gridverse/kit/lib'
import { sfx } from '@gridverse/kit/lib'
import { bossSfx } from './bossSfx'
import { getPalette, type Palette } from './palette'
import {
  eigenDirections,
  easeInOut,
  easeOutBack,
  clamp,
  wrapAng,
  mulV,
  lerpMat,
  norm,
  fromAng,
  angOf,
  dot,
  cross,
  dist,
  type Mat2,
  type Vec,
  type EigenInfo,
} from './math2'

/**
 * Eigen Keep canvas engine — boss.md.
 * Ballistics model (§2): a shot is a vector; the arena matrix M re-aims its
 * velocity (v ← normalize(M·v)) continuously. Eigen-direction shots stay
 * parallel to themselves (M·v = λv) so they fly straight and strike for |λ|
 * damage; negative λ flips the shot back at the player. Phase 3a's pure
 * rotation has no real eigen-direction — every shot spirals off.
 *
 * Rendering per design.md §12: single canvas, DPR-aware (cap 2.5), rAF loop,
 * fixed-timestep 120Hz sim, pre-baked glow sprites (no ctx.shadowBlur in the
 * frame loop), pooled particles, flow-line vertices precomputed per matrix.
 */

/* ---------------- phase table (boss.md §4 — designer-verified math) ---------------- */

export interface BossPhase {
  key: string
  name: string
  M: Mat2
  hp: number
  volleyEvery: number
  volleyCount: number
  orbSpeed: number
  /** angular speed (rad/s) at which M re-aims non-eigen shots */
  turnRate: number
  invulnerable?: boolean
  /** seconds of survival for 3a */
  survival?: number
  sway: { ax: number; ay: number; tx: number; ty: number }
}

export const PHASES: BossPhase[] = [
  {
    key: 'p1',
    name: 'STONE SENTINEL',
    M: { a: 2, b: 0, c: 0, d: 0.5 },
    hp: 6,
    volleyEvery: 3.5,
    volleyCount: 3,
    orbSpeed: 3.1,
    turnRate: 9,
    sway: { ax: 1.5, ay: 1.0, tx: 7, ty: 6 },
  },
  {
    key: 'p2',
    name: 'TWIN REACTOR',
    M: { a: 1, b: 2, c: 2, d: 1 },
    hp: 8,
    volleyEvery: 3.2,
    volleyCount: 4,
    orbSpeed: 3.3,
    turnRate: 9,
    sway: { ax: 2.1, ay: 0.9, tx: 5.5, ty: 6.5 },
  },
  {
    key: 'p3a',
    name: 'THE REFORM',
    M: { a: 0, b: -1.5, c: 1.5, d: 0 },
    hp: 0,
    volleyEvery: 2.3,
    volleyCount: 5,
    orbSpeed: 3.0,
    turnRate: 3.4,
    invulnerable: true,
    survival: 12,
    sway: { ax: 0.6, ay: 0.5, tx: 9, ty: 5 },
  },
  {
    key: 'p3b',
    name: 'CRACKED CORE',
    M: { a: 1, b: 1, c: 0, d: 2 },
    hp: 10,
    volleyEvery: 2.6,
    volleyCount: 4,
    orbSpeed: 3.6,
    turnRate: 10,
    sway: { ax: 2.3, ay: 1.1, tx: 4.6, ty: 5 },
  },
]

/* ---------------- engine ↔ React bridge ---------------- */

export interface HudState {
  phaseIdx: number
  phaseName: string
  phaseKey: string
  hp: number
  maxHp: number
  hearts: number
  invulnerable: boolean
  survivalLeft: number | null
  matrix: Mat2
  locked: boolean
  lockLambda: number | null
  hintsUsed: number
}

export interface EngineEvents {
  onHud: (h: HudState) => void
  /** big center banner (intro boss name, phase names) */
  onBanner: (main: string, sub: string) => void
  /** a shot left the muzzle — restart the FIRE reload ring */
  onFired: () => void
  /** player took a hit — flash the screen edges */
  onPlayerHit: () => void
  /** coach-mark toast (echo hints) */
  onToast: (text: string) => void
  onFail: () => void
  onVictory: (stats: { stars: number; hintsUsed: number }) => void
  /** aria-live mirror of canvas math state (design.md §12) */
  onEquation: (text: string) => void
  /** visibilitychange / hidden → open pause menu */
  onPauseRequest: () => void
}

/* ---------------- internal entity types ---------------- */

interface Shot {
  pos: Vec
  vel: Vec
  speed: number
  t: number
  traveled: number
  eigen: EigenInfo | null
  hostile: boolean
  flipWarnT: number
  flipped: boolean
  blocked: boolean
  trail: { p: Vec; t: number }[]
  dead: boolean
}

interface Orb {
  pos: Vec
  vel: Vec
  speed: number
  t: number
  life: number
  fieldBlend: number
  ring: boolean
  dead: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  color: string
  kind: 'spark' | 'shard' | 'confetti' | 'voxel'
  rot: number
  vr: number
  grav: number
}

interface DamageNum {
  pos: Vec
  text: string
  t0: number
  kind: 'crit' | 'mega' | 'glance' | 'hit' | 'block'
}

interface Echo {
  dir: Vec
  t0: number
  dur: number
}

const RELOAD_S = 0.9
const SHOT_SPEED = 7.5
const EIGEN_TOL = (9 * Math.PI) / 180
const MAX_PARTICLES = 48
const TRAIL_S = 1.2
const ORB_HIT_DIST = 0.72
const POD_GRAB_DIST = 1.0

export class BossEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private events: EngineEvents

  private raf = 0
  private running = false
  private destroyed = false
  private lastNow = 0
  private acc = 0

  /** sim seconds since engine start (scaled by timeScale) */
  private time = 0
  private timeScale = 1
  paused = false
  private frozen = false // fail/victory: sim halted, render continues

  // layout
  private W = 0
  private H = 0
  private S = 44 // px per world unit
  private ox = 0 // origin (boss plinth) screen x
  private oy = 0 // origin screen y
  private railRx = 4.2
  private railRy = 8.4
  private railMax = (80 * Math.PI) / 180
  private xBound = 4.7
  private yTop = 6.1
  private yBot = -8.4

  // game state
  private phaseIdx = 0
  private M: Mat2 = { ...PHASES[0].M }
  private hp = PHASES[0].hp
  private hearts = 3
  private bossPos: Vec = { x: 0, y: 0 }
  private bossFlinchT = 0
  private podTheta = 0
  private aimAngle = Math.PI / 2
  private reloadT = 0
  private shots: Shot[] = []
  private orbs: Orb[] = []
  private particles: Particle[] = []
  private damageNums: DamageNum[] = []
  private echo: Echo | null = null
  private missStreak = 0
  hintsUsed = 0
  private firstEchoFree: boolean
  private volleyT = 2.2
  private volleyAlt = false
  private playerInvulnT = 0
  private survivalT: number | null = null
  private shakeT = 0
  private shakeMag = 0

  // sequences
  private introT = 0 // 0..1 entry plunge + boss drop
  private transT: number | null = null // phase transition timeline
  private transFrom: Mat2 | null = null
  private crackT: number | null = null // 3a→3b armor crack
  private victoryT: number | null = null
  private failT: number | null = null
  private statsSent = false

  // phase-2 armor plates / lane occlusion
  private occlIdx = 0
  private occlT = 0
  private plateAng: number[] = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

  // input
  private dragMode: 'pod' | 'aim' | null = null
  private downPos: Vec = { x: 0, y: 0 }
  private downTime = 0
  private moved = false

  // assets
  private imgBoss = new Image()
  private imgVex = new Image()
  private imgKeep = new Image()
  private glowCache = new Map<string, HTMLCanvasElement>()

  // flow lines (precomputed deformed vertices per matrix)
  private flowLines: Vec[][] = []
  private flowRecompT = 0

  private lastHudKey = ''
  private lastEq = ''
  private eqT = 0
  private swirlT = 0

  // victory fx state
  private bossGone = false
  private whiteFlashT = 0
  private spinAngle = 0

  constructor(canvas: HTMLCanvasElement, events: EngineEvents) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.events = events
    const lv = useGameStore.getState().levels
    this.firstEchoFree = !lv['boss']?.completed && !lv['5-8']?.completed

    this.imgBoss.src = asset('boss-eigen.png')
    this.imgVex.src = asset('mascot-vex.png')
    this.imgKeep.src = asset('zone-eigen-keep.png')

    this.resize()
    window.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVis)
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)

    this.recomputeFlow()
    this.emitHud(true)
  }

  /* ---------------- lifecycle ---------------- */

  start() {
    if (this.running) return
    this.running = true
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.frame)
    bossSfx.drone.start()
    bossSfx.drone.base()
    this.events.onBanner('EIGEN · THE UNMOVED', 'THE KEEP BENDS EVERY SHOT')
    sfx.warp()
  }

  destroy() {
    this.destroyed = true
    this.running = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this.onVis)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.canvas.removeEventListener('pointercancel', this.onUp)
    bossSfx.drone.stop()
  }

  setPaused(p: boolean) {
    if (this.destroyed) return
    this.paused = p
    if (p) bossSfx.drone.duck()
    else bossSfx.drone.base()
  }

  private onVis = () => {
    if (document.hidden && this.running && !this.paused && !this.frozen) {
      this.events.onPauseRequest()
    }
  }

  /** DOM FIRE button → engine */
  fire() {
    this.tryFire()
  }

  /** soft-fail modal → retry current phase */
  retryPhase() {
    const ph = PHASES[this.phaseIdx]
    this.hp = ph.hp
    this.hearts = 3
    this.shots = []
    this.orbs = []
    this.damageNums = []
    this.echo = null
    this.missStreak = 0
    this.playerInvulnT = 1.5
    this.volleyT = 2.4
    this.survivalT = ph.survival ?? null
    this.frozen = false
    this.failT = null
    this.timeScale = 1
    this.bossGone = false
    this.whiteFlashT = 0
    this.emitHud(true)
  }

  /* ---------------- layout ---------------- */

  private resize = () => {
    const parent = this.canvas.parentElement
    const rect = parent?.getBoundingClientRect()
    const w = Math.max(280, rect?.width ?? window.innerWidth)
    const h = Math.max(480, rect?.height ?? window.innerHeight)
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    this.W = w
    this.H = h
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.S = Math.min(w / 9.4, h / 15.6)
    this.ox = w / 2
    this.oy = h * 0.3
    this.xBound = w / 2 / this.S + 0.2
    this.yTop = this.oy / this.S + 0.2
    this.yBot = -(h - this.oy) / this.S - 0.2
    // keep the rail inside the canvas on narrow screens
    this.railRx = Math.min(4.2, w / 2 / this.S - 0.55)
    this.railRy = Math.min(8.4, (h - this.oy - 150) / this.S)
    this.recomputeFlow()
  }

  private w2s(p: Vec): Vec {
    return { x: this.ox + p.x * this.S, y: this.oy - p.y * this.S }
  }
  private s2w(p: Vec): Vec {
    return { x: (p.x - this.ox) / this.S, y: (this.oy - p.y) / this.S }
  }

  private podPos(): Vec {
    return {
      x: this.railRx * Math.sin(this.podTheta),
      y: -this.railRy * Math.cos(this.podTheta),
    }
  }

  private bossHitR(): number {
    return 1.35
  }

  /* ---------------- input ---------------- */

  private pointerWorld(e: PointerEvent): Vec {
    const rect = this.canvas.getBoundingClientRect()
    return this.s2w({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  private onDown = (e: PointerEvent) => {
    if (this.paused || this.frozen) return
    e.preventDefault()
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* no-op */
    }
    const p = this.pointerWorld(e)
    this.downPos = p
    this.downTime = performance.now()
    this.moved = false
    this.dragMode = dist(p, this.podPos()) < POD_GRAB_DIST ? 'pod' : 'aim'
    if (this.dragMode === 'pod') haptics.tick()
    else this.aimAt(p)
  }

  private onMove = (e: PointerEvent) => {
    if (!this.dragMode || this.paused || this.frozen) return
    const p = this.pointerWorld(e)
    if (dist(p, this.downPos) * this.S > 6) this.moved = true
    if (this.dragMode === 'pod') {
      // project pointer onto the rail ellipse
      const t = Math.atan2(p.x / this.railRx, -p.y / this.railRy)
      const nt = clamp(t, -this.railMax, this.railMax)
      if (nt !== this.podTheta) this.podTheta = nt
    } else {
      this.aimAt(p)
    }
  }

  private onUp = (e: PointerEvent) => {
    if (this.paused || this.frozen) {
      this.dragMode = null
      return
    }
    const quickTap = performance.now() - this.downTime < 260 && !this.moved
    if (this.dragMode === 'aim' && quickTap) {
      this.aimAt(this.pointerWorld(e))
      this.tryFire() // tap arena = aim + fire (design.md §11)
    }
    this.dragMode = null
  }

  private aimAt(p: Vec) {
    const muzzle = this.podPos()
    this.aimAngle = Math.atan2(p.y - muzzle.y, p.x - muzzle.x)
  }

  /* ---------------- firing & eigen lock ---------------- */

  /** eigen lock for the current (pod, aim): within tol of an eigen line AND the ray passes the boss */
  private currentLock(): { eigen: EigenInfo; aligned: boolean } | null {
    const ph = PHASES[this.phaseIdx]
    const eigs = eigenDirections(this.M)
    if (eigs.length === 0 || ph.invulnerable) return null
    const muzzle = this.podPos()
    const aimDir = fromAng(this.aimAngle)
    for (const eg of eigs) {
      const dAng = Math.abs(wrapAng(this.aimAngle - angOf(eg.dir)))
      const dAng2 = Math.abs(wrapAng(this.aimAngle - angOf(eg.dir) - Math.PI))
      if (Math.min(dAng, dAng2) > EIGEN_TOL) continue
      const toBoss = { x: this.bossPos.x - muzzle.x, y: this.bossPos.y - muzzle.y }
      const t = dot(toBoss, aimDir)
      if (t <= 0.5) return { eigen: eg, aligned: false }
      const perp = Math.abs(cross(toBoss, aimDir))
      return { eigen: eg, aligned: perp <= this.bossHitR() * 0.95 }
    }
    return null
  }

  private tryFire() {
    if (this.paused || this.frozen || this.reloadT > 0 || this.introT < 1) return
    if (this.transT !== null || this.crackT !== null || this.victoryT !== null || this.failT !== null)
      return
    this.reloadT = RELOAD_S
    const ph = PHASES[this.phaseIdx]
    const muzzle = this.podPos()
    let dir = fromAng(this.aimAngle)

    // eigen magnetism: snap to the exact direction when close (boss.md §3 aim assist)
    const eigs = eigenDirections(this.M)
    let eigen: EigenInfo | null = null
    if (!ph.invulnerable) {
      for (const eg of eigs) {
        const d1 = Math.abs(wrapAng(this.aimAngle - angOf(eg.dir)))
        const d2 = Math.abs(wrapAng(this.aimAngle - angOf(eg.dir) - Math.PI))
        if (Math.min(d1, d2) <= EIGEN_TOL) {
          eigen = eg
          dir = d1 <= d2 ? eg.dir : { x: -eg.dir.x, y: -eg.dir.y }
          break
        }
      }
    }

    const start = {
      x: muzzle.x + dir.x * 0.8,
      y: muzzle.y + dir.y * 0.8,
    }
    this.shots.push({
      pos: start,
      vel: { x: dir.x * SHOT_SPEED, y: dir.y * SHOT_SPEED },
      speed: SHOT_SPEED,
      t: 0,
      traveled: 0,
      eigen,
      hostile: false,
      flipWarnT: 0,
      flipped: false,
      blocked: false,
      trail: [{ p: { ...start }, t: this.time }],
      dead: false,
    })

    const pal = this.palette()
    this.burst(start, eigen ? pal.mint : pal.amber, 8, 2.2, 'spark') // muzzle flash
    haptics.release()
    bossSfx.launch()
    this.events.onFired()
  }

  /* ---------------- fixed-timestep sim ---------------- */

  private frame = (now: number) => {
    if (!this.running || this.destroyed) return
    this.raf = requestAnimationFrame(this.frame)
    const realDt = Math.min(0.1, (now - this.lastNow) / 1000)
    this.lastNow = now

    if (!this.paused) {
      // fail slow-mo runs on real time (boss.md §5: 0.3× for 600ms)
      if (this.failT !== null) {
        this.failT -= realDt
        if (this.failT <= 0) {
          this.failT = null
          this.frozen = true
          this.timeScale = 1
          this.events.onFail()
        }
      }
      const dt = realDt * this.timeScale
      this.acc = Math.min(0.25, this.acc + dt)
      const step = 1 / 120
      while (this.acc >= step) {
        if (!this.frozen) this.sim(step)
        this.acc -= step
      }
      this.shakeT = Math.max(0, this.shakeT - realDt)
    }
    this.render(now / 1000)
  }

  private sim(dt: number) {
    const ph = PHASES[this.phaseIdx]
    this.time += dt

    // intro plunge (500ms) + boss drop
    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / 1.05)
      if (this.introT >= 0.45 && this.introT - dt / 1.05 < 0.45) {
        // boss lands on the plinth
        this.burst({ x: 0, y: -0.6 }, '#FF2E93', 18, 3.4, 'spark')
        this.addShake(0.25, 3)
        bossSfx.thump()
      }
    }

    // boss hover sway
    const sw = ph.sway
    this.bossPos = {
      x: sw.ax * Math.sin((this.time * 2 * Math.PI) / sw.tx),
      y: 0.1 + sw.ay * Math.sin((this.time * 2 * Math.PI) / sw.ty + 1.3),
    }
    this.bossFlinchT = Math.max(0, this.bossFlinchT - dt)
    this.reloadT = Math.max(0, this.reloadT - dt)
    this.playerInvulnT = Math.max(0, this.playerInvulnT - dt)

    // phase transition timeline
    if (this.transT !== null) {
      this.transT += dt
      const k = clamp(this.transT / 0.6, 0, 1)
      this.M = lerpMat(this.transFrom!, ph.M, easeInOut(k))
      this.flowRecompT -= dt
      if (this.flowRecompT <= 0) {
        this.recomputeFlow()
        this.flowRecompT = 0.1
      }
      if (this.transT >= 0.9) {
        this.transT = null
        this.M = { ...ph.M }
        this.recomputeFlow()
      }
    } else if (this.crackT === null && this.victoryT === null && this.introT >= 1) {
      // volleys only in open play
      this.volleyT -= dt
      if (this.volleyT <= 0) {
        this.fireVolley(ph)
        this.volleyT = ph.volleyEvery
      }
    }

    // 3a survival countdown
    if (ph.survival && this.survivalT !== null && this.transT === null && this.crackT === null) {
      this.survivalT -= dt
      this.swirlT -= dt
      if (this.swirlT <= 0) {
        bossSfx.swirl()
        this.swirlT = 2.2
      }
      if (this.survivalT <= 0) {
        this.survivalT = null
        this.startCrack()
      }
      this.emitHud() // countdown tick
    }

    // armor-crack cinematic (3a → 3b), 800ms
    if (this.crackT !== null) {
      this.crackT += dt
      if (this.crackT >= 0.8) {
        this.crackT = null
        this.phaseIdx = 3
        this.beginTransition('CRACKED CORE', 'BOTH PATHS BURN BRIGHT')
      }
    }

    // victory cinematic timeline
    if (this.victoryT !== null) {
      const prevV = this.victoryT
      this.victoryT += dt
      if (prevV < 0.9 && this.victoryT >= 0.9) this.shatterBoss()
      if (this.victoryT >= 0.9 && !this.statsSent) {
        this.statsSent = true
        const stars = this.hintsUsed > 0 ? 2 : 3
        this.events.onVictory({ stars, hintsUsed: this.hintsUsed })
      }
    }

    // phase-2 lane occlusion alternates every 4s
    if (this.phaseIdx === 1 && this.transT === null) {
      this.occlT += dt
      if (this.occlT >= 4) {
        this.occlT = 0
        this.occlIdx = 1 - this.occlIdx
      }
    }
    for (let i = 0; i < 4; i++) this.plateAng[i] += dt * (0.5 + i * 0.07)

    this.simShots(dt, ph)
    this.simOrbs(dt)
    this.simParticles(dt)
    this.damageNums = this.damageNums.filter((d) => this.time - d.t0 < 0.65)
    if (this.echo && this.time - this.echo.t0 > this.echo.dur) this.echo = null

    this.eqT -= dt
    if (this.eqT <= 0) {
      this.eqT = 0.25
      this.pushEquation()
    }
    this.emitHud()
  }

  /* ---------------- shots ---------------- */

  private simShots(dt: number, ph: (typeof PHASES)[number]) {
    const invuln = !!ph.invulnerable || this.transT !== null || this.victoryT !== null
    for (const s of this.shots) {
      if (s.dead) continue
      s.t += dt

      // negative-λ flip: 300ms warning shimmer, then U-turn (boss.md §2.4)
      if (s.eigen && s.eigen.lambda < 0 && !s.flipped) {
        if (s.flipWarnT <= 0 && s.traveled > 2.2) {
          s.flipWarnT = 0.3
          haptics.error()
          bossSfx.scratchWhoosh()
        }
        if (s.flipWarnT > 0) {
          s.flipWarnT -= dt
          if (s.flipWarnT <= 0) {
            s.vel = { x: -s.vel.x, y: -s.vel.y }
            s.flipped = true
            s.hostile = true
          }
        }
      }

      // the arena's M re-aims non-eigen shots (v ← normalize(M·v)) at the phase turn rate
      if (!s.eigen) {
        const mv = mulV(this.M, norm(s.vel))
        const target = angOf(mv)
        const cur = angOf(s.vel)
        const d = wrapAng(target - cur)
        const maxTurn = ph.turnRate * dt
        const na = cur + clamp(d, -maxTurn, maxTurn)
        s.vel = fromAng(na, s.speed)
      }

      s.pos.x += s.vel.x * dt
      s.pos.y += s.vel.y * dt
      s.traveled += s.speed * dt
      s.trail.push({ p: { ...s.pos }, t: this.time })
      while (s.trail.length > 2 && this.time - s.trail[0].t > TRAIL_S) s.trail.shift()

      // hostile (flipped) shot threatens the pod
      if (s.hostile) {
        if (this.playerInvulnT <= 0 && dist(s.pos, this.podPos()) < ORB_HIT_DIST) {
          s.dead = true
          this.playerHit()
          continue
        }
        if (!invuln && dist(s.pos, this.bossPos) < this.bossHitR()) {
          s.dead = true // corrupted shot fizzles on the boss, no damage
          this.burst(s.pos, '#64769C', 6, 1.6, 'spark')
        }
      } else if (invuln) {
        // 3a: shots spiral helplessly around the core and fizzle (boss.md §7)
        if (dist(s.pos, this.bossPos) < this.bossHitR() + 0.4 || s.traveled > 5.5 || s.t > 1.4) {
          s.dead = true
          this.burst(s.pos, this.palette().violet, 8, 2.0, 'spark')
          bossSfx.descend()
        }
      } else if (dist(s.pos, this.bossPos) < this.bossHitR()) {
        // phase-2 armor plates occlude one diagonal lane at a time
        if (s.eigen && this.phaseIdx === 1 && this.isLaneBlocked(s.eigen)) {
          s.dead = true
          s.blocked = true
          this.burst(s.pos, '#8B5CF6', 10, 2.4, 'voxel')
          this.damageNums.push({ pos: { ...s.pos }, text: 'BLOCKED', t0: this.time, kind: 'block' })
          haptics.error()
          sfx.error()
          continue
        }
        s.dead = true
        if (s.eigen) this.bossHit(s)
        else {
          // a curving shot bends around the core — no damage
          this.burst(s.pos, '#64769C', 6, 1.6, 'spark')
        }
        continue
      }

      // walls
      if (
        s.pos.x < -this.xBound ||
        s.pos.x > this.xBound ||
        s.pos.y > this.yTop ||
        s.pos.y < this.yBot
      ) {
        s.dead = true
        this.burst(
          { x: clamp(s.pos.x, -this.xBound, this.xBound), y: clamp(s.pos.y, this.yBot, this.yTop) },
          '#64769C',
          6,
          1.5,
          'spark',
        )
        if (!s.eigen && !s.hostile) {
          bossSfx.descend()
          this.registerCurvedMiss()
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead)
  }

  private isLaneBlocked(eigen: EigenInfo): boolean {
    const eigs = eigenDirections(this.M)
    const idx = eigs.findIndex((e) => Math.abs(cross(e.dir, eigen.dir)) < 1e-6)
    return idx === this.occlIdx
  }

  private bossHit(s: Shot) {
    const lambda = s.eigen!.lambda
    const dmg = Math.abs(lambda)
    this.hp = Math.max(0, this.hp - dmg)
    this.bossFlinchT = 0.2
    this.missStreak = 0

    const pal = this.palette()
    if (lambda >= 2.5) {
      // ×3 MEGA CRIT (boss.md §7)
      this.damageNums.push({ pos: { ...this.bossPos }, text: '×3 MEGA CRIT!', t0: this.time, kind: 'mega' })
      this.burst(this.bossPos, pal.magenta, 32, 4.2, 'spark')
      this.burst(this.bossPos, pal.gold, 8, 3.0, 'voxel')
      this.addShake(0.25, 2)
      hapticSeq([25, 30, 25, 30, 25])
      bossSfx.bell()
      bossSfx.riser()
    } else if (lambda >= 1.5) {
      this.damageNums.push({ pos: { ...this.bossPos }, text: '×2 CRIT!', t0: this.time, kind: 'crit' })
      this.burst(this.bossPos, pal.magenta, 24, 3.6, 'spark')
      this.burst(this.bossPos, pal.gold, 6, 2.4, 'voxel')
      haptics.crit()
      bossSfx.bell()
    } else if (lambda < 1) {
      this.damageNums.push({ pos: { ...this.bossPos }, text: '½ glancing', t0: this.time, kind: 'glance' })
      this.burst(this.bossPos, pal.cyan, 10, 2.2, 'spark')
      haptics.tick()
      bossSfx.bell()
    } else {
      this.damageNums.push({ pos: { ...this.bossPos }, text: '×1', t0: this.time, kind: 'hit' })
      this.burst(this.bossPos, pal.mint, 14, 2.6, 'spark')
      haptics.crit()
      bossSfx.bell()
    }
    this.emitHud(true)

    if (this.hp <= 0) {
      if (this.phaseIdx === 3) this.startVictory()
      else this.beginTransition(PHASES[this.phaseIdx + 1].name, this.phaseSub(this.phaseIdx + 1))
    }
  }

  private phaseSub(idx: number): string {
    switch (idx) {
      case 1:
        return 'ONE LANE HIDES · ONE LANE BURNS'
      case 2:
        return 'NO STRAIGHT SHOT · SURVIVE'
      default:
        return ''
    }
  }

  /* ---------------- orbs (boss volleys) ---------------- */

  private fireVolley(ph: (typeof PHASES)[number]) {
    const pod = this.podPos()
    const from = { ...this.bossPos }
    const base = Math.atan2(pod.y - from.y, pod.x - from.x)
    bossSfx.orb()

    if (ph.key === 'p3a' && this.volleyAlt) {
      // radial ring — rides the spinning field outward
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + this.time
        this.orbs.push({
          pos: { ...from },
          vel: fromAng(a, ph.orbSpeed * 0.75),
          speed: ph.orbSpeed * 0.75,
          t: 0,
          life: 7,
          fieldBlend: 0.55,
          ring: true,
          dead: false,
        })
      }
    } else {
      const n = ph.volleyCount
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.16
        this.orbs.push({
          pos: { ...from },
          vel: fromAng(a, ph.orbSpeed),
          speed: ph.orbSpeed,
          t: 0,
          life: 7,
          fieldBlend: 0.32,
          ring: false,
          dead: false,
        })
      }
    }
    this.volleyAlt = !this.volleyAlt
  }

  private simOrbs(dt: number) {
    const pod = this.podPos()
    for (const o of this.orbs) {
      if (o.dead) continue
      o.t += dt
      // steering: mostly seeks the pod, visibly bent by the field (predictable curves)
      const seek = norm({ x: pod.x - o.pos.x, y: pod.y - o.pos.y })
      const field = norm(mulV(this.M, norm(o.vel)))
      const blended = norm({
        x: seek.x * (1 - o.fieldBlend) + field.x * o.fieldBlend,
        y: seek.y * (1 - o.fieldBlend) + field.y * o.fieldBlend,
      })
      o.vel = { x: blended.x * o.speed, y: blended.y * o.speed }
      o.pos.x += o.vel.x * dt
      o.pos.y += o.vel.y * dt

      if (this.playerInvulnT <= 0 && this.failT === null && dist(o.pos, pod) < ORB_HIT_DIST) {
        o.dead = true
        this.playerHit()
        continue
      }
      if (
        o.t > o.life ||
        o.pos.x < -this.xBound ||
        o.pos.x > this.xBound ||
        o.pos.y > this.yTop ||
        o.pos.y < this.yBot
      ) {
        o.dead = true
      }
    }
    // pool cap
    if (this.orbs.length > 24) this.orbs.splice(0, this.orbs.length - 24)
    this.orbs = this.orbs.filter((o) => !o.dead)
  }

  private playerHit() {
    this.hearts = Math.max(0, this.hearts - 1)
    this.playerInvulnT = 1.3
    const pal = this.palette()
    this.burst(this.podPos(), pal.coral, 6, 3.0, 'shard') // heart shatter
    this.addShake(0.2, 2)
    haptics.error()
    bossSfx.thump()
    this.events.onPlayerHit()
    this.emitHud(true)
    if (this.hearts <= 0 && this.failT === null && this.victoryT === null) {
      // gentle fail: time slows 0.3× for 600ms, pod powers down (boss.md §5)
      this.timeScale = 0.3
      this.failT = 0.6
      bossSfx.powerDown()
      bossSfx.drone.duck()
    }
  }

  /* ---------------- echo hints (boss.md §3) ---------------- */

  private registerCurvedMiss() {
    if (this.transT !== null || this.victoryT !== null) return
    const ph = PHASES[this.phaseIdx]
    if (ph.invulnerable) return
    const eigs = eigenDirections(this.M)
    if (eigs.length === 0) return
    this.missStreak++
    const firstAt = this.firstEchoFree && this.hintsUsed === 0 ? 2 : 3
    if (this.missStreak >= firstAt) {
      this.missStreak = 0
      this.firstEchoFree = false
      const eg = eigs[this.hintsUsed % eigs.length]
      this.echo = { dir: eg.dir, t0: this.time, dur: 1.5 }
      this.hintsUsed++
      this.events.onToast('The Keep hums along one path…')
      this.emitHud(true)
    }
  }

  /* ---------------- phase flow ---------------- */

  private beginTransition(name: string, sub: string) {
    if (this.phaseIdx < PHASES.length - 1 && PHASES[this.phaseIdx].hp > 0 && this.hp <= 0) {
      this.phaseIdx++
    }
    const ph = PHASES[this.phaseIdx]
    this.transFrom = { ...this.M }
    this.transT = 0
    this.hp = ph.hp
    this.hearts = 3 // refill each phase (boss.md §1)
    this.survivalT = ph.survival ?? null
    this.volleyT = 2.4
    this.shots = []
    this.orbs = []
    this.echo = null
    this.missStreak = 0
    this.occlT = 0
    // shatter → roar → chip re-deal → grid tween → banner (boss.md §4)
    this.burst(this.bossPos, this.palette().magenta, 24, 4.0, 'voxel')
    this.addShake(0.4, 3)
    haptics.phaseBreak()
    bossSfx.roar()
    if (ph.key === 'p3a') bossSfx.drone.swell()
    else bossSfx.drone.base()
    this.events.onBanner(name, sub)
    this.emitHud(true)
    this.pushEquation(true)
  }

  private startCrack() {
    // 3a survived — armor shears off along the x-axis, revealing the eigen-direction
    this.crackT = 0
    this.shots = []
    bossSfx.crack()
    this.addShake(0.4, 3)
    haptics.phaseBreak()
    const pal = this.palette()
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? 1 : -1
      this.particles.push({
        x: this.bossPos.x,
        y: this.bossPos.y + (Math.random() - 0.5) * 1.6,
        vx: side * (3 + Math.random() * 3),
        vy: (Math.random() - 0.5) * 1.5,
        age: 0,
        life: 0.9,
        size: 0.16 + Math.random() * 0.14,
        color: pal.violet,
        kind: 'shard',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        grav: -2,
      })
    }
  }

  private startVictory() {
    this.victoryT = 0
    this.orbs = []
    this.shots = []
    this.damageNums = []
    bossSfx.drone.duck()
    this.emitHud(true)
  }

  /* ---------------- particles / fx ---------------- */

  private palette(): Palette {
    return getPalette(useGameStore.getState().settings.colorblind)
  }

  private burst(pos: Vec, color: string, n: number, speed: number, kind: Particle['kind']) {
    const reduce = useGameStore.getState().settings.reduceMotion
    const count = reduce ? Math.ceil(n / 3) : n
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
      const a = Math.random() * Math.PI * 2
      const v = speed * (0.4 + Math.random() * 0.6)
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        age: 0,
        life: 0.4 + Math.random() * 0.5,
        size: 0.05 + Math.random() * 0.09,
        color,
        kind,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        grav: kind === 'confetti' || kind === 'shard' ? -3 : 0,
      })
    }
  }

  private simParticles(dt: number) {
    for (const p of this.particles) {
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.grav * dt
      p.rot += p.vr * dt
      p.vx *= 1 - 1.8 * dt
    }
    this.particles = this.particles.filter((p) => p.age < p.life)
  }

  private addShake(dur: number, mag: number) {
    if (useGameStore.getState().settings.reduceMotion) return // reduce-motion: no shake (boss.md §8)
    this.shakeT = Math.max(this.shakeT, dur)
    this.shakeMag = mag
  }

  /* ---------------- flow lines (precomputed deformed vertices) ---------------- */

  private recomputeFlow() {
    const lines: Vec[][] = []
    const radii = [1.3, 2.5, 3.7, 5.0]
    const step = 0.16
    const steps = 40
    for (const r of radii) {
      const seeds = r < 2 ? 10 : 16
      for (let i = 0; i < seeds; i++) {
        const a = (i / seeds) * Math.PI * 2
        for (const dirSign of [1, -1]) {
          const pts: Vec[] = []
          let p = { x: Math.cos(a) * r, y: Math.sin(a) * r }
          for (let s = 0; s < steps; s++) {
            if (
              p.x < -this.xBound ||
              p.x > this.xBound ||
              p.y > this.yTop ||
              p.y < this.yBot
            )
              break
            pts.push(p)
            const f = norm(mulV(this.M, p))
            p = { x: p.x + f.x * step * dirSign, y: p.y + f.y * step * dirSign }
          }
          if (pts.length > 2) lines.push(pts)
        }
      }
    }
    this.flowLines = lines
  }

  /* ---------------- HUD sync ---------------- */

  private emitHud(force = false) {
    const ph = PHASES[this.phaseIdx]
    const lock = this.currentLock()
    const hud: HudState = {
      phaseIdx: this.phaseIdx,
      phaseName: ph.name,
      phaseKey: ph.key,
      hp: this.hp,
      maxHp: ph.hp,
      hearts: this.hearts,
      invulnerable: !!ph.invulnerable || this.transT !== null,
      survivalLeft: this.survivalT,
      matrix: this.M,
      locked: !!lock?.aligned,
      lockLambda: lock?.aligned ? lock.eigen.lambda : null,
      hintsUsed: this.hintsUsed,
    }
    const key = `${hud.phaseIdx}|${hud.hp}|${hud.hearts}|${hud.invulnerable}|${hud.locked}|${hud.lockLambda}|${hud.hintsUsed}|${hud.survivalLeft?.toFixed(1)}`
    if (force || key !== this.lastHudKey) {
      this.lastHudKey = key
      this.events.onHud(hud)
    }
  }

  private pushEquation(force = false) {
    const ph = PHASES[this.phaseIdx]
    const m = this.M
    const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
    let text = `M=[${f(m.a)} ${f(m.b)}; ${f(m.c)} ${f(m.d)}] · P${this.phaseIdx + 1}${this.phaseIdx === 2 ? 'a' : this.phaseIdx === 3 ? 'b' : ''} ${ph.name}`
    if (ph.invulnerable) text += this.survivalT !== null ? ` · SURVIVE ${Math.ceil(this.survivalT)}s` : ' · INVULNERABLE'
    else text += ` · HP ${Math.ceil(this.hp)}/${ph.hp}`
    if (force || text !== this.lastEq) {
      this.lastEq = text
      this.events.onEquation(text)
    }
  }

  /* ---------------- render ---------------- */

  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color)
    if (!c) {
      c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const g = c.getContext('2d')!
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grad.addColorStop(0, hexA(color, 0.5))
      grad.addColorStop(0.4, hexA(color, 0.16))
      grad.addColorStop(1, hexA(color, 0))
      g.fillStyle = grad
      g.fillRect(0, 0, 64, 64)
      this.glowCache.set(color, c)
    }
    return c
  }

  private render(nowS: number) {
    const { ctx, W, H, S } = this
    const settings = useGameStore.getState().settings
    const pal = getPalette(settings.colorblind)
    const reduce = settings.reduceMotion
    const k = settings.gridIntensity
    const ph = PHASES[this.phaseIdx]

    if (ph.key === 'p3a' && !this.paused && !this.frozen) this.spinAngle += 0.008
    this.whiteFlashT = Math.max(0, this.whiteFlashT - 1 / 60)

    ctx.clearRect(0, 0, W, H)
    ctx.save()

    // entry plunge: scale 1.1 → 1, 500ms in-out (boss.md §8)
    const zoom = this.introT < 0.45 ? 1.1 - 0.1 * easeInOut(this.introT / 0.45) : 1
    ctx.translate(W / 2, H / 2)
    ctx.scale(zoom, zoom)
    ctx.translate(-W / 2, -H / 2)

    // screen shake (skipped under reduce-motion)
    if (this.shakeT > 0) {
      const m = this.shakeMag * Math.min(1, this.shakeT / 0.2)
      ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m)
    }

    // --- nebula + keep backdrop (20% opacity texture, boss.md §8)
    ctx.fillStyle = '#060A13'
    ctx.fillRect(0, 0, W, H)
    if (this.imgKeep.complete && this.imgKeep.naturalWidth > 0) {
      ctx.globalAlpha = 0.2
      const ar = this.imgKeep.naturalWidth / this.imgKeep.naturalHeight
      const dh = H
      const dw = dh * ar
      ctx.drawImage(this.imgKeep, (W - dw) / 2, 0, dw, dh)
      ctx.globalAlpha = 1
    }

    // --- warped grid: image of the standard grid under M (breathing ±2%, 3s)
    const breathe = reduce ? 1 : 1 + 0.02 * Math.sin((nowS * 2 * Math.PI) / 3)
    const M = this.M
    const sc = breathe
    const col1 = { x: M.a * sc, y: M.c * sc } // image of x̂
    const col2 = { x: M.b * sc, y: M.d * sc } // image of ŷ
    ctx.lineWidth = 1
    for (let i = -12; i <= 12; i++) {
      const major = i % 5 === 0
      // vertical grid line x=i → through i·col1 along col2
      const p0 = this.w2s({ x: i * col1.x - 24 * col2.x, y: i * col1.y - 24 * col2.y })
      const p1 = this.w2s({ x: i * col1.x + 24 * col2.x, y: i * col1.y + 24 * col2.y })
      ctx.strokeStyle = `rgba(56,189,248,${(major ? 0.15 : 0.07) * k})`
      ctx.lineWidth = major ? 1.5 : 1
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
      // horizontal grid line y=i → through i·col2 along col1
      const q0 = this.w2s({ x: i * col2.x - 24 * col1.x, y: i * col2.y - 24 * col1.y })
      const q1 = this.w2s({ x: i * col2.x + 24 * col1.x, y: i * col2.y + 24 * col1.y })
      ctx.beginPath()
      ctx.moveTo(q0.x, q0.y)
      ctx.lineTo(q1.x, q1.y)
      ctx.stroke()
    }
    // axes images (1.5px warm/cyan) + origin dot
    const o2 = this.w2s({ x: 0, y: 0 })
    const ax = this.w2s({ x: 24 * col1.x, y: 24 * col1.y })
    const ax2 = this.w2s({ x: -24 * col1.x, y: -24 * col1.y })
    const ay = this.w2s({ x: 24 * col2.x, y: 24 * col2.y })
    const ay2 = this.w2s({ x: -24 * col2.x, y: -24 * col2.y })
    ctx.lineWidth = 1.5
    ctx.strokeStyle = `rgba(255,176,32,${0.35 * k})`
    ctx.beginPath(); ctx.moveTo(ax2.x, ax2.y); ctx.lineTo(ax.x, ax.y); ctx.stroke()
    ctx.strokeStyle = `rgba(34,211,238,${0.35 * k})`
    ctx.beginPath(); ctx.moveTo(ay2.x, ay2.y); ctx.lineTo(ay.x, ay.y); ctx.stroke()
    ctx.fillStyle = `rgba(234,242,255,${0.5 * k})`
    ctx.beginPath(); ctx.arc(o2.x, o2.y, 2, 0, Math.PI * 2); ctx.fill()

    // --- flow lines: the ballistics preview (precomputed vertices), spins during 3a
    ctx.save()
    ctx.translate(o2.x, o2.y)
    if (this.spinAngle !== 0) ctx.rotate(this.spinAngle)
    ctx.translate(-o2.x, -o2.y)
    ctx.strokeStyle = hexA(pal.magenta, 0.12 * k + 0.03)
    ctx.lineWidth = 1
    for (const line of this.flowLines) {
      ctx.beginPath()
      for (let i = 0; i < line.length; i++) {
        const sp = this.w2s(line[i])
        if (i === 0) ctx.moveTo(sp.x, sp.y)
        else ctx.lineTo(sp.x, sp.y)
      }
      ctx.stroke()
    }
    ctx.restore()

    // --- echo hint: one true eigen-direction shimmers through the boss (1.5s)
    if (this.echo) {
      const age = this.time - this.echo.t0
      const a = (1 - age / this.echo.dur) * (0.45 + 0.3 * Math.sin(age * 18))
      const d = this.echo.dir
      const e1 = this.w2s({ x: this.bossPos.x - d.x * 12, y: this.bossPos.y - d.y * 12 })
      const e2 = this.w2s({ x: this.bossPos.x + d.x * 12, y: this.bossPos.y + d.y * 12 })
      ctx.strokeStyle = hexA(pal.magenta, Math.max(0, a))
      ctx.lineWidth = 2
      ctx.setLineDash([8, 8])
      ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.stroke()
      ctx.setLineDash([])
    }

    // --- phase-2 lanes: open diagonal glows magenta, blocked one is walled
    if (this.phaseIdx === 1 && this.transT === null && this.victoryT === null) {
      const eigs = eigenDirections(this.M)
      eigs.forEach((eg, i) => {
        const p1 = this.w2s({ x: this.bossPos.x - eg.dir.x * 12, y: this.bossPos.y - eg.dir.y * 12 })
        const p2 = this.w2s({ x: this.bossPos.x + eg.dir.x * 12, y: this.bossPos.y + eg.dir.y * 12 })
        if (i === this.occlIdx) {
          ctx.strokeStyle = hexA(pal.violet, 0.3)
          ctx.lineWidth = 5
          ctx.setLineDash([2, 14])
        } else {
          ctx.strokeStyle = hexA(pal.magenta, 0.28 + (reduce ? 0 : 0.12 * Math.sin(nowS * 4)))
          ctx.lineWidth = 3
          ctx.setLineDash([14, 10])
        }
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke()
        ctx.setLineDash([])
      })
    }

    // --- plinth: the grid bows under Eigen
    ctx.save()
    ctx.translate(o2.x, o2.y + 0.9 * S)
    ctx.scale(1, 0.32)
    const plinth = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.4 * S)
    plinth.addColorStop(0, hexA(pal.magenta, 0.28))
    plinth.addColorStop(0.6, hexA(pal.magenta, 0.08))
    plinth.addColorStop(1, hexA(pal.magenta, 0))
    ctx.fillStyle = plinth
    ctx.beginPath(); ctx.arc(0, 0, 2.4 * S, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // --- boss platform: aura rings + sprite + armor
    this.renderBoss(nowS, pal, reduce)

    // --- turret rail
    ctx.strokeStyle = hexA(pal.cyan, 0.35)
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const t = -this.railMax + (i / 40) * 2 * this.railMax
      const sp = this.w2s({ x: this.railRx * Math.sin(t), y: -this.railRy * Math.cos(t) })
      if (i === 0) ctx.moveTo(sp.x, sp.y)
      else ctx.lineTo(sp.x, sp.y)
    }
    ctx.stroke()
    // rail end posts
    for (const te of [-this.railMax, this.railMax]) {
      const sp = this.w2s({ x: this.railRx * Math.sin(te), y: -this.railRy * Math.cos(te) })
      ctx.fillStyle = hexA(pal.cyan, 0.5)
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2); ctx.fill()
    }

    // --- aim line (mint dashed straight preview; magenta double-line on eigen lock)
    const lock = this.currentLock()
    const pod = this.podPos()
    const recoil = clamp((this.reloadT - (RELOAD_S - 0.12)) / 0.12, 0, 1)
    const aimDir = fromAng(this.aimAngle)
    const podDraw = { x: pod.x - aimDir.x * 0.18 * recoil, y: pod.y - aimDir.y * 0.18 * recoil }
    const muzzle = { x: podDraw.x + aimDir.x * 0.8, y: podDraw.y + aimDir.y * 0.8 }
    if (this.victoryT === null && this.failT === null && this.introT >= 1) {
      const end = { x: muzzle.x + aimDir.x * 30, y: muzzle.y + aimDir.y * 30 }
      const ms = this.w2s(muzzle)
      const es = this.w2s(end)
      if (lock?.aligned) {
        // eigen LOCK — double line (shape coding) + glow
        const perp = { x: -aimDir.y, y: aimDir.x }
        ctx.strokeStyle = hexA(pal.magenta, 0.9)
        ctx.lineWidth = 1.6
        ctx.setLineDash([10, 7])
        for (const off of [-2.5, 2.5]) {
          ctx.beginPath()
          ctx.moveTo(ms.x + perp.x * off, ms.y + perp.y * off)
          ctx.lineTo(es.x + perp.x * off, es.y + perp.y * off)
          ctx.stroke()
        }
        ctx.setLineDash([])
        // reticle at the boss crossing
        const tHit = dot({ x: this.bossPos.x - muzzle.x, y: this.bossPos.y - muzzle.y }, aimDir)
        const rp = this.w2s({ x: muzzle.x + aimDir.x * tHit, y: muzzle.y + aimDir.y * tHit })
        ctx.strokeStyle = hexA(pal.magenta, 0.9)
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(rp.x, rp.y, 10 + (reduce ? 0 : 2 * Math.sin(nowS * 6)), 0, Math.PI * 2); ctx.stroke()
      } else {
        ctx.strokeStyle = hexA(pal.mint, 0.55)
        ctx.lineWidth = 1.5
        ctx.setLineDash([9, 8])
        ctx.beginPath(); ctx.moveTo(ms.x, ms.y); ctx.lineTo(es.x, es.y); ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // --- trails (1.2s fading contrail memory, boss.md §3)
    for (const s of this.shots) {
      if (s.trail.length < 2) continue
      const col = s.hostile || s.flipWarnT > 0 ? pal.danger : s.eigen ? pal.mint : pal.amber
      ctx.lineWidth = 2
      for (let i = 1; i < s.trail.length; i++) {
        const age = this.time - s.trail[i].t
        const a = clamp(1 - age / TRAIL_S, 0, 1) * 0.5 * (i / s.trail.length)
        if (a <= 0.01) continue
        ctx.strokeStyle = hexA(col, a)
        const p0 = this.w2s(s.trail[i - 1].p)
        const p1 = this.w2s(s.trail[i].p)
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
      }
    }

    // --- shots (chevron bolts — shape coding for the player projectile)
    for (const s of this.shots) {
      const sp = this.w2s(s.pos)
      const col = s.hostile || s.flipWarnT > 0 ? pal.danger : s.eigen ? pal.mint : pal.amber
      const warn = s.flipWarnT > 0 ? 0.5 + 0.5 * Math.sin(this.time * 40) : 1
      const gs = this.glowSprite(col)
      ctx.globalAlpha = warn
      ctx.drawImage(gs, sp.x - 24, sp.y - 24, 48, 48)
      const va = angOf(s.vel)
      ctx.save()
      ctx.translate(sp.x, sp.y)
      ctx.rotate(-va) // canvas y is down; world y is up
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.moveTo(9, 0)
      ctx.lineTo(-6, 5)
      ctx.lineTo(-2, 0)
      ctx.lineTo(-6, -5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.globalAlpha = 1
    }

    // --- orbs (danger + spiky silhouette — shape coding, boss.md §8)
    for (const o of this.orbs) {
      const sp = this.w2s(o.pos)
      const gs = this.glowSprite(pal.danger)
      ctx.drawImage(gs, sp.x - 20, sp.y - 20, 40, 40)
      ctx.save()
      ctx.translate(sp.x, sp.y)
      ctx.rotate(o.t * 3)
      ctx.fillStyle = pal.danger
      ctx.beginPath()
      const spikes = 8
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? 0.26 * S : 0.13 * S
        const a = (i / (spikes * 2)) * Math.PI * 2
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#0B1220'
      ctx.beginPath(); ctx.arc(0, 0, 0.07 * S, 0, Math.PI * 2); ctx.fill()
      ctx.restore()
    }

    // --- pod: Vex in a gyro-pod (tilts ±12° with aim, recoil 6px, blinks while invulnerable)
    {
      const ps = this.w2s(podDraw)
      const blink = this.playerInvulnT > 0 ? (Math.sin(this.time * 24) > 0 ? 0.35 : 0.9) : 1
      const powered = this.failT !== null || (this.frozen && this.hearts <= 0) ? 0.35 : 1
      ctx.globalAlpha = blink * powered
      const tilt = clamp(wrapAng(this.aimAngle - Math.PI / 2) / 3, -0.21, 0.21)
      ctx.save()
      ctx.translate(ps.x, ps.y)
      ctx.rotate(-tilt)
      ctx.strokeStyle = hexA(pal.cyan, 0.8)
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 0.5 * S, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = hexA(pal.cyan, 0.3)
      ctx.beginPath(); ctx.ellipse(0, 0, 0.62 * S, 0.24 * S, 0, 0, Math.PI * 2); ctx.stroke()
      const vs = 0.72 * S
      if (this.imgVex.complete && this.imgVex.naturalWidth > 0) {
        ctx.drawImage(this.imgVex, -vs / 2, -vs / 2, vs, vs)
      } else {
        ctx.fillStyle = pal.amber
        ctx.beginPath(); ctx.arc(0, 0, 0.28 * S, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
      ctx.globalAlpha = 1
    }

    // --- particles (additive)
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.particles) {
      const lifeK = 1 - p.age / p.life
      const sp = this.w2s({ x: p.x, y: p.y })
      ctx.globalAlpha = lifeK
      if (p.kind === 'spark') {
        const gs = this.glowSprite(p.color)
        const sz = p.size * S * 6 * lifeK + 4
        ctx.drawImage(gs, sp.x - sz / 2, sp.y - sz / 2, sz, sz)
      } else {
        ctx.save()
        ctx.translate(sp.x, sp.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        const sz = p.size * S
        if (p.kind === 'voxel') ctx.fillRect(-sz / 2, -sz / 2, sz, sz)
        else {
          ctx.beginPath()
          ctx.moveTo(0, -sz)
          ctx.lineTo(sz * 0.8, sz * 0.6)
          ctx.lineTo(-sz * 0.8, sz * 0.6)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // --- damage numbers (Big Number style, float 56px, crits glow magenta)
    for (const d of this.damageNums) {
      const age = this.time - d.t0
      const p = clamp(age / 0.6, 0, 1)
      const scaleK = p < 0.4 ? 0.8 + (p / 0.4) * 0.4 : 1.2 - ((p - 0.4) / 0.6) * 0.2
      const sp = this.w2s({ x: d.pos.x, y: d.pos.y + p * 1.3 })
      const big = d.kind === 'mega'
      ctx.save()
      ctx.translate(sp.x, sp.y)
      ctx.scale(scaleK, scaleK)
      ctx.globalAlpha = age > 0.45 ? 1 - (age - 0.45) / 0.2 : 1
      ctx.font = `${big ? 34 : 22}px Bungee, cursive`
      ctx.textAlign = 'center'
      const col =
        d.kind === 'mega' ? pal.magenta : d.kind === 'crit' ? pal.gold : d.kind === 'block' ? pal.violet : d.kind === 'glance' ? pal.mid : pal.mint
      const gs = this.glowSprite(col)
      ctx.drawImage(gs, -50, -50, 100, 100)
      ctx.fillStyle = col
      ctx.fillText(d.text, 0, 0)
      ctx.restore()
    }
    ctx.globalAlpha = 1

    // --- victory: aura collapses along the two eigen-directions, then white-magenta flash
    if (this.victoryT !== null && this.victoryT >= 0.2 && !this.bossGone) {
      const p = clamp((this.victoryT - 0.2) / 0.7, 0, 1)
      const eigs = eigenDirections(PHASES[3].M)
      ctx.strokeStyle = hexA(pal.magenta, 0.85 * p)
      ctx.lineWidth = 3
      for (const eg of eigs) {
        for (const sgn of [1, -1]) {
          const from = {
            x: this.bossPos.x + eg.dir.x * sgn * 14 * (1 - p),
            y: this.bossPos.y + eg.dir.y * sgn * 14 * (1 - p),
          }
          const f = this.w2s(from)
          const b = this.w2s(this.bossPos)
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }
    }
    if (this.whiteFlashT > 0) {
      ctx.fillStyle = `rgba(255,225,245,${this.whiteFlashT / 0.35})`
      ctx.fillRect(0, 0, W, H)
    }

    // --- vignette
    const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.5, H * 0.72)
    vg.addColorStop(0, 'rgba(2,6,16,0)')
    vg.addColorStop(1, 'rgba(2,6,16,0.55)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)

    ctx.restore()
  }

  /* ---------------- boss render ---------------- */

  private renderBoss(nowS: number, pal: Palette, reduce: boolean) {
    const { ctx, S } = this
    if (this.bossGone) return
    const ph = PHASES[this.phaseIdx]

    // intro drop: from +4.2u above the plinth with a back-ease landing
    let dy = 0
    if (this.introT < 0.45) {
      const k = clamp((this.introT - 0.05) / 0.4, 0, 1)
      dy = (1 - easeOutBack(k)) * 4.2
    }
    // flinch shudder (200ms)
    let fx = 0
    let fy = 0
    if (this.bossFlinchT > 0) {
      fx = (Math.random() - 0.5) * 0.12
      fy = (Math.random() - 0.5) * 0.12
    }
    const bp = this.w2s({ x: this.bossPos.x + fx, y: this.bossPos.y + dy + fy })

    // victory aura shrink
    let ringK = 1
    if (this.victoryT !== null && this.victoryT >= 0.2) {
      ringK = 1 - clamp((this.victoryT - 0.2) / 0.7, 0, 1) * 0.8
    }

    // glyph rings (matrix brackets) — rotate slowly; fast spin in 3a
    const spinFast = ph.key === 'p3a'
    for (const [ri, dir] of [
      [1.7, 1],
      [2.1, -1],
    ] as const) {
      ctx.save()
      ctx.translate(bp.x, bp.y)
      ctx.rotate((spinFast ? 2.2 : 0.25) * dir * nowS)
      ctx.strokeStyle = hexA(pal.magenta, ri < 2 ? 0.5 : 0.3)
      ctx.lineWidth = 1.5
      ctx.setLineDash([10, 14])
      ctx.beginPath(); ctx.arc(0, 0, ri * S * ringK, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      // bracket glyphs
      ctx.fillStyle = hexA(pal.magenta, 0.65)
      ctx.font = `${Math.round(0.28 * S)}px "JetBrains Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.save()
        ctx.translate(Math.cos(a) * ri * S * ringK, Math.sin(a) * ri * S * ringK)
        ctx.rotate(a + Math.PI / 2)
        ctx.fillText(i % 2 === 0 ? '[' : ']', 0, 0)
        ctx.restore()
      }
      ctx.restore()
    }

    // armor plates (phases 2 & 3a) — 4 orbiting obsidian plates
    if ((this.phaseIdx === 1 || this.phaseIdx === 2) && this.crackT === null && this.victoryT === null) {
      for (let i = 0; i < 4; i++) {
        const a = this.plateAng[i]
        const pp = this.w2s({
          x: this.bossPos.x + Math.cos(a) * 1.95,
          y: this.bossPos.y + dy + Math.sin(a) * 1.95,
        })
        ctx.save()
        ctx.translate(pp.x, pp.y)
        ctx.rotate(-a)
        ctx.fillStyle = '#182642'
        ctx.strokeStyle = hexA(pal.magenta, this.phaseIdx === 2 && !reduce ? 0.5 + 0.3 * Math.sin(nowS * 5 + i) : 0.5)
        ctx.lineWidth = 1.5
        const w = 0.5 * S
        const h = 0.3 * S
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, 4)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }

    // armor-crack cinematic: plates shear off along ±x (800ms)
    if (this.crackT !== null) {
      const p = clamp(this.crackT / 0.8, 0, 1)
      for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? 1 : -1
        const pp = this.w2s({
          x: this.bossPos.x + side * p * 4.5,
          y: this.bossPos.y + (i - 1.5) * 0.5 - p * p * 1.2,
        })
        ctx.save()
        ctx.globalAlpha = 1 - p
        ctx.translate(pp.x, pp.y)
        ctx.rotate(side * p * 2)
        ctx.fillStyle = '#182642'
        ctx.strokeStyle = hexA(pal.magenta, 0.6)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect((-0.5 * S) / 2, (-0.3 * S) / 2, 0.5 * S, 0.3 * S, 4)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }

    // sentinel sprite
    const size = 3.4 * S
    const gleam =
      this.phaseIdx === 2 && !reduce ? 0.5 + 0.3 * Math.sin(nowS * 5) : this.phaseIdx === 2 ? 0.6 : 0
    const gs = this.glowSprite(pal.magenta)
    ctx.globalAlpha = 0.5 + gleam * 0.5
    ctx.drawImage(gs, bp.x - size * 0.75, bp.y - size * 0.75, size * 1.5, size * 1.5)
    ctx.globalAlpha = 1
    if (this.imgBoss.complete && this.imgBoss.naturalWidth > 0) {
      ctx.drawImage(this.imgBoss, bp.x - size / 2, bp.y - size / 2, size, size)
    } else {
      // fallback faceted sentinel
      ctx.fillStyle = '#182642'
      ctx.strokeStyle = pal.magenta
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 - Math.PI / 2
        const r = size / 2
        if (i === 0) ctx.moveTo(bp.x + Math.cos(a) * r, bp.y + Math.sin(a) * r)
        else ctx.lineTo(bp.x + Math.cos(a) * r, bp.y + Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = pal.magenta
      ctx.beginPath(); ctx.arc(bp.x, bp.y, size * 0.12, 0, Math.PI * 2); ctx.fill()
    }

    // 3b: cracked core — jagged magenta fissures over the armor
    if (this.phaseIdx === 3) {
      ctx.strokeStyle = hexA(pal.magenta, reduce ? 0.8 : 0.55 + 0.3 * Math.sin(nowS * 7))
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(bp.x - size * 0.28, bp.y - size * 0.32)
      ctx.lineTo(bp.x - size * 0.05, bp.y - size * 0.05)
      ctx.lineTo(bp.x - size * 0.22, bp.y + size * 0.12)
      ctx.moveTo(bp.x + size * 0.3, bp.y - size * 0.2)
      ctx.lineTo(bp.x + size * 0.08, bp.y + size * 0.02)
      ctx.lineTo(bp.x + size * 0.26, bp.y + size * 0.3)
      ctx.stroke()
    }

    // victory freeze flash (200ms) then the sprite is gone (shards spawned in sim)
    if (this.victoryT !== null && this.victoryT < 0.2) {
      ctx.fillStyle = `rgba(255,240,250,${(this.victoryT / 0.2) * 0.7})`
      ctx.beginPath(); ctx.arc(bp.x, bp.y, size * 0.55, 0, Math.PI * 2); ctx.fill()
    }
  }

  /** victory shatter — shards fly along the two eigen-directions (one last lesson) */
  private shatterBoss() {
    this.bossGone = true
    this.whiteFlashT = 0.35
    const pal = this.palette()
    const eigs = eigenDirections(PHASES[3].M)
    for (const eg of eigs) {
      for (const sgn of [1, -1]) {
        for (let i = 0; i < 7; i++) {
          const v = 2.2 + Math.random() * 3
          this.particles.push({
            x: this.bossPos.x,
            y: this.bossPos.y,
            vx: eg.dir.x * sgn * v,
            vy: eg.dir.y * sgn * v,
            age: 0,
            life: 0.9,
            size: 0.14 + Math.random() * 0.16,
            color: Math.random() > 0.4 ? pal.magenta : pal.violet,
            kind: 'shard',
            rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 14,
            grav: -1.5,
          })
        }
      }
    }
    this.burst(this.bossPos, pal.gold, 48, 5, 'confetti') // 48-particle win burst
    sfx.win()
    haptics.star()
  }
}

/* ---------------- module helpers ---------------- */

function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** mega-crit pattern [25,30,25,30,25] — respects the master toggle */
function hapticSeq(pattern: number[]) {
  const { hapticsOn } = useGameStore.getState().settings
  if (!hapticsOn) return
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* no-op */
  }
}
