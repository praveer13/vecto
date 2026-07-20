/**
 * Chapter 3 — Warp Works: a machine warps the whole grid (matrix as a
 * transformation of space). Place crates, pull the LEVER, crates ride the
 * warp: pos = M(t)·home. Designer levels: drag î′/ĵ′ in the basis widget to
 * write the matrix columns directly. (gameplay.md §5 Ch3)
 */
import type { Engine, Mat, Vec } from '@gridverse/kit/engine'
import { IDENTITY, apply, det, drawCoordLabel, drawPad, drawWall, fmtVec, vec } from '@gridverse/kit/engine'
import { Session, type HintGesture, type SessionEvents } from '@gridverse/kit/session'
import type { Ch3Level } from './levels'
import { saveMidLevel } from './levels'
import { BasisWidget, cratesOnPads, drawCrate, drawMachinePod } from './machine'
import { haptics } from '@gridverse/kit/lib'
import { sfx } from '@gridverse/kit/lib'

const GRAB_PX = 28

interface Ch3Extras {
  colA: Vec
  colB: Vec
  warped: boolean
}

export class Ch3Session extends Session<Ch3Level, Ch3Extras> {
  declare level: Ch3Level
  homes: Vec[]
  widget = new BasisWidget()
  warped = false
  dragCrate = -1
  dragCol: 0 | 1 | null = null
  leverT = 0
  leverAnim: { to: number; t0: number } | null = null
  vexPos: Vec = vec(0, 0)

  constructor(canvas: HTMLCanvasElement, level: Ch3Level, events: SessionEvents<Ch3Extras>) {
    super(canvas, level, events)
    this.level = level
    this.homes = level.crates.map((c) => ({ ...c }))
    if (level.machine) this.widget.setMatrix(level.machine)
    const b = this.contentBounds()
    this.vexPos = vec((b.minX + b.maxX) / 2, b.minY - 0.6)
  }

  M(): Mat {
    return this.level.designer ? this.widget.matrix() : (this.level.machine ?? IDENTITY)
  }

  /** where a crate is currently displayed (rides the warp) */
  cratePos(home: Vec): Vec {
    return apply(this.engine.warpMatrix(), home)
  }

  lockOn(): boolean {
    return cratesOnPads(this.homes, this.M(), this.level.pads)
  }

  /* ---------- pointer ---------- */

  onDown(_w: Vec, s: Vec) {
    if (this.level.designer && !this.warped) {
      const hit = this.widget.hit(this.engine, s)
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
      if (this.widget.dragTo(this.engine, s, this.dragCol)) {
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
      const tip = this.widget.tipScreen(this.engine, this.dragCol === 0 ? this.widget.c1 : this.widget.c2)
      const wp = this.engine.screenToWorld(tip)
      this.engine.burst(wp.x, wp.y, 'snap')
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
    if (this.state !== 'play' || this.engine.warping) return
    if (this.warped) {
      // reset pull — warp reverses, no move counted
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
    const M = this.M()
    this.pullLever(() => {
      sfx.warp()
      haptics.release()
      this.engine.startWarp(M, 600, () => {
        this.warped = true
        haptics.tick()
        if (cratesOnPads(this.homes, M, this.level.pads)) {
          this.doWin(650)
        } else {
          this.state = 'play'
          this.doMiss('Off the pads — pull back and adjust!')
        }
        this.emit()
      })
    })
  }

  /** lever wind-up 150ms, then fire */
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
    if (this.level.machine) this.widget.setMatrix(this.level.machine)
    else this.widget.reset()
    this.warped = false
    this.dragCrate = -1
    this.dragCol = null
    this.moves = 0
    this.missCount = 0
    this.state = 'play'
    this.engine.warpCur = { ...IDENTITY }
    this.engine.warpAnim = null
    this.emit()
  }

  hintPath(): HintGesture | null {
    if (this.level.designer && this.level.target) {
      const from = this.widget.tipScreen(this.engine, this.widget.c1)
      const to = this.widget.tipScreen(this.engine, { x: this.level.target.a, y: this.level.target.b })
      return {
        path: [this.engine.screenToWorld(from), this.engine.screenToWorld(to)],
        caption: 'Drag î′ and ĵ′ on the mini grid',
      }
    }
    if (!this.level.designer && !this.warped && this.homes.length > 0) {
      const M = this.M()
      const d = det(M)
      if (Math.abs(d) > 1e-6) {
        const pad = this.level.pads[0]
        const inv: Mat = { a: M.d / d, b: -M.b / d, c: -M.c / d, d: M.a / d }
        const pre = apply(inv, pad)
        return { path: [this.homes[0], pre], caption: 'Where does the warp take it?' }
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

  uiExtras(): Ch3Extras {
    const M = this.M()
    return {
      colA: { x: M.a, y: M.b },
      colB: { x: M.c, y: M.d },
      warped: this.warped,
    }
  }

  equation(): string {
    const c = this.homes[0] ?? vec(1, 0)
    return `M·${fmtVec(c)} = ${fmtVec(apply(this.M(), c))}`
  }

  serialize(): unknown {
    return { homes: this.homes, c1: this.widget.c1, c2: this.widget.c2, moves: this.moves }
  }

  restore(data: unknown) {
    const d = data as { homes?: Vec[]; c1?: Vec; c2?: Vec; moves?: number }
    if (Array.isArray(d?.homes)) this.homes = d.homes.map((v) => ({ ...v }))
    if (d?.c1) this.widget.c1 = { ...d.c1 }
    if (d?.c2) this.widget.c2 = { ...d.c2 }
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
  }

  /* ---------- draw ---------- */

  drawWorld(ctx: CanvasRenderingContext2D, eng: Engine) {
    const P = eng.palette
    const M = this.M()
    for (const w of this.level.walls ?? []) drawWall(eng, w)
    for (const p of this.level.pads) drawPad(eng, p, { lockOn: this.warped && this.lockOn() })
    // landing predictions (dashed violet rings) before the warp
    if (!this.warped) {
      for (const h of this.homes) {
        const land = apply(M, h)
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
    // crates ride the warp
    this.homes.forEach((h, i) => {
      drawCrate(eng, this.cratePos(h), { grabbed: this.dragCrate === i })
    })
    // basis widget (always visible — the machine's columns)
    this.widget.draw(eng, { accent: this.level.designer ? P.amber : P.line })
    // machine pod, top center (screen space)
    drawMachinePod(eng, eng.cssW / 2, 56, 'M', P.amber, this.leverT, { selected: this.state === 'animating' })
    eng.drawMascot(eng.screenToWorld({ x: eng.cssW / 2 + 58, y: 52 }), 0.8)
    if (this.dragCrate >= 0) {
      const h = this.homes[this.dragCrate]
      drawCoordLabel(eng, h, fmtVec(h), P.amber, 40)
    }
  }
}
