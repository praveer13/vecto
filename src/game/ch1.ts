/**
 * Chapter 1 — Vector Valley: chain arrows tip-to-tail to the gold pad.
 * Drag cards from the tray onto the grid (auto tip-to-tail), drag placed
 * links to reorder (lift → ghost insertion → snap), drag off to return.
 * GO hops Vex along the chain. Walls block crossing chains. (gameplay.md §5 Ch1)
 */
import type { Vec } from './math'
import { add, dist, fmtVec, segIntersectsRect, vec } from './math'
import type { Engine } from './engine'
import { Spring, drawArrow, drawCoordLabel, drawPad, drawWall } from './engine'
import { Session } from './session'
import type { HintGesture, SessionEvents, UiState } from './session'
import type { Ch1Level } from './levels'
import { saveMidLevel } from './levels'
import { haptics } from '@/lib/haptics'
import { sfx } from '@/lib/sfx'

const ORIGIN = vec(0, 0)
const LOCK_DIST = 0.4
const GRAB_PX = 28
const INSERT_DIST = 1.4

interface LinkDrag {
  vec: Vec
  tail: Vec // current snapped tail candidate
  insertIdx: number | null
}

export class Ch1Session extends Session {
  declare level: Ch1Level
  tray: Vec[]
  chain: Vec[] = []
  linkDrag: LinkDrag | null = null
  linkSpring = new Spring(0, 0)
  trayPreview: Vec | null = null // vec being dragged over canvas from tray
  vexPos: Vec = vec(0, 0)
  dash: { path: Vec[]; d: number; total: number } | null = null
  private lastTrail = 0

  constructor(canvas: HTMLCanvasElement, level: Ch1Level, events: SessionEvents) {
    super(canvas, level, events)
    this.level = level
    this.tray = level.cards.map((c) => ({ ...c }))
  }

  /* ---------- geometry ---------- */

  joints(chain: Vec[] = this.chain): Vec[] {
    const out: Vec[] = [{ ...ORIGIN }]
    let p = { ...ORIGIN }
    for (const v of chain) {
      p = add(p, v)
      out.push({ ...p })
    }
    return out
  }

  endpoint(): Vec {
    const j = this.joints()
    return j[j.length - 1]
  }

  goalPos(): Vec {
    const g = this.level.goalPad
    const mg = this.level.movingGoal
    if (!mg) return g
    const k = Math.sin((this.engine.timeMs / mg.periodMs) * Math.PI * 2) * mg.amp
    return mg.axis === 'x' ? { x: g.x + k, y: g.y } : { x: g.x, y: g.y + k }
  }

  pathClear(chain: Vec[] = this.chain): boolean {
    const walls = this.level.walls
    if (!walls || walls.length === 0) return true
    const j = this.joints(chain)
    for (let i = 1; i < j.length; i++) {
      for (const w of walls) if (segIntersectsRect(j[i - 1], j[i], w)) return false
    }
    return true
  }

  lockOn(): boolean {
    if (this.chain.length === 0) return false
    if (this.level.mustUseAll && this.tray.length > 0) return false
    if (!this.pathClear()) return false
    return dist(this.endpoint(), this.goalPos()) <= LOCK_DIST
  }

  /* ---------- tray bridge (dock DOM → canvas) ---------- */

  trayDragMove(v: Vec | null) {
    this.trayPreview = v
    this.emit()
  }

  trayDrop(v: Vec): boolean {
    if (this.state !== 'play') return false
    const idx = this.tray.findIndex((t) => t.x === v.x && t.y === v.y)
    if (idx < 0) return false
    this.tray.splice(idx, 1)
    this.chain.push({ ...v })
    this.trayPreview = null
    haptics.release()
    sfx.snap()
    const tip = this.endpoint()
    this.engine.burst(tip.x, tip.y, 'snap')
    this.vexPos = { ...ORIGIN }
    this.emit()
    return true
  }

  tapCard(v: Vec) {
    // accessibility path: tap a card to append it
    this.trayDrop(v)
  }

  /* ---------- pointer: reorder placed links ---------- */

