#!/usr/bin/env node
/**
 * VECTO solvability harness.
 *
 * Programmatically proves every level in the LEVELS registry is beatable by
 * mirroring the win predicates from the chapter session implementations.
 */

import {
  LEVELS,
  type Ch1Level,
  type Ch2Level,
  type Ch3Level,
  type Ch4Level,
  type Ch6Level,
  type LevelDef,
} from '../src/game/levels'
import { cratesOnPads } from '../src/game/machine'
import {
  IDENTITY,
  add,
  apply,
  det,
  dist,
  mat,
  matFromCols,
  mul,
  projectOntoLine,
  scale,
  segIntersectsRect,
  snapTo,
  sub,
  vec,
  type Mat,
  type Vec,
} from '@gridverse/kit/engine'

// Tolerances and constants copied from the session / machine source.
const CH1_LOCK_DIST = 0.4 // ch1.ts: lockOn()
const CH2_LOCK_DIST = 0.45 // ch2.ts: lockOn()
const PAD_TOL = 0.35 // machine.ts: PAD_TOL
const CH6_COLLAPSE_TOL = PAD_TOL + 0.15 // ch6.ts: onUp collapse release
const CH2_MAX_SCALE = 3 // ch2.ts
const WIDGET_SNAP = 0.5 // machine.ts: SNAP_HALF
const WIDGET_RANGE = 3 // machine.ts: COL_RANGE

const ORIGIN = vec(0, 0)

// ---------------------------------------------------------------------------
// Small math helpers reimplemented here because the engine does not export
// matrix inversion or coefficient search.
// ---------------------------------------------------------------------------

function eq(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

function inv(m: Mat): Mat {
  const d = det(m)
  if (Math.abs(d) < 1e-9) throw new Error('singular matrix')
  return mat(m.d / d, -m.b / d, -m.c / d, m.a / d)
}

function pointToSegmentDist(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a)
  const ap = sub(p, a)
  const ab2 = ab.x * ab.x + ab.y * ab.y
  if (ab2 < 1e-12) return dist(p, a)
  let t = (ap.x * ab.x + ap.y * ab.y) / ab2
  t = Math.max(0, Math.min(1, t))
  return dist(p, vec(a.x + ab.x * t, a.y + ab.y * t))
}

function near(a: Vec, b: Vec, tol: number): boolean {
  return dist(a, b) <= tol
}

function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield [...arr]
    return
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) {
      yield [arr[i], ...p]
    }
  }
}

function* subsetsOfSize<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield []
    return
  }
  if (arr.length < k) return
  const [first, ...rest] = arr
  for (const s of subsetsOfSize(rest, k - 1)) yield [first, ...s]
  for (const s of subsetsOfSize(rest, k)) yield s
}

function* allSubsets<T>(arr: T[]): Generator<T[]> {
  for (let k = 0; k <= arr.length; k++) {
    for (const s of subsetsOfSize(arr, k)) yield s
  }
}

function rangeStep(start: number, end: number, step: number): number[] {
  const out: number[] = []
  for (let v = start; v <= end + 1e-9; v += step) out.push(v)
  return out
}

// ---------------------------------------------------------------------------
// Chapter solvers — each returns a success evidence object or null.
// ---------------------------------------------------------------------------

type Evidence =
  | { ok: true; chapter: number; id: string; name: string; detail: string }
  | { ok: false; chapter: number; id: string; name: string; detail: string }

