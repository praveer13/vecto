/**
 * VECTO content catalog — canonical game content shared by the Map, Profile
 * and Codex screens (my scope). Pure data + tiny helpers; no React, no store.
 *
 * Sources of truth:
 * - design.md §16/§17 (assets manifest, content inventory)
 * - chapters.md (zones, taglines, node structure: 8 circles + 1 finale hex)
 * - gameplay.md §5 (level names, gimmicks, pars)
 * - results.md §2 (concept-card Nerd Note copy)
 * - profile.md §3/§5 (badge criteria, skin/trail prices)
 *
 * Level id scheme (matches gameStore + /play?level= deep links):
 *   circle nodes:  "1-1" … "6-8"        (8 per zone, 48 total)
 *   finale hexes:  "1-f" … "6-f"        (chapter finales)
 *   ch5 finale:    "boss"               (EIGEN fight, routes to /boss)
 */

export interface ZoneMeta {
  chapter: number
  name: string
  accent: string
  tagline: string
  flavor: string
  vignette: string
  /** icons-game.svg symbol id for this chapter's mechanic */
  icon: string
  /** previous zone must be cleared to open (chapter 1 => null) */
  gateLabel: string | null
}

export const ZONES: ZoneMeta[] = [
  {
    chapter: 1,
    name: 'Vector Valley',
    accent: '#3DFFA2',
    tagline: 'Chain your first arrows.',
    flavor: 'Every trip is an arrow. Chain them tip-to-tail to go farther.',
    vignette: '/zone-vector-valley.png',
    icon: 'i-unit-arrow',
    gateLabel: null,
  },
  {
    chapter: 2,
    name: 'Windfall Isles',
    accent: '#22D3EE',
    tagline: 'Catch the winds.',
    flavor: 'The winds can take you anywhere their mix can reach.',
    vignette: '/zone-windfall-isles.png',
    icon: 'i-wind-ribbon',
    gateLabel: 'Clear Vector Valley to open',
  },
  {
    chapter: 3,
    name: 'Warp Works',
    accent: '#FFB020',
    tagline: 'Pull the lever. Mind the landing.',
    flavor: 'The machine moves the whole grid at once — crates just ride along.',
    vignette: '/zone-warp-works.png',
    icon: 'i-lever',
    gateLabel: 'Clear Windfall Isles to open',
  },
  {
    chapter: 4,
    name: 'Tandem Towers',
    accent: '#8B5CF6',
    tagline: 'Two machines. One truth: order matters.',
    flavor: 'Ride one tower, then the other. Swapping them changes the landing.',
    vignette: '/zone-tandem-towers.png',
    icon: 'i-machine-chip',
    gateLabel: 'Clear Warp Works to open',
  },
  {
    chapter: 5,
    name: 'Eigen Keep',
    accent: '#FF2E93',
    tagline: 'Some paths never bend.',
    flavor: 'EIGEN only fears shots that fly arrow-straight through the warp.',
    vignette: '/zone-eigen-keep.png',
    icon: 'i-turret',
    gateLabel: 'Clear Tandem Towers to open',
  },
  {
    chapter: 6,
    name: 'Rewind Rift',
    accent: '#FF6B4A',
    tagline: 'Undo what was done.',
    flavor: 'Every warp has a rewind — until the area juice runs out.',
    vignette: '/zone-rewind-rift.png',
    icon: 'i-unit-arrow',
    gateLabel: 'Defeat EIGEN to open',
  },
]

export interface LevelMeta {
  id: string // "3-4" | "3-f" | "boss"
  chapter: number
  /** 1..8 circle index, 9 = finale */
  index: number
  name: string
  goal: string
  par: number
  xp: number
  gears: number
  finale?: boolean
  boss?: boolean
}

const L = (
  chapter: number,
  index: number,
  name: string,
  goal: string,
  par: number,
  opts?: { finale?: boolean; boss?: boolean; id?: string; xp?: number; gears?: number },
): LevelMeta => ({
  id: opts?.id ?? (opts?.finale ? `${chapter}-f` : `${chapter}-${index}`),
  chapter,
  index,
  name,
  goal,
  par,
  xp: opts?.xp ?? (opts?.finale ? 60 + 10 * chapter : 20 + 5 * chapter),
  gears: opts?.gears ?? (opts?.finale ? 25 + 5 * chapter : 8 + 2 * chapter),
  finale: opts?.finale,
  boss: opts?.boss,
})

