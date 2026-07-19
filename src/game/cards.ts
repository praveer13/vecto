/**
 * VECTO concept card catalog — 18 collectible cards (results.md §2).
 * Flavor name on the front; the Nerd Note back carries the real math term,
 * one plain-words line (≤14 words) and a tiny mono example.
 */

export interface ConceptCard {
  id: string
  chapter: number
  flavor: string
  term: string
  note: string
  example: string
  img: string
  accent: string
}

const ACCENTS: Record<number, string> = {
  1: '#3DFFA2',
  2: '#22D3EE',
  3: '#FFB020',
  4: '#8B5CF6',
  5: '#FF2E93',
  6: '#FF6B4A',
}

function card(
  id: string,
  chapter: number,
  flavor: string,
  term: string,
  note: string,
  example: string,
  file: string,
): ConceptCard {
  return { id, chapter, flavor, term, note, example, img: `/cards-${file}.png`, accent: ACCENTS[chapter] }
}

export const CARD_CATALOG: Record<string, ConceptCard> = Object.fromEntries(
  [
    card('ch1-1', 1, 'Arrows', 'Vector', 'A trip with a length and a direction.', '(2,3) means 2 over, 3 up', 'ch1-1-arrows'),
    card('ch1-2', 1, 'Tip-to-Tail', 'Vector addition', 'Chaining trips tip-to-tail adds them together.', '(2,3) + (1,−1) = (3,2)', 'ch1-2-tiptail'),
    card('ch1-3', 1, 'Swap Trick', 'Commutativity', 'Swap the order of two trips — you land in the same spot.', 'u + v = v + u', 'ch1-3-swap'),
    card('ch2-1', 2, 'Two Winds', 'Linear combination', 'Scaling things and adding the results — like mixing two winds.', '1.5u + (−1)v', 'ch2-1-winds'),
    card('ch2-2', 2, 'Anywhere', 'Span', 'Everywhere a set of vectors can reach when mixed.', 'span{u, v} = the whole fan', 'ch2-2-anywhere'),
    card('ch2-3', 2, 'New Wind', 'Basis', 'Independent directions that together can reach everywhere.', 'u, v not parallel → basis', 'ch2-3-newwind'),
    card('ch3-1', 3, 'The Machine', 'Linear transformation', 'A rule that moves every point of space the same way.', 'M · (2,1) = (−1,2)', 'ch3-1-machine'),
    card('ch3-2', 3, 'Where î Goes', 'Matrix columns', 'A matrix’s columns are exactly where î and ĵ land.', 'M = [ î′ | ĵ′ ]', 'ch3-2-whereigo'),
    card('ch3-3', 3, 'Squish & Turn', 'Rotate / scale / shear', 'The three basic ways space can warp.', 'turn · stretch · rake', 'ch3-3-squishturn'),
    card('ch4-1', 4, 'One After Another', 'Composition', 'Doing one warp after another is itself a warp.', 'B(A(p))', 'ch4-1-after'),
    card('ch4-2', 4, 'Order Matters', 'Non-commutativity', 'Turn-then-rake and rake-then-turn land in different places.', 'B·A ≠ A·B', 'ch4-2-order'),
    card('ch4-3', 4, 'Merge', 'Matrix multiplication', 'Two machines fused into one chip — that product is multiplication.', 'B·A = one matrix', 'ch4-3-merge'),
    card('ch5-1', 5, 'Unmoved', 'Eigenvector', 'A direction the transformation cannot rotate.', 'M·v = λ·v', 'ch5-1-unmoved'),
    card('ch5-2', 5, 'Stretch Factor', 'Eigenvalue', 'How much an unmoved direction stretches or flips.', 'λ = 2 means ×2 stretch', 'ch5-2-stretch'),
    card('ch5-3', 5, 'No Straight Shot', 'Complex eigenvalues', 'Some warps rotate every direction — no real unmoved path.', 'rotation: no real λ', 'ch5-3-nostraight'),
    card('ch6-1', 6, 'Undo', 'Inverse matrix', 'The machine that takes every point back where it started.', 'M⁻¹ · M = I', 'ch6-1-undo'),
    card('ch6-2', 6, 'Area Juice', 'Determinant', 'How much a warp scales area — and whether it flips.', 'det = 2 → area ×2', 'ch6-2-areajuice'),
    card('ch6-3', 6, 'The Collapse', 'Singular matrix', 'A warp with det = 0 squashes space flat and cannot be undone.', 'det = 0 → no M⁻¹', 'ch6-3-collapse'),
  ].map((c) => [c.id, c]),
)

export const CHAPTER_CARDS: Record<number, string[]> = {
  1: ['ch1-1', 'ch1-2', 'ch1-3'],
  2: ['ch2-1', 'ch2-2', 'ch2-3'],
  3: ['ch3-1', 'ch3-2', 'ch3-3'],
  4: ['ch4-1', 'ch4-2', 'ch4-3'],
  5: ['ch5-1', 'ch5-2', 'ch5-3'],
  6: ['ch6-1', 'ch6-2', 'ch6-3'],
}

export interface BadgeMeta {
  id: string
  name: string
  img: string
}

export const BADGES: Record<string, BadgeMeta> = {
  'first-chain': { id: 'first-chain', name: 'First Chain', img: '/badges/first-chain.svg' },
  'commute-this': { id: 'commute-this', name: 'Commute This', img: '/badges/commute-this.svg' },
  'wind-rider': { id: 'wind-rider', name: 'Wind Rider', img: '/badges/wind-rider.svg' },
  'new-wind': { id: 'new-wind', name: 'New Wind', img: '/badges/new-wind.svg' },
  'machine-whisperer': { id: 'machine-whisperer', name: 'Machine Whisperer', img: '/badges/machine-whisperer.svg' },
  'order-schmorder': { id: 'order-schmorder', name: 'Order Schmorder', img: '/badges/order-schmorder.svg' },
  'eigen-hunter': { id: 'eigen-hunter', name: 'Eigen Hunter', img: '/badges/eigen-hunter.svg' },
  riftwalker: { id: 'riftwalker', name: 'Riftwalker', img: '/badges/riftwalker.svg' },
  'full-spectrum': { id: 'full-spectrum', name: 'Full Spectrum', img: '/badges/full-spectrum.svg' },
}

/** badge awarded for clearing a given level (finales + two special moments) */
export function badgesForLevel(levelId: string, finale: boolean | undefined): string[] {
  if (!finale) {
    if (levelId === '1-5') return ['commute-this']
    if (levelId === '2-6') return ['new-wind']
    return []
  }
  switch (levelId) {
    case '1-8':
      return ['first-chain']
    case '2-8':
      return ['wind-rider']
    case '3-8':
      return ['machine-whisperer']
    case '4-8':
      return ['order-schmorder']
    case '6-8':
      return ['riftwalker']
    default:
      return []
  }
}
