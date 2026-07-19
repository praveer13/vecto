/**
 * Chapter 4 — Tandem Towers: two (or three) machines bolted in series.
 * Crates ride tower A then tower B — chained grid warps. SWAP flips the run
 * order (non-commutativity); MERGE fuses them into the product matrix;
 * 4-8 is a designer level (write both machines' columns). (gameplay.md §5 Ch4)
 */
import type { Mat, Vec } from './math'
import { IDENTITY, apply, fmtVec, mul, vec } from './math'
import type { Engine } from './engine'
import { drawCoordLabel, drawPad } from './engine'
import { Session } from './session'
import type { HintGesture, SessionEvents, UiState } from './session'
import type { Ch4Level } from './levels'
import { saveMidLevel } from './levels'
import { BasisWidget, cratesOnPads, drawCrate, drawMachinePod } from './machine'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

const GRAB_PX = 28
const ROT90: Mat = { a: 0, b: 1, c: -1, d: 0 }

interface WarpStep {
  to: Mat
  dur: number
  holdAfter: number
}

export class Ch4Session extends Session {
  declare level: Ch4Level
  homes: Vec[]
  order: number[]
  merged = false
  warped = false
  widgets = [new BasisWidget(), new BasisWidget()]
  editMachine = 0
  dragCrate = -1
  dragCol: 0 | 1 | null = null
  leverT = 0
  leverAnim: { to: number; t0: number } | null = null
  warpQueue: WarpStep[] = []
  holdUntil = 0
  swapAnimT0 = -1000
  afterQueue: (() => void) | null = null
  vexPos: Vec = vec(0, 0)

  constructor(canvas: HTMLCanvasElement, level: Ch4Level, events: SessionEvents) {
    super(canvas, level, events)
    this.level = level
    this.homes = level.crates.map((c) => ({ ...c }))
    this.order = [...level.initialOrder]
    const b = this.contentBounds()
    this.vexPos = vec((b.minX + b.maxX) / 2, b.minY - 0.6)
  }

  machineMat(idx: number): Mat {
    if (this.level.designer && idx <= 1) return this.widgets[idx].matrix()
    return this.level.machines[idx]?.m ?? IDENTITY
  }

  /** full product: first machine in run order applied first */
  product(): Mat {
    let P = IDENTITY
    for (const idx of this.order) P = mul(this.machineMat(idx), P)
    return P
  }

  cratePos(home: Vec): Vec {
    return apply(this.engine.warpMatrix(), home)
  }

  lockOn(): boolean {
    return cratesOnPads(this.homes, this.product(), this.level.pads)
  }

  /* ---------- dock bridge ---------- */

  swap() {
    if (this.state !== 'play' || this.warped || !this.level.swap) return
    this.order = [...this.order].reverse()
    this.swapAnimT0 = this.engine.timeMs
    haptics.release()
    sfx.whoosh()
    this.emit()
  }

  setOrder(opt: number[]) {
    if (this.state !== 'play' || this.warped) return
    this.order = [...opt]
    haptics.tick()
    sfx.tick()
    this.emit()
  }

  setEditMachine(i: number) {
    this.editMachine = i
    this.emit()
  }

  merge() {
    if (this.state !== 'play' || this.warped || !this.level.merge || this.merged) return
    this.merged = true
    haptics.release()
    sfx.crit()
    const mid = this.engine.screenToWorld({ x: this.engine.cssW / 2, y: 56 })
    this.engine.burst(mid.x, mid.y, 'merge')
    this.events.onToast('Merged! One warp, same landing')
    this.emit()
  }

  /* ---------- pointer ---------- */

