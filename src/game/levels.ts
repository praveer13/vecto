/**
 * VECTO level data — chapters 1–4 & 6 per gameplay.md §5 level tables.
 * Coordinates are world units (math convention: +y up). Bounds ≈ ±6.5u.
 */
import type { Mat, Vec } from './math'
import { mat, vec } from './math'

export interface Wall {
  x: number
  y: number
  w: number
  h: number
}

interface Base {
  id: string
  chapter: number
  name: string
  /** one-line goal for the intro card (≤ ~8 words) */
  goal: string
  /** coach mark shown on intro / first miss */
  coach: string
  par: number
  finale?: boolean
  /** concept card awarded on first clear */
  cardId?: string
}

export interface Ch1Level extends Base {
  chapter: 1
  cards: Vec[]
  goalPad: Vec
  walls?: Wall[]
  mustUseAll?: boolean
  movingGoal?: { axis: 'x' | 'y'; amp: number; periodMs: number }
}

export interface Ch2Level extends Base {
  chapter: 2
  u: Vec
  v: Vec | null // null = single-wind level
  targets: Vec[]
  /** 2-5: collect every isle, any order */
  collectAll?: boolean
  /** 2-8: sails chain cumulatively from the raft */
  cumulative?: boolean
  /** 2-6: tap to replace v */
  newWind?: { at: Vec; v: Vec }
}

export interface Ch3Level extends Base {
  chapter: 3
  /** fixed machine (non-designer levels) */
  machine?: Mat
  /** drag î'/ĵ' in the basis widget to write the matrix */
  designer?: boolean
  /** canonical solution matrix for designer levels (ghost-hand hint) */
  target?: Mat
  crates: Vec[]
  pads: Vec[]
  cratesLocked?: boolean
  walls?: Wall[]
}

export interface MachineDef {
  label: string
  m: Mat
}

export interface Ch4Level extends Base {
  chapter: 4
  machines: MachineDef[] // 2, or 3 for 4-4/4-7
  crates: Vec[]
  pads: Vec[]
  cratesLocked?: boolean
  /** initial run order as machine indices, e.g. [0,1] = A then B */
  initialOrder: number[]
  /** 4-4: exactly one of these orderings works */
  orderOptions?: number[][]
  swap?: boolean
  merge?: boolean
  designer?: boolean
}

export interface Ch6Level extends Base {
  chapter: 6
  /** the warp The Collapse applied to the world */
  m: Mat
  /** flavor: the chain that produced m (for intro copy) */
  chainDesc?: string
  homes: Vec[]
  /** 6-7: det = 0 set-piece; critters are dragged along the collapse line */
  collapse?: { lineDir: Vec }
}

export type LevelDef = Ch1Level | Ch2Level | Ch3Level | Ch4Level | Ch6Level

const ROT90 = mat(0, 1, -1, 0)
const SCALE2 = mat(2, 0, 0, 2)
const SHEARX = mat(1, 0, 1, 1)
const REFLECTX = mat(1, 0, 0, -1)
const SWAPXY = mat(0, 1, 1, 0)

export const LEVELS: Record<string, LevelDef> = {}

function def<L extends LevelDef>(l: L): L {
  LEVELS[l.id] = l
  return l
}

/* ---------------- Chapter 1 — Vector Valley ---------------- */