function ch1Solve(level: Ch1Level): Evidence {
  const cards = level.cards
  const walls = level.walls ?? []

  // Enumerate every ordered subset of cards.  The game allows reordering and
  // dropping cards back in the tray, so the player can choose any subset in
  // any order.  mustUseAll forces the subset to be all cards.
  const sizes = level.mustUseAll ? [cards.length] : Array.from({ length: cards.length + 1 }, (_, i) => i)

  for (const size of sizes) {
    for (const subset of subsetsOfSize(cards, size)) {
      for (const chain of permutations(subset)) {
        const joints: Vec[] = [ORIGIN]
        let p = ORIGIN
        for (const v of chain) {
          p = add(p, v)
          joints.push(p)
        }
        const endpoint = p

        // Wall collision check mirrors Ch1Session.pathClear():
        // each segment is tested against every wall with segIntersectsRect.
        let clear = true
        for (let i = 1; i < joints.length && clear; i++) {
          for (const w of walls) {
            if (segIntersectsRect(joints[i - 1], joints[i], w)) {
              clear = false
              break
            }
          }
        }
        if (!clear) continue

        // Goal check: static pad, or moving pad whose oscillation axis is
        // given by level.movingGoal.  lockOn() requires endpoint within
        // CH1_LOCK_DIST of some point on the moving pad's segment.
        if (level.movingGoal) {
          const axis = level.movingGoal.axis
          const amp = level.movingGoal.amp
          const g = level.goalPad
          const a = axis === 'x' ? vec(g.x - amp, g.y) : vec(g.x, g.y - amp)
          const b = axis === 'x' ? vec(g.x + amp, g.y) : vec(g.x, g.y + amp)
          if (pointToSegmentDist(endpoint, a, b) <= CH1_LOCK_DIST) {
            return {
              ok: true,
              chapter: 1,
              id: level.id,
              name: level.name,
              detail: `chain [${chain.map((v) => `(${v.x},${v.y})`).join(' -> ')}] -> (${endpoint.x},${endpoint.y})`,
            }
          }
        } else {
          if (near(endpoint, level.goalPad, CH1_LOCK_DIST)) {
            return {
              ok: true,
              chapter: 1,
              id: level.id,
              name: level.name,
              detail: `chain [${chain.map((v) => `(${v.x},${v.y})`).join(' -> ')}] -> (${endpoint.x},${endpoint.y})`,
            }
          }
        }
      }
    }
  }

  return {
    ok: false,
    chapter: 1,
    id: level.id,
    name: level.name,
    detail: `no subset/order reaches goal ${level.goalPad.x},${level.goalPad.y}${level.walls ? ' (walls block)' : ''}`,
  }
}

function ch2Solve(level: Ch2Level): Evidence {
  // Game coefficients snap to 0.5 and clamp to [-3,3].  Search a generous
  // superset so half-puff levels like 2-3 are still found.
  const coeffs = rangeStep(-CH2_MAX_SCALE, CH2_MAX_SCALE, 0.5)
  const u = level.u
  const hasV = level.v !== null || !!level.newWind
  const vBase = level.newWind ? level.newWind.v : level.v ?? u

  // Helper: can we hit target t from base b with the current winds?
  const findCoefficients = (target: Vec, base: Vec): { a: number; b: number } | null => {
    for (const a of coeffs) {
      for (const b_ of coeffs) {
        const dest = add(base, add(scale(u, a), scale(vBase, hasV ? b_ : 0)))
        if (near(dest, target, CH2_LOCK_DIST)) {
          return { a, b: b_ }
        }
      }
    }
    return null
  }

  if (level.cumulative) {
    // 2-8: chain sails.  Each target must be hit in order; basePos moves.
    let base = ORIGIN
    const steps: string[] = []
    for (let i = 0; i < level.targets.length; i++) {
      const t = level.targets[i]
      const sol = findCoefficients(t, base)
      if (!sol) {
        return {
          ok: false,
          chapter: 2,
          id: level.id,
          name: level.name,
          detail: `cumulative step ${i + 1} to (${t.x},${t.y}) unreachable from (${base.x},${base.y})`,
        }
      }
      steps.push(`${sol.a}u + ${sol.b}v -> (${t.x},${t.y})`)
      base = t
    }
    return {
      ok: true,
      chapter: 2,
      id: level.id,
      name: level.name,
      detail: `cumulative: ${steps.join('; ')}`,
    }
  }

  if (level.collectAll) {
    // 2-5: visit every target, any order, resetting base to the last isle.
    const targets = level.targets.map((t, i) => ({ ...t, idx: i }))
    let base = ORIGIN
    const visited = new Set<number>()
    const order: string[] = []

    // Greedy is enough for the small target count; if it fails we backtrack.
    const solveCollect = (): boolean => {
      if (visited.size === targets.length) return true
      for (const t of targets) {
        if (visited.has(t.idx)) continue
        const sol = findCoefficients(t, base)
        if (!sol) continue
        visited.add(t.idx)
        const prevBase = base
        base = { x: t.x, y: t.y }
        order.push(`${sol.a}u + ${sol.b}v -> isle ${t.idx + 1} (${t.x},${t.y})`)
        if (solveCollect()) return true
        visited.delete(t.idx)
        base = prevBase
        order.pop()
      }
      return false
    }

    if (solveCollect()) {
      return {
        ok: true,
        chapter: 2,
        id: level.id,
        name: level.name,
        detail: `collect-all: ${order.join('; ')}`,
      }
    }
    return {
      ok: false,
      chapter: 2,
      id: level.id,
      name: level.name,
      detail: `no order collects all targets ${level.targets.map((t) => `(${t.x},${t.y})`).join(', ')}`,
    }
  }

  // Single-destination level (possibly with a new-wind replacement).
  const target = level.targets[0]
  const sol = findCoefficients(target, ORIGIN)
  if (sol) {
    const windNote = level.newWind ? ' (uses new wind)' : ''
    return {
      ok: true,
      chapter: 2,
      id: level.id,
      name: level.name,
      detail: `${sol.a}u + ${sol.b}v -> (${target.x},${target.y})${windNote}`,
    }
  }
  return {
    ok: false,
    chapter: 2,
    id: level.id,
    name: level.name,
    detail: `target (${target.x},${target.y}) unreachable from span`,
  }
}