  onDown(w: Vec, s: Vec) {
    if (this.level.designer && !this.warped) {
      const wdg = this.widgets[this.editMachine]
      const hit = wdg.hit(this.engine, s)
      if (hit !== null) {
        this.dragCol = hit
        haptics.tick()
        sfx.pluck(0.4)
        return
      }
    }
    if (this.level.cratesLocked || this.warped) return
    for (let i = 0; i < this.homes.length; i++) {
      const sp = this.engine.worldToScreen(this.cratePos(this.homes[i]))
      if (Math.hypot(sp.x - s.x, sp.y - s.y) < GRAB_PX + 8) {
        this.dragCrate = i
        haptics.tick()
        sfx.pluck(0.5)
        return
      }
    }
  }

  onMove(w: Vec, s: Vec) {
    if (this.dragCol !== null) {
      const wdg = this.widgets[this.editMachine]
      if (wdg.dragTo(this.engine, s, this.dragCol)) {
        haptics.tick()
        this.emit()
      }
      return
    }
    if (this.dragCrate >= 0) {
      const snapped = { x: Math.round(w.x), y: Math.round(w.y) }
      const cur = this.homes[this.dragCrate]
      if (cur.x !== snapped.x || cur.y !== snapped.y) {
        this.homes[this.dragCrate] = snapped
        haptics.tick()
        this.emit()
      }
    }
  }

  onUp() {
    if (this.dragCol !== null) {
      haptics.release()
      this.dragCol = null
      this.emit()
      return
    }
    if (this.dragCrate >= 0) {
      const p = this.cratePos(this.homes[this.dragCrate])
      this.engine.burst(p.x, p.y, 'snap')
      haptics.release()
      sfx.snap()
      this.dragCrate = -1
      this.emit()
    }
  }

  /* ---------- LEVER ---------- */

  go() {
    if (this.state !== 'play' || this.engine.warping || this.warpQueue.length > 0) return
    if (this.warped) {
      this.state = 'animating'
      this.pullLever(() => {
        sfx.warp()
        this.engine.startWarp(IDENTITY, 600, () => {
          this.warped = false
          this.state = 'play'
          this.emit()
        })
      })
      return
    }
    this.commitMove()
    this.state = 'animating'
    this.pullLever(() => {
      sfx.warp()
      haptics.release()
      if (this.merged && this.order.length === 2) {
        this.warpQueue = [{ to: this.product(), dur: 600, holdAfter: 0 }]
      } else {
        const steps: WarpStep[] = []
        let P = IDENTITY
        for (const idx of this.order) {
          P = mul(this.machineMat(idx), P)
          steps.push({ to: { ...P }, dur: 450, holdAfter: 150 })
        }
        this.warpQueue = steps
      }
      this.afterQueue = () => {
        this.warped = true
        haptics.tick()
        if (cratesOnPads(this.homes, this.product(), this.level.pads)) {
          this.doWin(650)
        } else {
          this.state = 'play'
          this.doMiss('Off the pads — pull back and adjust!')
        }
        this.emit()
      }
    })
  }

  private pullLever(fire: () => void) {
    this.leverAnim = { to: 1, t0: this.engine.timeMs }
    window.setTimeout(() => {
      if (this.disposed) return
      fire()
      this.leverAnim = { to: 0, t0: this.engine.timeMs }
    }, 150)
  }

  reset() {
    this.homes = this.level.crates.map((c) => ({ ...c }))
    this.order = [...this.level.initialOrder]
    this.merged = false
    this.warped = false
    this.widgets.forEach((wdg) => wdg.reset())
    this.editMachine = 0
    this.warpQueue = []
    this.afterQueue = null
    this.moves = 0
    this.missCount = 0
    this.state = 'play'
    this.engine.warpCur = { ...IDENTITY }
    this.engine.warpAnim = null
    this.emit()
  }