def<Ch1Level>({
  id: '1-1', chapter: 1, name: 'First Hop', par: 1, cardId: 'ch1-1',
  goal: 'Reach the gold pad!', coach: 'Drag an arrow onto the grid',
  cards: [vec(2, 3)], goalPad: vec(2, 3),
})
def<Ch1Level>({
  id: '1-2', chapter: 1, name: 'Two Steps', par: 2, cardId: 'ch1-2',
  goal: 'Chain two arrows to the pad!', coach: 'Tip to tail — chain them!',
  cards: [vec(2, 1), vec(1, 2)], goalPad: vec(3, 3),
})
def<Ch1Level>({
  id: '1-3', chapter: 1, name: 'Around the Rock', par: 2,
  goal: 'Go around the rock!', coach: 'Blocked! Try the other order',
  cards: [vec(2, 0), vec(2, 2)], goalPad: vec(4, 2),
  walls: [{ x: 0.6, y: -0.9, w: 2.4, h: 1.4 }],
})
def<Ch1Level>({
  id: '1-4', chapter: 1, name: 'Short or Long?', par: 2,
  goal: 'Two ways there — pick one!', coach: 'Short hop or long way?',
  cards: [vec(3, 1), vec(1, 2), vec(4, 3)], goalPad: vec(4, 3),
})
def<Ch1Level>({
  id: '1-5', chapter: 1, name: 'Swap Trick', par: 2, cardId: 'ch1-3',
  goal: 'Same landing, any order!', coach: 'Swap around — same landing',
  cards: [vec(2, 1), vec(1, 2), vec(3, 3)], goalPad: vec(3, 3),
})
def<Ch1Level>({
  id: '1-6', chapter: 1, name: 'Backtrack', par: 3,
  goal: 'The pad is behind you!', coach: 'Arrows can point backwards',
  cards: [vec(-2, 1), vec(-1, 2), vec(3, 0)], goalPad: vec(-3, 3),
})
def<Ch1Level>({
  id: '1-7', chapter: 1, name: 'The Decoy', par: 3,
  goal: 'Use every arrow!', coach: 'Two arrows cancel out!',
  cards: [vec(2, 3), vec(-2, -3), vec(1, 2)], goalPad: vec(1, 2), mustUseAll: true,
})
def<Ch1Level>({
  id: '1-8', chapter: 1, name: 'Valley Sprint', par: 3, finale: true,
  goal: 'Time the moving pad!', coach: 'Watch the pad… now GO!',
  cards: [vec(2, 2), vec(1, -1), vec(2, 0)], goalPad: vec(5, 1),
  movingGoal: { axis: 'x', amp: 1, periodMs: 4200 },
})

/* ---------------- Chapter 2 — Windfall Isles ---------------- */

def<Ch2Level>({
  id: '2-1', chapter: 2, name: 'Catch the Wind', par: 1, cardId: 'ch2-1',
  goal: 'Ride the wind to the isle!', coach: 'Drag the wind handle',
  u: vec(2, 1), v: null, targets: [vec(4, 2)],
})
def<Ch2Level>({
  id: '2-2', chapter: 2, name: 'Two Winds', par: 1,
  goal: 'Mix two winds!', coach: 'Set both winds, then SAIL',
  u: vec(2, 0), v: vec(0, 2), targets: [vec(4, 2)],
})
def<Ch2Level>({
  id: '2-3', chapter: 2, name: 'Half Puffs', par: 2,
  goal: 'Half-strength gusts count!', coach: 'Try a half puff',
  u: vec(2, 0), v: vec(1, 2), targets: [vec(2, 2)],
})
def<Ch2Level>({
  id: '2-4', chapter: 2, name: 'Headwind', par: 2,
  goal: 'Blow backwards!', coach: 'Negative wind blows back',
  u: vec(2, 1), v: vec(0, 2), targets: [vec(-2, 1)],
})
def<Ch2Level>({
  id: '2-5', chapter: 2, name: 'The Fan', par: 3, cardId: 'ch2-2',
  goal: 'Visit all three isles!', coach: 'Anywhere the winds reach',
  u: vec(2, 1), v: vec(-1, 2), targets: [vec(2, 1), vec(-1, 2), vec(1, 3)], collectAll: true,
})
def<Ch2Level>({
  id: '2-6', chapter: 2, name: 'Parallel Problem', par: 2, cardId: 'ch2-3',
  goal: 'These winds can’t reach it…', coach: 'Winds too parallel — grab the New Wind!',
  u: vec(2, 1), v: vec(1, 0.5), targets: [vec(2, 3)],
  newWind: { at: vec(-2, 3), v: vec(0, 2) },
})
def<Ch2Level>({
  id: '2-7', chapter: 2, name: 'Crosswinds', par: 2,
  goal: 'Far isle, awkward winds!', coach: 'Mix big — one strong, one soft',
  u: vec(2, 1), v: vec(1, 3), targets: [vec(5, 5)],
})
def<Ch2Level>({
  id: '2-8', chapter: 2, name: 'Isle Hopper', par: 3, finale: true,
  goal: 'Hop three isles — no reset!', coach: 'Sails chain from the raft',
  u: vec(2, 0), v: vec(0, 2), targets: [vec(2, 2), vec(4, 2), vec(4, 4)], cumulative: true,
})

/* ---------------- Chapter 3 — Warp Works ---------------- */