function ch3Solve(level: Ch3Level): Evidence {
  if (level.designer) {
    // Designer levels: the player writes M in the basis widget.  The canonical
    // solution is level.target.  Crates are locked, so we assert
    // cratesOnPads(level.crates, target, level.pads).
    if (!level.target) {
      return {
        ok: false,
        chapter: 3,
        id: level.id,
        name: level.name,
        detail: 'designer level has no canonical target matrix',
      }
    }
    const ok = cratesOnPads(level.crates, level.target, level.pads)
    if (ok) {
      return {
        ok: true,
        chapter: 3,
        id: level.id,
        name: level.name,
        detail: `target matrix lands crates on pads`,
      }
    }
    return {
      ok: false,
      chapter: 3,
      id: level.id,
      name: level.name,
      detail: `canonical target does not land crates on pads`,
    }
  }

  // Fixed-machine levels: crates are draggable (unless cratesLocked, but none
  // of the fixed-machine Ch3 levels lock them).  We must show there EXISTS an
  // integer-grid placement whose image under M lands on the pads.
  // Because the session predicate is cratesOnPads(homes, M, pads), we solve
  // for homes by taking pad preimages and snapping to integers.
  const M = level.machine ?? IDENTITY
  const d = det(M)
  if (Math.abs(d) < 1e-9) {
    return {
      ok: false,
      chapter: 3,
      id: level.id,
      name: level.name,
      detail: 'fixed machine is singular',
    }
  }

  // For each permutation of pads, compute the required crate positions as
  // M^-1 * pad, snap to integers, and verify cratesOnPads within tolerance.
  const padIndices = level.pads.map((_, i) => i)
  for (const perm of permutations(padIndices)) {
    const proposed: Vec[] = []
    for (let i = 0; i < level.crates.length; i++) {
      const pad = level.pads[perm[i]]
      const pre = apply(inv(M), pad)
      proposed.push(vec(Math.round(pre.x), Math.round(pre.y)))
    }
    if (cratesOnPads(proposed, M, level.pads)) {
      return {
        ok: true,
        chapter: 3,
        id: level.id,
        name: level.name,
        detail: `place crates at ${proposed.map((v) => `(${v.x},${v.y})`).join(', ')}`,
      }
    }
  }

  return {
    ok: false,
    chapter: 3,
    id: level.id,
    name: level.name,
    detail: 'no integer crate placement maps to pads under fixed machine',
  }
}

function compose(order: number[], machines: Mat[]): Mat {
  // Mirrors Ch4Session.product(): first index in run order is applied first,
  // which with left-multiplication means P = M_last * ... * M_first.
  let P = IDENTITY
  for (const idx of order) P = mul(machines[idx], P)
  return P
}