/**
 * All 54 map nodes in story order, grouped per zone.
 * Names/pars from gameplay.md §5; goals are ≤6-word coach lines.
 */
export const ZONE_LEVELS: LevelMeta[][] = [
  // Chapter 1 — Vector Valley
  [
    L(1, 1, 'First Hop', 'Hop one arrow to the gold pad.', 1),
    L(1, 2, 'Two Steps', 'Chain two arrows tip-to-tail.', 2),
    L(1, 3, 'Around the Rock', 'Detour around the wall.', 2),
    L(1, 4, 'Short or Long?', 'Two paths land — pick one.', 2),
    L(1, 5, 'Swap Trick', 'Hit both pads, both orders.', 2),
    L(1, 6, 'Backtrack', 'The pad hides behind you.', 3),
    L(1, 7, 'The Decoy', 'Cancel the decoy arrow.', 3),
    L(1, 8, 'Valley Sprint', 'Chase the sliding gold pad.', 3),
    L(1, 9, 'Portal Peak', 'Open the hilltop portal.', 4, { finale: true }),
  ],
  // Chapter 2 — Windfall Isles
  [
    L(2, 1, 'Catch the Wind', 'Ride one wind to the isle.', 1),
    L(2, 2, 'Two Winds', 'Mix two winds. Stick the landing.', 1),
    L(2, 3, 'Half Puffs', 'Half-strength puffs land soft.', 2),
    L(2, 4, 'Headwind', 'Sail backwards on purpose.', 2),
    L(2, 5, 'The Fan', 'Three isles, any order.', 3),
    L(2, 6, 'Parallel Problem', 'Winds too parallel — find a New Wind.', 2),
    L(2, 7, 'Crosswinds', 'An awkward mix, a far isle.', 2),
    L(2, 8, 'Isle Hopper', 'Chain three sails, no reset.', 3),
    L(2, 9, 'Eye of the Gale', 'Sail into the storm’s heart.', 4, { finale: true }),
  ],
  // Chapter 3 — Warp Works
  [
    L(3, 1, 'The Lever', 'Place the crate. Pull the lever.', 2),
    L(3, 2, 'Squisher', 'The machine doubles everything.', 2),
    L(3, 3, 'Side Rake', 'The floor slides sideways.', 2),
    L(3, 4, 'Twin Crates', 'Two crates, two pads, one warp.', 3),
    L(3, 5, 'Machine Designer', 'Drag î and ĵ. Build the warp.', 3),
    L(3, 6, 'Mirror Mirror', 'Build a mirror machine.', 3),
    L(3, 7, 'Precision Warp', 'Thread the gap with a shear.', 3),
    L(3, 8, 'Foreman Vex', 'Three crates, one custom machine.', 4),
    L(3, 9, 'The Big Machine', 'Warp the whole factory floor.', 5, { finale: true }),
  ],
  // Chapter 4 — Tandem Towers
  [
    L(4, 1, 'Assembly Line', 'Two towers. Predict the landing.', 2),
    L(4, 2, 'Order Schmorder', 'Same towers — swap the order.', 3),
    L(4, 3, 'Two Pads', 'Two crates through one chain.', 3),
    L(4, 4, 'Pick the Lock', 'One ordering works.', 3),
    L(4, 5, 'Merge Day', 'Fuse the towers into one.', 2),
    L(4, 6, 'The Nothing Machine', 'One tower does nothing. Really.', 2),
    L(4, 7, 'Three Towers', 'Hold the whole chain straight.', 4),
    L(4, 8, 'Master Chainwright', 'Design both towers yourself.', 4),
    L(4, 9, 'Twin Truth', 'Prove order rules the towers.', 5, { finale: true }),
  ],
  // Chapter 5 — Eigen Keep (arena training + boss)
  [
    L(5, 1, 'Target Practice', 'Shoot the pad through the machine.', 2),
    L(5, 2, 'Curveball', 'Shots bend under shear.', 3),
    L(5, 3, 'Straight and True', 'One direction flies straight.', 3),
    L(5, 4, 'Two Trues', 'Two straight directions exist.', 3),
    L(5, 5, 'The Flip', 'Backwards shots still count.', 3),
    L(5, 6, 'Keep Gates', 'Hit three pads, both true paths.', 4),
    L(5, 7, 'Echo Alley', 'Read the echo. Trust the grid.', 3),
    L(5, 8, 'Glyph Gauntlet', 'Every wall deflects something.', 4),
    L(5, 9, 'EIGEN, the Unmoved', 'Only unmoved shots hurt EIGEN.', 5, {
      finale: true,
      boss: true,
      id: 'boss',
      xp: 300,
      gears: 150,
    }),
  ],
  // Chapter 6 — Rewind Rift
  [
    L(6, 1, 'Take It Back', 'Rewind a ×2 stretch.', 2),
    L(6, 2, 'Unrake', 'Rewind a sideways slide.', 2),
    L(6, 3, 'Spin Back', 'Rewind a spin.', 2),
    L(6, 4, 'Two Critters', 'One rewind, two rescues.', 3),
    L(6, 5, 'Mirror Home', 'Flip the flip.', 3),
    L(6, 6, 'Chain Rewind', 'Undo the chain — order flips!', 3),
    L(6, 7, 'The Collapse', 'No rewind. Slide along the line.', 3),
    L(6, 8, 'Riftwalker', 'Save three critters at once.', 4),
    L(6, 9, 'Stitch the Sky', 'Sew the rift shut for good.', 5, { finale: true }),
  ],
]