def<Ch3Level>({
  id: '3-1', chapter: 3, name: 'The Lever', par: 2, cardId: 'ch3-1',
  goal: 'Land the crate on the pad!', coach: 'Place the crate, pull the LEVER',
  machine: ROT90, crates: [vec(-2, -2)], pads: [vec(0, 2)],
})
def<Ch3Level>({
  id: '3-2', chapter: 3, name: 'Squisher', par: 2,
  goal: 'Everything doubles!', coach: 'Space stretches ×2',
  machine: SCALE2, crates: [vec(-2, -1)], pads: [vec(4, 2)],
})
def<Ch3Level>({
  id: '3-3', chapter: 3, name: 'Side Rake', par: 2,
  goal: 'The world rakes sideways!', coach: 'Higher crates slide further',
  machine: SHEARX, crates: [vec(-1, -2)], pads: [vec(3, 1)],
})
def<Ch3Level>({
  id: '3-4', chapter: 3, name: 'Twin Crates', par: 3,
  goal: 'Two crates, two pads, one warp!', coach: 'Both crates ride one warp',
  machine: ROT90, crates: [vec(-2, -2), vec(-3, 1)], pads: [vec(0, 2), vec(1, 0)],
})
def<Ch3Level>({
  id: '3-5', chapter: 3, name: 'Machine Designer', par: 3, cardId: 'ch3-2',
  goal: 'Build the spinner yourself!', coach: 'Drag î′ and ĵ′ on the mini grid',
  designer: true, target: ROT90, crates: [vec(2, 0)], pads: [vec(0, 2)], cratesLocked: true,
})
def<Ch3Level>({
  id: '3-6', chapter: 3, name: 'Mirror Mirror', par: 3,
  goal: 'Flip the world over!', coach: 'ĵ′ points down now',
  designer: true, target: REFLECTX, crates: [vec(1, 2)], pads: [vec(1, -2)], cratesLocked: true,
})
def<Ch3Level>({
  id: '3-7', chapter: 3, name: 'Precision Warp', par: 3, cardId: 'ch3-3',
  goal: 'Thread the gap exactly!', coach: 'One exact rake fits',
  designer: true, target: SHEARX, crates: [vec(2, 1)], pads: [vec(3, 1)], cratesLocked: true,
  walls: [{ x: 3.6, y: 0.2, w: 1.6, h: 1.6 }],
})
def<Ch3Level>({
  id: '3-8', chapter: 3, name: 'Foreman Vex', par: 4, finale: true,
  goal: 'One machine, three crates!', coach: 'Build a pure spinner',
  designer: true, target: ROT90, crates: [vec(2, 0), vec(0, 1), vec(1, 2)],
  pads: [vec(0, 2), vec(-1, 0), vec(-2, 1)], cratesLocked: true,
})

/* ---------------- Chapter 4 — Tandem Towers ---------------- */