  hintPath(): HintGesture | null {
    if (this.level.designer) {
      const wdg = this.widgets[1]
      const from = wdg.tipScreen(this.engine, wdg.c1)
      const to = wdg.tipScreen(this.engine, { x: ROT90.a, y: ROT90.b })
      return {
        path: [this.engine.screenToWorld(from), this.engine.screenToWorld(to)],
        caption: 'Make tower B a spinner!',
      }
    }
    if (this.level.swap && this.level.id === '4-2') {
      const a = this.engine.screenToWorld({ x: this.engine.cssW / 2 + 52, y: 56 })
      const b = this.engine.screenToWorld({ x: this.engine.cssW / 2 - 52, y: 56 })
      return { path: [a, b], caption: 'Try swapping the towers' }
    }
    if (!this.level.cratesLocked && !this.warped && this.homes.length > 0) {
      const P = this.product()
      const d = P.a * P.d - P.b * P.c
      if (Math.abs(d) > 1e-6) {
        const inv: Mat = { a: P.d / d, b: -P.b / d, c: -P.c / d, d: P.a / d }
        const pre = apply(inv, this.level.pads[0])
        return { path: [this.homes[0], pre], caption: 'Where does the chain land?' }
      }
    }
    return null
  }

  winBursts(): Vec[] {
    return this.level.pads
  }

  contentBounds() {
    const xs = [0]
    const ys = [0]
    for (const p of [...this.level.crates, ...this.level.pads]) {
      xs.push(p.x)
      ys.push(p.y)
    }
    return {
      minX: Math.min(...xs, -2),
      maxX: Math.max(...xs, 2),
      minY: Math.min(...ys, -2),
      maxY: Math.max(...ys, 2),
    }
  }

  uiExtras(): Partial<UiState> {
    const wdg = this.widgets[this.editMachine]
    return {
      order: [...this.order],
      merged: this.merged,
      canMerge: !!this.level.merge && !this.merged && this.order.length === 2,
      editMachine: this.editMachine,
      colA: { ...wdg.c1 },
      colB: { ...wdg.c2 },
      warped: this.warped,
    }
  }

  equation(): string {
    const c = this.homes[0] ?? vec(1, 0)
    const labels = this.order.map((i) => this.level.machines[i]?.label ?? '?').join('·')
    return `${labels}·${fmtVec(c)} = ${fmtVec(apply(this.product(), c))}`
  }

  serialize(): unknown {
    return {
      homes: this.homes, order: this.order, merged: this.merged,
      editMachine: this.editMachine,
      w0c1: this.widgets[0].c1, w0c2: this.widgets[0].c2,
      w1c1: this.widgets[1].c1, w1c2: this.widgets[1].c2,
      moves: this.moves,
    }
  }

  restore(data: unknown) {
    const d = data as {
      homes?: Vec[]; order?: number[]; merged?: boolean; editMachine?: number
      w0c1?: Vec; w0c2?: Vec; w1c1?: Vec; w1c2?: Vec; moves?: number
    }
    if (Array.isArray(d?.homes)) this.homes = d.homes.map((v) => ({ ...v }))
    if (Array.isArray(d?.order) && d.order.length > 0) this.order = [...d.order]
    if (d?.merged) this.merged = true
    if (typeof d?.editMachine === 'number') this.editMachine = d.editMachine
    if (d?.w0c1) this.widgets[0].c1 = { ...d.w0c1 }
    if (d?.w0c2) this.widgets[0].c2 = { ...d.w0c2 }
    if (d?.w1c1) this.widgets[1].c1 = { ...d.w1c1 }
    if (d?.w1c2) this.widgets[1].c2 = { ...d.w1c2 }
    if (typeof d?.moves === 'number') this.moves = d.moves
  }

  persist() {
    if (this.state === 'play') saveMidLevel(this.level.id, this.serialize())
  }

  /* ---------- per-frame ---------- */