function ch4Solve(level: Ch4Level): Evidence {
  const machineMats = level.machines.map((m) => m.m)

  if (level.designer) {
    // 4-8: design both tower matrices.  We need M1 * M0 to carry crates to pads.
    // The crates are (1,0), (0,1), (1,1) — i.e. c3 = c1 + c2.  A linear map is
    // therefore determined by where c1 and c2 go; c3 must go to their sum.
    const crates = level.crates
    const pads = level.pads
    if (crates.length !== pads.length) {
      return {
        ok: false,
        chapter: 4,
        id: level.id,
        name: level.name,
        detail: 'designer crate/pad count mismatch',
      }
    }

    // Find a bijection where the third crate image equals the sum of the first two.
    const indices = pads.map((_, i) => i)
    for (const perm of permutations(indices)) {
      const p1 = pads[perm[0]]
      const p2 = pads[perm[1]]
      const p3 = pads[perm[2]]
      if (!near(add(p1, p2), p3, 1e-9)) continue
      // Columns must be buildable in the basis widget (snap 0.5, range ±3).
      const M0 = matFromCols(p1, p2)
      const c1Ok = Math.abs(p1.x) <= WIDGET_RANGE && Math.abs(p1.y) <= WIDGET_RANGE
      const c2Ok = Math.abs(p2.x) <= WIDGET_RANGE && Math.abs(p2.y) <= WIDGET_RANGE
      const snapOk =
        eq(snapTo(p1.x, WIDGET_SNAP), p1.x, 1e-9) &&
        eq(snapTo(p1.y, WIDGET_SNAP), p1.y, 1e-9) &&
        eq(snapTo(p2.x, WIDGET_SNAP), p2.x, 1e-9) &&
        eq(snapTo(p2.y, WIDGET_SNAP), p2.y, 1e-9)
      if (c1Ok && c2Ok && snapOk) {
        // Decompose as M1=I, M0=M0; the player can build tower A as the product.
        if (cratesOnPads(crates, M0, pads)) {
          return {
            ok: true,
            chapter: 4,
            id: level.id,
            name: level.name,
            detail: `design M0 columns (${p1.x},${p1.y}) & (${p2.x},${p2.y}), M1=I`,
          }
        }
      }
    }
    return {
      ok: false,
      chapter: 4,
      id: level.id,
      name: level.name,
      detail: 'no constructible matrix pair lands crates on pads',
    }
  }

  // Try to land crates on pads under a given product matrix.  If crates are
  // locked we must use the level's crate positions; otherwise we search for an
  // integer-grid placement (the session snaps dragged crates to integers).
  const tryOrder = (order: number[]): { ok: boolean; crates?: Vec[]; P?: Mat } => {
    const P = compose(order, machineMats)
    if (level.cratesLocked) {
      return { ok: cratesOnPads(level.crates, P, level.pads), crates: level.crates, P }
    }
    const d = det(P)
    if (Math.abs(d) < 1e-9) return { ok: false }
    const padIndices = level.pads.map((_, i) => i)
    for (const perm of permutations(padIndices)) {
      const proposed: Vec[] = []
      for (let i = 0; i < level.crates.length; i++) {
        const pre = apply(inv(P), level.pads[perm[i]])
        proposed.push(vec(Math.round(pre.x), Math.round(pre.y)))
      }
      if (cratesOnPads(proposed, P, level.pads)) {
        return { ok: true, crates: proposed, P }
      }
    }
    return { ok: false }
  }

  // Levels with explicit orderOptions: test the full designed subset.
  if (level.orderOptions) {
    const working: number[][] = []
    for (const opt of level.orderOptions) {
      if (tryOrder(opt).ok) working.push(opt)
    }
    if (working.length === 0) {
      return {
        ok: false,
        chapter: 4,
        id: level.id,
        name: level.name,
        detail: `none of ${level.orderOptions.length} order options solve`,
      }
    }
    return {
      ok: true,
      chapter: 4,
      id: level.id,
      name: level.name,
      detail: `working order option(s): ${working.map((o) => `[${o.join(',')}]`).join(' ')}`,
    }
  }

  // Standard levels: initialOrder solves.  If swap is allowed, the reversed
  // order is also reachable.
  const ordersToTry: number[][] = [level.initialOrder]
  if (level.swap) {
    ordersToTry.push([...level.initialOrder].reverse())
  }

  for (const order of ordersToTry) {
    const res = tryOrder(order)
    if (res.ok) {
      const crateNote = level.cratesLocked
        ? ''
        : ` with crates ${res.crates!.map((v) => `(${v.x},${v.y})`).join(', ')}`
      return {
        ok: true,
        chapter: 4,
        id: level.id,
        name: level.name,
        detail: `order [${order.join(',')}]${crateNote} -> product lands crates on pads`,
      }
    }
  }

  return {
    ok: false,
    chapter: 4,
    id: level.id,
    name: level.name,
    detail: `initial order [${level.initialOrder.join(',')}]${level.swap ? ' (and its swap)' : ''} fails`,
  }
}