export const ALL_LEVELS: LevelMeta[] = ZONE_LEVELS.flat()

export const levelById = (id: string): LevelMeta | undefined =>
  ALL_LEVELS.find((l) => l.id === id)

/** finale level id for a chapter ("3" -> "3-f", 5 -> "boss") */
export const finaleIdOf = (chapter: number): string =>
  ZONE_LEVELS[chapter - 1][8].id

/* ---------------- concept cards ---------------- */

export interface CardMeta {
  id: string // "ch2-1" (matches store cards[])
  chapter: number
  flavor: string
  term: string
  note: string
  example: string
  img: string
  /** level id whose first clear awards it (map teaser + "Found in") */
  foundIn: string
  foundLabel: string
}

const C = (
  chapter: number,
  n: 1 | 2 | 3,
  slug: string,
  flavor: string,
  term: string,
  note: string,
  example: string,
  foundIn: string,
  foundLabel: string,
): CardMeta => ({
  id: `ch${chapter}-${n}`,
  chapter,
  flavor,
  term,
  note,
  example,
  img: `/cards-ch${chapter}-${n}-${slug}.png`,
  foundIn,
  foundLabel,
})

/** The 18 collectible concept cards (results.md §2 copy). */
export const CARDS: CardMeta[] = [
  // Ch1 — mint
  C(1, 1, 'arrows', 'Arrows', 'Vector', 'A trip with a length and a direction.', '(2, 3)', '1-2', 'Level 1-2'),
  C(1, 2, 'tiptail', 'Tip-to-Tail', 'Vector addition', 'Chain arrows — the shortcut from start to finish.', '(2,3) + (1,−1) = (3,2)', '1-5', 'Level 1-5'),
  C(1, 3, 'swap', 'Swap Trick', 'Commutativity', 'Arrow order never changes the landing.', 'a + b = b + a', '1-f', 'Vector Valley finale'),
  // Ch2 — cyan
  C(2, 1, 'winds', 'Two Winds', 'Linear combination', 'Scaling things and adding the results — like mixing two winds.', '1.5u + (−1)v', '2-2', 'Level 2-2'),
  C(2, 2, 'anywhere', 'Anywhere', 'Span', 'Everywhere a mix of your winds can reach.', 'span{u, v}', '2-5', 'Level 2-5'),
  C(2, 3, 'newwind', 'New Wind', 'Basis', 'A wind that no mix of the others can fake.', 'w ∉ span{u, v}', '2-f', 'Windfall Isles finale'),
  // Ch3 — amber
  C(3, 1, 'machine', 'The Machine', 'Linear transformation', 'One rule that warps every arrow the same way.', 'T(v) = Av', '3-2', 'Level 3-2'),
  C(3, 2, 'whereigo', 'Where î Goes', 'Matrix columns', 'A matrix is just where î and ĵ land.', 'A = [ T(î)  T(ĵ) ]', '3-5', 'Level 3-5'),
  C(3, 3, 'squishturn', 'Squish & Turn', 'Rotate · scale · shear', 'The three flavors of grid warp.', 'R(θ) · kI · S', '3-f', 'Warp Works finale'),
  // Ch4 — violet
  C(4, 1, 'after', 'One After Another', 'Composition', 'Ride one machine, then the next.', 'B(A(v))', '4-2', 'Level 4-2'),
  C(4, 2, 'order', 'Order Matters', 'Non-commutativity', 'Swap the towers, change the landing.', 'AB ≠ BA', '4-5', 'Level 4-5'),
  C(4, 3, 'merge', 'Merge', 'Matrix multiplication', 'Two machines fused into a single chip.', '(BA)v = B(Av)', '4-f', 'Tandem Towers finale'),
  // Ch5 — magenta
  C(5, 1, 'unmoved', 'Unmoved', 'Eigenvector', 'A direction the transformation can’t rotate.', 'Av = λv', 'boss', 'Eigen Keep boss'),
  C(5, 2, 'stretch', 'Stretch Factor', 'Eigenvalue', 'How hard an unmoved path gets stretched.', 'λ = 2', 'boss', 'Eigen Keep boss'),
  C(5, 3, 'nostraight', 'No Straight Shot', 'No real eigenvectors', 'Some spins twist every single arrow.', 'R(90°)v ≠ λv', 'boss', 'Eigen Keep boss'),
  // Ch6 — coral
  C(6, 1, 'undo', 'Undo', 'Inverse matrix', 'The machine that undoes another machine.', 'A⁻¹A = I', '6-2', 'Level 6-2'),
  C(6, 2, 'areajuice', 'Area Juice', 'Determinant', 'How much a warp scales area.', 'det A = 2', '6-5', 'Level 6-5'),
  C(6, 3, 'collapse', 'The Collapse', 'Singular matrix', 'Area juice at zero — space flattens, no undo.', 'det A = 0', '6-f', 'Rewind Rift finale'),
]