  update() {
    if (this.leverAnim) {
      const k = Math.min(1, (this.engine.timeMs - this.leverAnim.t0) / 150)
      this.leverT = this.leverAnim.to === 1 ? k : 1 - k
      if (k >= 1 && this.leverAnim.to === 0) this.leverAnim = null
    }
    if (this.warpQueue.length > 0 && !this.engine.warping && this.engine.timeMs >= this.holdUntil) {
      const step = this.warpQueue.shift()!
      this.engine.startWarp(step.to, step.dur, () => {
        this.holdUntil = this.engine.timeMs + step.holdAfter
        if (this.warpQueue.length > 0) sfx.warp()
      })
    }
    if (this.warpQueue.length === 0 && this.afterQueue && !this.engine.warping && this.engine.timeMs >= this.holdUntil) {
      const cb = this.afterQueue
      this.afterQueue = null
      cb()
    }
  }

  /* ---------- draw ---------- */

  private podX(i: number, n: number): number {
    const cx = this.engine.cssW / 2
    if (n === 2) return cx + (i === 0 ? -52 : 52)
    return cx + (i - 1) * 78
  }

  drawWorld(ctx: CanvasRenderingContext2D, eng: Engine) {
    const P = eng.palette
    const n = this.order.length
    for (const p of this.level.pads) drawPad(eng, p, { lockOn: this.warped && this.lockOn() })
    if (!this.warped) {
      const Pm = this.product()
      for (const h of this.homes) {
        const land = apply(Pm, h)
        const sp = eng.worldToScreen(land)
        ctx.save()
        ctx.strokeStyle = P.violet
        ctx.globalAlpha = 0.55
        ctx.setLineDash([4, 5])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, 0.35 * eng.cam.scale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }
    this.homes.forEach((h, i) => {
      drawCrate(eng, this.cratePos(h), { grabbed: this.dragCrate === i })
    })
    if (this.level.designer) {
      this.widgets[this.editMachine].draw(eng, {
        accent: P.violet,
        title: `TOWER ${this.level.machines[this.editMachine]?.label ?? 'A'} — WHERE î′ ĵ′ GO`,
      })
    }
    // machine pods in run order + crackling conduit
    const swapK = Math.min(1, Math.max(0, (eng.timeMs - this.swapAnimT0) / 400))
    const swapping = swapK > 0 && swapK < 1 && n === 2
    const arc = swapping ? Math.sin(swapK * Math.PI) * 26 : 0
    const ease = swapK < 0.5 ? 2 * swapK * swapK : 1 - Math.pow(-2 * swapK + 2, 2) / 2
    const xs: number[] = []
    for (let i = 0; i < n; i++) {
      let x = this.podX(i, n)
      if (swapping) x = this.podX(i, n) + (this.podX(n - 1 - i, n) - this.podX(i, n)) * ease
      xs.push(x)
    }
    ctx.save()
    ctx.strokeStyle = P.violet
    ctx.globalAlpha = 0.5 + (eng.reduceMotion ? 0 : Math.sin(eng.timeMs / 180) * 0.2)
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -(eng.timeMs / 40) % 11
    ctx.beginPath()
    ctx.moveTo(xs[0], 56)
    for (let i = 1; i < n; i++) ctx.lineTo(xs[i], 56)
    ctx.stroke()
    ctx.restore()
    for (let i = 0; i < n; i++) {
      const idx = this.order[i]
      drawMachinePod(eng, xs[i], 56 - (swapping ? arc : 0), this.level.machines[idx]?.label ?? '?', P.violet, this.leverT, {
        small: n === 3,
        selected: this.level.designer && idx === this.editMachine,
      })
    }
    // merged chip
    if (this.merged) {
      const label = this.order.map((i) => this.level.machines[i]?.label).reverse().join('·')
      drawMachinePod(eng, eng.cssW / 2, 112, label, P.mint, 0, { small: true })
    }
    eng.drawVex(eng.screenToWorld({ x: eng.cssW / 2 + (n === 3 ? 128 : 108), y: 52 }), 0.8)
    if (this.dragCrate >= 0) {
      const h = this.homes[this.dragCrate]
      drawCoordLabel(eng, h, fmtVec(h), P.violet, 40)
    }
  }
}