def<Ch4Level>({
  id: '4-1', chapter: 4, name: 'Assembly Line', par: 2, cardId: 'ch4-1',
  goal: 'Ride tower A, then tower B!', coach: 'Crates ride A, then B',
  machines: [
    { label: 'A', m: ROT90 },
    { label: 'B', m: SCALE2 },
  ],
  crates: [vec(-2, -2)], pads: [vec(0, 2)], initialOrder: [0, 1],
})
def<Ch4Level>({
  id: '4-2', chapter: 4, name: 'Order Schmorder', par: 3, cardId: 'ch4-2',
  goal: 'Same towers — flipped order!', coach: 'Try swapping the towers',
  machines: [
    { label: 'A', m: ROT90 },
    { label: 'B', m: SHEARX },
  ],
  crates: [vec(1, 0)], pads: [vec(1, 1)], cratesLocked: true,
  initialOrder: [1, 0], swap: true,
})
def<Ch4Level>({
  id: '4-3', chapter: 4, name: 'Two Pads', par: 3,
  goal: 'Two crates through one chain!', coach: 'Both ride the same chain',
  machines: [
    { label: 'A', m: SCALE2 },
    { label: 'B', m: ROT90 },
  ],
  crates: [vec(-2, -1), vec(-3, 0)], pads: [vec(0, 2), vec(-2, 0)], initialOrder: [0, 1],
})
def<Ch4Level>({
  id: '4-4', chapter: 4, name: 'Pick the Lock', par: 3,
  goal: 'One ordering fits the lock!', coach: 'Tap a recipe chip',
  machines: [
    { label: 'A', m: ROT90 },
    { label: 'B', m: SHEARX },
    { label: 'C', m: SWAPXY },
  ],
  crates: [vec(1, 1)], pads: [vec(1, 0)], cratesLocked: true,
  initialOrder: [1, 2, 0],
  orderOptions: [
    [0, 1, 2],
    [1, 2, 0],
    [2, 1, 0],
  ],
})
def<Ch4Level>({
  id: '4-5', chapter: 4, name: 'Merge Day', par: 2, cardId: 'ch4-3',
  goal: 'Fuse the towers into one!', coach: 'Try MERGE — one warp, same landing',
  machines: [
    { label: 'A', m: ROT90 },
    { label: 'B', m: SCALE2 },
  ],
  crates: [vec(1, 0)], pads: [vec(0, 2)], cratesLocked: true,
  initialOrder: [0, 1], swap: true, merge: true,
})
def<Ch4Level>({
  id: '4-6', chapter: 4, name: 'The Nothing Machine', par: 2,
  goal: 'One tower does… nothing?', coach: 'The nothing tower changes nothing',
  machines: [
    { label: 'A', m: mat(1, 0, 0, 1) },
    { label: 'B', m: ROT90 },
  ],
  crates: [vec(2, 0)], pads: [vec(0, 2)], cratesLocked: true,
  initialOrder: [0, 1], swap: true, merge: true,
})
def<Ch4Level>({
  id: '4-7', chapter: 4, name: 'Three Towers', par: 4,
  goal: 'Three warps deep!', coach: 'Track the landing step by step',
  machines: [
    { label: 'A', m: SCALE2 },
    { label: 'B', m: ROT90 },
    { label: 'C', m: REFLECTX },
  ],
  crates: [vec(-2, 1)], pads: [vec(-2, -2)], initialOrder: [0, 1, 2],
})
def<Ch4Level>({
  id: '4-8', chapter: 4, name: 'Master Chainwright', par: 4, finale: true,
  goal: 'Design both towers!', coach: 'Tap A or B, drag its arrows',
  machines: [
    { label: 'A', m: mat(1, 0, 0, 1) },
    { label: 'B', m: mat(1, 0, 0, 1) },
  ],
  crates: [vec(1, 0), vec(0, 1), vec(1, 1)],
  pads: [vec(0, 1), vec(-1, 0), vec(-1, 1)], cratesLocked: true,
  initialOrder: [0, 1], swap: true, merge: true, designer: true,
})

/* ---------------- Chapter 6 — Rewind Rift ---------------- */

def<Ch6Level>({
  id: '6-1', chapter: 6, name: 'Take It Back', par: 2, cardId: 'ch6-1',
  goal: 'Un-double the world!', coach: 'Halve both columns',
  m: SCALE2, homes: [vec(2, 1)],
})
def<Ch6Level>({
  id: '6-2', chapter: 6, name: 'Unrake', par: 2,
  goal: 'Straighten the rake!', coach: 'Bend ĵ′ back upright',
  m: SHEARX, homes: [vec(2, 1)],
})
def<Ch6Level>({
  id: '6-3', chapter: 6, name: 'Spin Back', par: 2,
  goal: 'Unspin the world!', coach: 'Spin the columns backwards',
  m: ROT90, homes: [vec(2, 0)],
})
def<Ch6Level>({
  id: '6-4', chapter: 6, name: 'Two Critters', par: 3,
  goal: 'One rewind, two rescues!', coach: 'Both ride one rewind',
  m: SCALE2, homes: [vec(2, 1), vec(1, 2)],
})
def<Ch6Level>({
  id: '6-5', chapter: 6, name: 'Mirror Home', par: 3, cardId: 'ch6-2',
  goal: 'Flip the flip!', coach: 'Negative juice? Flip back',
  m: mat(1, 0, 0, -2), homes: [vec(1, 1)],
})
def<Ch6Level>({
  id: '6-6', chapter: 6, name: 'Chain Rewind', par: 3,
  goal: 'Undo a double warp!', coach: 'Undo the last warp first',
  m: mat(0, 2, -2, 0), chainDesc: 'doubled, then spun', homes: [vec(1, 0)],
})
def<Ch6Level>({
  id: '6-7', chapter: 6, name: 'The Collapse', par: 3, cardId: 'ch6-3',
  goal: 'Slide them home along the line!', coach: 'No juice left — slide along the line',
  m: mat(1, 1, 0.5, 0.5), homes: [vec(1, 1), vec(2, 2), vec(-1, -1)],
  collapse: { lineDir: vec(1, 1) },
})
def<Ch6Level>({
  id: '6-8', chapter: 6, name: 'Riftwalker', par: 4, finale: true,
  goal: 'Save all three — one rewind!', coach: 'Undo the rake, then the double',
  m: mat(2, 0, 2, 2), chainDesc: 'doubled, then raked', homes: [vec(1, 0), vec(0, 1), vec(1, 1)],
})