  onDown(w: Vec, s: Vec) {
    const j = this.joints()
    for (let i = 0; i < this.chain.length; i++) {
      const a = this.engine.worldToScreen(j[i])
      const b = this.engine.worldToScreen(j[i + 1])
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      if (Math.hypot(mx - s.x, my - s.y) < GRAB_PX + Math.hypot(b.x - a.x, b.y - a.y) / 2) {
        const [lifted] = this.chain.splice(i, 1)
        this.linkDrag = { vec: lifted, tail: { ...w }, insertIdx: i }
        this.linkSpring.set(w.x, w.y)
        haptics.tick()
        sfx.pluck(Math.hypot(lifted.x, lifted.y) / 6)
        this.emit()
        return
      }
    }
  }

  onMove(w: Vec) {
    if (!this.linkDrag) return
    this.linkSpring.tx = w.x
    this.linkSpring.ty = w.y
    const j = this.joints()
    let best: number | null = null
    let bestD = INSERT_DIST
    j.forEach((p, idx) => {
      const d = dist(w, p)
      if (d < bestD) {
        bestD = d
        best = idx
      }
    })
    this.linkDrag.insertIdx = best
    this.linkDrag.tail = best !== null ? { ...j[best] } : { x: Math.round(w.x), y: Math.round(w.y) }
  }

  onUp() {
    if (!this.linkDrag) return
    const d = this.linkDrag
    this.linkDrag = null
    if (d.insertIdx !== null) {
      this.chain.splice(d.insertIdx, 0, d.vec)
      haptics.release()
      sfx.snap()
      const j = this.joints()
      const tip = j[Math.min(d.insertIdx + 1, j.length - 1)]
      this.engine.burst(tip.x, tip.y, 'snap')
    } else {
      this.tray.push(d.vec)
      this.events.onToast('Back in the tray')
    }
    this.emit()
  }

  /* ---------- GO ---------- */