function ch6Solve(level: Ch6Level): Evidence {
  if (level.collapse) {
    // 6-7: det = 0.  Each critter is dragged along the collapse line and
    // released when within PAD_TOL + 0.15 of its home.  We assert every home
    // is close enough to the line to be snapped home.
    const dir = level.collapse.lineDir
    const bad = level.homes.filter((h) => {
      const proj = projectOntoLine(h, ORIGIN, dir)
      return dist(h, proj) > CH6_COLLAPSE_TOL
    })
    if (bad.length === 0) {
      return {
        ok: true,
        chapter: 6,
        id: level.id,
        name: level.name,
        detail: `all ${level.homes.length} homes reachable along collapse line`,
      }
    }
    return {
      ok: false,
      chapter: 6,
      id: level.id,
      name: level.name,
      detail: `homes ${bad.map((h) => `(${h.x},${h.y})`).join(', ')} too far from collapse line`,
    }
  }

  // Normal rewind: R = M^-1 exists iff det(M) != 0.  The widget then builds R,
  // and the go() predicate requires R*M to land every home within PAD_TOL of
  // itself (which is automatic for an exact inverse).
  const M = level.m
  const d = det(M)
  if (Math.abs(d) < 1e-9) {
    return {
      ok: false,
      chapter: 6,
      id: level.id,
      name: level.name,
      detail: 'world matrix is singular (non-collapse level)',
    }
  }

  const R = inv(M)
  // Verify the inverse is buildable in the basis widget.
  const cols = [vec(R.a, R.b), vec(R.c, R.d)]
  const buildable = cols.every(
    (c) =>
      Math.abs(c.x) <= WIDGET_RANGE &&
      Math.abs(c.y) <= WIDGET_RANGE &&
      eq(snapTo(c.x, WIDGET_SNAP), c.x, 1e-9) &&
      eq(snapTo(c.y, WIDGET_SNAP), c.y, 1e-9),
  )
  if (!buildable) {
    return {
      ok: false,
      chapter: 6,
      id: level.id,
      name: level.name,
      detail: `inverse columns (${R.a},${R.b}) & (${R.c},${R.d}) not buildable in widget`,
    }
  }

  const RM = mul(R, M)
  const ok = level.homes.every((h) => near(apply(RM, h), h, PAD_TOL))
  if (ok) {
    return {
      ok: true,
      chapter: 6,
      id: level.id,
      name: level.name,
      detail: `R = M^-1 lands all homes`,
    }
  }
  return {
    ok: false,
    chapter: 6,
    id: level.id,
    name: level.name,
    detail: `R*M does not land homes (unexpected)`,
  }
}

function solve(level: LevelDef): Evidence {
  switch (level.chapter) {
    case 1:
      return ch1Solve(level as Ch1Level)
    case 2:
      return ch2Solve(level as Ch2Level)
    case 3:
      return ch3Solve(level as Ch3Level)
    case 4:
      return ch4Solve(level as Ch4Level)
    case 6:
      return ch6Solve(level as Ch6Level)
    default:
      return {
        ok: false,
        chapter: level.chapter,
        id: level.id,
        name: level.name,
        detail: `unknown chapter ${level.chapter}`,
      }
  }
}

// ---------------------------------------------------------------------------
// Main harness loop.
// ---------------------------------------------------------------------------

const ids = Object.keys(LEVELS).sort((a, b) => {
  const [ca, na] = a.split('-').map(Number)
  const [cb, nb] = b.split('-').map(Number)
  return ca - cb || na - nb
})

let passed = 0
let failed = 0
const failures: Evidence[] = []

for (const id of ids) {
  const level = LEVELS[id]
  const result = solve(level)
  if (result.ok) {
    passed++
    console.log(`✓ ${id} — ${level.name}`)
  } else {
    failed++
    failures.push(result)
    console.log(`✗ ${id} — ${level.name}`)
  }
}

if (failures.length > 0) {
  console.error('\n--- UNSOLVABLE LEVELS ---')
  for (const f of failures) {
    console.error(`[${f.id}] Ch${f.chapter} ${f.name}`)
    console.error(`    ${f.detail}`)
  }
  console.error(`\n${passed}/${ids.length} levels solvable.`)
  process.exit(1)
}

console.log(`\nAll ${ids.length} levels solvable.`)
process.exit(0)