/* ---------------- helpers ---------------- */

export const CHAPTER_LEVEL_COUNT = 8
export const PLAYABLE_CHAPTERS = [1, 2, 3, 4, 6]

export function getLevel(id: string | null | undefined): LevelDef {
  if (id && LEVELS[id]) return LEVELS[id]
  return LEVELS['1-1']
}

export function nextLevelId(id: string): string | null {
  const [ch, n] = id.split('-').map(Number)
  if (!ch || !n) return null
  if (n < CHAPTER_LEVEL_COUNT && LEVELS[`${ch}-${n + 1}`]) return `${ch}-${n + 1}`
  const idx = PLAYABLE_CHAPTERS.indexOf(ch)
  if (idx >= 0 && idx < PLAYABLE_CHAPTERS.length - 1) {
    const nxt = `${PLAYABLE_CHAPTERS[idx + 1]}-1`
    if (LEVELS[nxt]) return nxt
  }
  return null
}

/** stars for a run: par → 3, par+2 → 2, else 1; any hint caps at 2 */
export function starsFor(moves: number, par: number, hintsUsed: number): number {
  let s = moves <= par ? 3 : moves <= par + 2 ? 2 : 1
  if (hintsUsed > 0) s = Math.min(s, 2)
  return s
}

export interface ResultPayload {
  levelId: string
  chapter: number
  levelName: string
  par: number
  moves: number
  stars: number
  hintsUsed: boolean
  xpEarned: number
  gearsEarned: number
  firstClear: boolean
  cardId?: string
  cardDuplicate?: boolean
  chapterComplete?: boolean
  newBadges: string[]
  nextLevelId: string | null
  daily?: boolean
  tryAgain?: boolean
  coachLine?: string
  xpBefore: number
  xpAfter: number
}

const RESULT_KEY = 'vecto-result-v1'

export function saveResult(p: ResultPayload): void {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(p))
  } catch {
    /* private mode — results falls back gracefully */
  }
}

export function loadResult(): ResultPayload | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ResultPayload
  } catch {
    return null
  }
}

/* ---------------- mid-level resume state ---------------- */

const MID_KEY = 'vecto-midlevel-v1'

export function saveMidLevel(levelId: string, data: unknown): void {
  try {
    sessionStorage.setItem(MID_KEY, JSON.stringify({ levelId, data }))
  } catch {
    /* no-op */
  }
}

export function loadMidLevel(levelId: string): unknown | null {
  try {
    const raw = sessionStorage.getItem(MID_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { levelId: string; data: unknown }
    return parsed.levelId === levelId ? parsed.data : null
  } catch {
    return null
  }
}

export function clearMidLevel(): void {
  try {
    sessionStorage.removeItem(MID_KEY)
  } catch {
    /* no-op */
  }
}

/* ---------------- ghost-hand "seen mechanic" tracking ---------------- */

const SEEN_KEY = 'vecto-seen-mech-v1'

export function hasSeenMechanic(key: string): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const seen: string[] = raw ? (JSON.parse(raw) as string[]) : []
    return seen.includes(key)
  } catch {
    return false
  }
}

export function markMechanicSeen(key: string): void {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const seen: string[] = raw ? (JSON.parse(raw) as string[]) : []
    if (!seen.includes(key)) {
      seen.push(key)
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    }
  } catch {
    /* no-op */
  }
}

/** pick the daily-drift level deterministically from the date */
export function dailyLevelId(dateISO: string): string {
  const pool = [
    '1-2', '1-4', '1-6', '1-7',
    '2-2', '2-3', '2-4', '2-7',
    '3-1', '3-2', '3-3', '3-4',
    '4-1', '4-3', '4-6',
    '6-1', '6-2', '6-3', '6-4',
  ]
  let h = 0
  for (let i = 0; i < dateISO.length; i++) h = (h * 31 + dateISO.charCodeAt(i)) >>> 0
  return pool[h % pool.length]
}