export const cardById = (id: string): CardMeta | undefined =>
  CARDS.find((c) => c.id === id)

/** cards awarded by first-clearing a given level id */
export const cardsForLevel = (levelId: string): CardMeta[] =>
  CARDS.filter((c) => c.foundIn === levelId)

/* ---------------- badges ---------------- */

export interface BadgeMeta {
  id: string // matches /badges/<id>.svg + store badges[]
  name: string
  criteria: string
  /** shown while locked (hidden badge stays cryptic) */
  hint: string
  hidden?: boolean
}

export const BADGES: BadgeMeta[] = [
  { id: 'first-chain', name: 'First Chain', criteria: 'Place two arrows tip-to-tail.', hint: 'Chain two arrows in Vector Valley.' },
  { id: 'commute-this', name: 'Commute This', criteria: 'Clear a Chapter 1 level using both orders.', hint: 'One level, both orders.' },
  { id: 'wind-rider', name: 'Wind Rider', criteria: 'Sail 25 wind combinations.', hint: 'Keep sailing the isles.' },
  { id: 'new-wind', name: 'New Wind', criteria: 'Escape a parallel-wind level (2-6).', hint: 'Some winds are too parallel…' },
  { id: 'machine-whisperer', name: 'Machine Whisperer', criteria: 'Build a custom warp machine (3-5).', hint: 'The machine listens to î and ĵ.' },
  { id: 'order-schmorder', name: 'Order Schmorder', criteria: 'Solve 4-2 in both orders.', hint: 'Swap happens.' },
  { id: 'eigen-hunter', name: 'Eigen Hunter', criteria: 'Beat EIGEN without a single echo hint.', hint: 'Straight shots. No hints.' },
  { id: 'riftwalker', name: 'Riftwalker', criteria: 'Finish Rewind Rift (6-f).', hint: 'The rift awaits.' },
  { id: 'full-spectrum', name: 'Full Spectrum', criteria: 'Earn 3 stars on every level.', hint: 'Perfection is its own reward.', hidden: true },
]