  go() {
    if (this.state !== 'play') return
    if (this.chain.length === 0) {
      this.events.onToast(this.level.coach)
      return
    }
    if (this.level.mustUseAll && this.tray.length > 0) {
      this.events.onToast('Use every arrow!')
      return
    }
    this.commitMove()
    if (this.lockOn()) {
      const path = this.joints()
      let total = 0
      for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i])
      this.state = 'animating'
      this.dash = { path, d: 0, total }
      sfx.squeak()
    } else {
      const blocked = !this.pathClear()
      this.doMiss(blocked ? 'Blocked! Go around.' : 'So close! Nudge one arrow.')
    }
  }

  reset() {
    this.tray = this.level.cards.map((c) => ({ ...c }))
    this.chain = []
    this.linkDrag = null
    this.trayPreview = null
    this.vexPos = { ...ORIGIN }
    this.dash = null
    this.moves = 0
    this.missCount = 0
    this.state = 'play'
    this.emit()
  }

  hintPath(): HintGesture | null {
    if (this.chain.length === 0 && this.tray.length > 0) {
      const aboveDock = this.engine.screenToWorld({
        x: this.engine.cssW / 2,
        y: this.engine.cssH - 30,
      })
      return { path: [aboveDock, ORIGIN, add(ORIGIN, this.tray[0])], caption: 'Drag an arrow onto the grid' }
    }
    if (this.chain.length > 0 && !this.lockOn()) {
      const j = this.joints()
      return { path: [j[j.length - 1], this.goalPos()], caption: 'Chain all the way to the pad!' }
    }
    return null
  }

  winBursts(): Vec[] {
    return [this.goalPos()]
  }

  contentBounds() {
    const g = this.level.goalPad
    const b = { minX: Math.min(0, g.x), minY: Math.min(0, g.y), maxX: Math.max(0, g.x), maxY: Math.max(0, g.y) }
    for (const v of this.level.cards) {
      b.minX = Math.min(b.minX, Math.min(0, v.x))
      b.maxX = Math.max(b.maxX, Math.max(0, v.x))
      b.minY = Math.min(b.minY, Math.min(0, v.y))
      b.maxY = Math.max(b.maxY, Math.max(0, v.y))
    }
    for (const w of this.level.walls ?? []) {
      b.minX = Math.min(b.minX, w.x)
      b.maxX = Math.max(b.maxX, w.x + w.w)
      b.minY = Math.min(b.minY, w.y)
      b.maxY = Math.max(b.maxY, w.y + w.h)
    }
    return b
  }

  uiExtras(): Partial<UiState> {
    return { tray: this.tray.map((t) => ({ ...t })), chainLen: this.chain.length }
  }

  equation(): string {
    const chain = this.trayPreview ? [...this.chain, this.trayPreview] : this.chain
    if (chain.length === 0) return 'drop arrows to build a chain'
    let sum = { ...ORIGIN }
    for (const v of chain) sum = add(sum, v)
    return `${chain.map(fmtVec).join(' + ')} = ${fmtVec(sum)}`
  }

  serialize(): unknown {
    return { tray: this.tray, chain: this.chain, moves: this.moves }
  }

  restore(data: unknown) {
    const d = data as { tray?: Vec[]; chain?: Vec[]; moves?: number }
    if (Array.isArray(d?.tray)) this.tray = d.tray.map((v) => ({ ...v }))
    if (Array.isArray(d?.chain)) this.chain = d.chain.map((v) => ({ ...v }))
    if (typeof d?.moves === 'number') this.moves = d.moves
  }

  persist() {
    if (this.state === 'play') saveMidLevel(this.level.id, this.serialize())
  }

  /* ---------- per-frame ---------- */

  update(dtMs: number) {
    if (this.linkDrag) this.linkSpring.update(dtMs)
    if (this.dash) {
      this.dash.d += (6 * dtMs) / 1000
      const { path, total } = this.dash
      let d = Math.min(this.dash.d, total)
      let pt = path[path.length - 1]
      for (let i = 1; i < path.length; i++) {
        const seg = dist(path[i - 1], path[i])
        if (d <= seg) {
          const k = seg < 1e-6 ? 0 : d / seg
          pt = { x: path[i - 1].x + (path[i].x - path[i - 1].x) * k, y: path[i - 1].y + (path[i].y - path[i - 1].y) * k }
          break
        }
        d -= seg
      }
      this.vexPos = pt
      if (this.engine.timeMs - this.lastTrail > 40) {
        this.lastTrail = this.engine.timeMs
        this.engine.burst(pt.x, pt.y, 'snap', this.engine.palette.amber)
      }
      if (this.dash.d >= total) {
        this.dash = null
        this.doWin(650)
      }
    }
  }

  /* ---------- draw ---------- */

  drawWorld(ctx: CanvasRenderingContext2D, eng: Engine) {
    const P = eng.palette
    for (const w of this.level.walls ?? []) drawWall(eng, w)
    drawPad(eng, this.goalPos(), { lockOn: this.lockOn(), label: 'GOAL' })
    drawPad(eng, ORIGIN, { rU: 0.45, color: P.amber })

    const joints = this.joints()
    for (let i = 0; i < this.chain.length; i++) {
      drawArrow(eng, joints[i], joints[i + 1], P.amber, { width: 4 })
    }
    // resultant preview (mint marching dashes)
    if (this.chain.length > 0) {
      const end = joints[joints.length - 1]
      const dashOff = (eng.timeMs / 1000) % 1
      ctx.save()
      ctx.setLineDash([6, 8])
      ctx.lineDashOffset = -dashOff * 14
      const a = eng.worldToScreen(ORIGIN)
      const b = eng.worldToScreen(end)
      ctx.strokeStyle = P.mint
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.75
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.restore()
      const sp = eng.worldToScreen(end)
      const rr = 8 + Math.sin(eng.timeMs / 240) * 2
      ctx.save()
      ctx.strokeStyle = P.mint
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, rr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      drawCoordLabel(eng, end, fmtVec(end), P.mint, 34)
    }
    // tray drag ghost (auto tip-to-tail at current chain end)
    if (this.trayPreview) {
      const tail = joints[joints.length - 1]
      drawArrow(eng, tail, add(tail, this.trayPreview), P.amber, { dashed: true, alpha: 0.7 })
    }
    // lifted link follows the finger
    if (this.linkDrag) {
      const d = this.linkDrag
      const tail = { x: this.linkSpring.x, y: this.linkSpring.y }
      const showTail = d.insertIdx !== null ? d.tail : tail
      drawArrow(eng, showTail, add(showTail, d.vec), d.insertIdx !== null ? P.mint : P.coral, {
        dashed: d.insertIdx === null,
        width: 4,
      })
      drawCoordLabel(eng, add(showTail, d.vec), fmtVec(d.vec), P.amber, 44)
    }
    eng.drawVex(this.vexPos)
  }
}