/* ---------------- style shop ---------------- */

export interface SkinMeta {
  id: string // matches store skins[] / activeSkin
  name: string
  img: string
  price: number // 0 = owned by default
}

export const SKINS: SkinMeta[] = [
  { id: 'amber', name: 'Default', img: '/mascot-vex.png', price: 0 },
  { id: 'nebula', name: 'Nebula', img: '/mascot-vex-nebula.png', price: 200 },
  { id: 'ember', name: 'Ember', img: '/mascot-vex-ember.png', price: 200 },
  { id: 'ghost', name: 'Mint Ghost', img: '/mascot-vex-ghost.png', price: 350 },
]

export interface TrailMeta {
  id: string
  name: string
  price: number
  color: string
}

export const TRAILS: TrailMeta[] = [
  { id: 'none', name: 'None', price: 0, color: '#64769C' },
  { id: 'comet', name: 'Comet', price: 150, color: '#FFD166' },
  { id: 'sparkler', name: 'Sparkler', price: 150, color: '#22D3EE' },
  { id: 'ribbon', name: 'Ribbon', price: 150, color: '#8B5CF6' },
]

/* ---------------- progress helpers (pure) ---------------- */

export interface LevelStateLike {
  stars: number
  completed: boolean
}

type LevelsLike = Record<string, LevelStateLike | undefined>

/** node cleared check — the boss fight records its win as '5-8', the map node is 'boss' */
const isNodeCleared = (id: string, levels: LevelsLike): boolean =>
  !!levels[id]?.completed || (id === 'boss' && !!levels['5-8']?.completed)

/** zone (chapter) is open when the previous chapter's finale is cleared */
export const isZoneOpen = (chapter: number, levels: LevelsLike): boolean =>
  chapter <= 1 || isNodeCleared(finaleIdOf(chapter - 1), levels)

/** node unlocked when zone open and the previous node in the zone is cleared */
export const isLevelUnlocked = (meta: LevelMeta, levels: LevelsLike): boolean => {
  if (!isZoneOpen(meta.chapter, levels)) return false
  if (meta.index <= 1) return true
  return isNodeCleared(ZONE_LEVELS[meta.chapter - 1][meta.index - 2].id, levels)
}

/** first unlocked-but-uncleared node in story order; last node when all done */
export const currentNodeId = (levels: LevelsLike): string => {
  for (const zone of ZONE_LEVELS) {
    for (const meta of zone) {
      if (!isLevelUnlocked(meta, levels)) {
        // first locked node => current is the one just before it
        const zi = meta.chapter - 1
        const prev = meta.index > 1 ? ZONE_LEVELS[zi][meta.index - 2] : null
        if (prev) return prev.id
        // locked at a zone's first node => previous zone's finale… which is
        // cleared, so the current node is this zone's first node minus gate.
        // In practice the gate keeps the player at the previous finale.
        const prevZone = ZONE_LEVELS[zi - 1]
        return prevZone ? prevZone[prevZone.length - 1].id : '1-1'
      }
      if (!isNodeCleared(meta.id, levels)) return meta.id
    }
  }
  // everything cleared — Vex stands at the final node
  return ALL_LEVELS[ALL_LEVELS.length - 1].id
}

/** stars earned in one zone (standard levels only; finales award none) */
export const zoneStars = (chapter: number, levels: LevelsLike): number =>
  ZONE_LEVELS[chapter - 1]
    .filter((l) => !l.finale)
    .reduce((n, l) => n + (levels[l.id]?.stars ?? 0), 0)

/** total earnable stars: 48 standard levels × 3 = 144 (design copy "/144") */
export const TOTAL_STARS = 48 * 3

export const countCleared = (levels: LevelsLike): number =>
  ALL_LEVELS.filter((l) => levels[l.id]?.completed).length

/** highest chapter with any clear — drives the profile emblem */
export const currentChapter = (levels: LevelsLike): number => {
  let ch = 1
  for (const zone of ZONE_LEVELS) {
    if (zone.some((l) => levels[l.id]?.completed)) ch = zone[0].chapter
  }
  return ch
}
