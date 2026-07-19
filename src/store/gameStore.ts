import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * VECTO game store - progress + settings, persisted to localStorage.
 * Design refs: stealth rule, local-only progress, content inventory.
 * Page agents: consume via `useGameStore(selector)`; never write localStorage directly.
 */

export type ColorblindMode = 'off' | 'protan' | 'deutan' | 'tritan'

export interface LevelProgress {
  stars: number // 0-3
  completed: boolean
}

export interface SettingsState {
  masterVolume: number // 0..1
  musicVolume: number // 0..1
  sfxVolume: number // 0..1
  musicOn: boolean
  sfxOn: boolean
  hapticsOn: boolean
  gridIntensity: number // 0..1 - canvas grid brightness
  reduceMotion: boolean
  colorblind: ColorblindMode
  mathLabels: boolean // show real math terms instead of stealth names
  ghostHints: boolean // ghost-hand hint overlay
  snapStrength: 'gentle' | 'normal' | 'sticky' // drag snap assist
}

export interface GameState {
  /** false until the player has seen the title entrance once */
  visited: boolean
  /** level id ("1-1".."6-8", "boss") -> progress */
  levels: Record<string, LevelProgress>
  gears: number
  xp: number
  streakDays: number
  /** ISO date (yyyy-mm-dd) of last session, for streak logic */
  lastPlayedDay: string | null
  /** ISO date of last completed Daily Drift */
  dailyLastCompleted: string | null
  /** unlocked concept-card ids, e.g. "ch1-1" */
  cards: string[]
  badges: string[]
  skins: string[]
  activeSkin: string
  /** next level to play, e.g. "2-3" - drives the home CTA chip */
  currentLevel: string
  /** level quit mid-play; home CTA offers RESUME */
  resumeLevel: string | null
  settings: SettingsState

  markVisited: () => void
  completeLevel: (id: string, stars: number, gearsEarned?: number, xpEarned?: number) => void
  setCurrentLevel: (id: string) => void
  setResumeLevel: (id: string | null) => void
  addGears: (n: number) => void
  addXp: (n: number) => void
  unlockCard: (id: string) => void
  unlockBadge: (id: string) => void
  unlockSkin: (id: string) => void
  setActiveSkin: (id: string) => void
  completeDaily: (gearsEarned?: number) => void
  /** call once per session - rolls the streak forward on consecutive days */
  touchStreak: () => void
  updateSettings: (patch: Partial<SettingsState>) => void
  resetAll: () => void
}

export const DEFAULT_SETTINGS: SettingsState = {
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  musicOn: true,
  sfxOn: true,
  hapticsOn: true,
  gridIntensity: 0.8,
  reduceMotion: false,
  colorblind: 'off',
  mathLabels: false,
  ghostHints: true,
  snapStrength: 'normal',
}

const INITIAL = {
  visited: false,
  levels: {} as Record<string, LevelProgress>,
  gears: 0,
  xp: 0,
  streakDays: 0,
  lastPlayedDay: null as string | null,
  dailyLastCompleted: null as string | null,
  cards: [] as string[],
  badges: [] as string[],
  skins: ['amber'] as string[],
  activeSkin: 'amber',
  currentLevel: '1-1',
  resumeLevel: null as string | null,
  settings: DEFAULT_SETTINGS,
}

const today = () => new Date().toISOString().slice(0, 10)

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...INITIAL,

      markVisited: () => set({ visited: true }),

      completeLevel: (id, stars, gearsEarned = 0, xpEarned = 0) =>
        set((s) => {
          const prev = s.levels[id]
          return {
            levels: {
              ...s.levels,
              [id]: { stars: Math.max(stars, prev?.stars ?? 0), completed: true },
            },
            gears: s.gears + gearsEarned,
            xp: s.xp + xpEarned,
            resumeLevel: s.resumeLevel === id ? null : s.resumeLevel,
          }
        }),

      setCurrentLevel: (id) => set({ currentLevel: id }),
      setResumeLevel: (id) => set({ resumeLevel: id }),
      addGears: (n) => set((s) => ({ gears: Math.max(0, s.gears + n) })),
      addXp: (n) => set((s) => ({ xp: Math.max(0, s.xp + n) })),

      unlockCard: (id) =>
        set((s) => (s.cards.includes(id) ? s : { cards: [...s.cards, id] })),
      unlockBadge: (id) =>
        set((s) => (s.badges.includes(id) ? s : { badges: [...s.badges, id] })),
      unlockSkin: (id) =>
        set((s) => (s.skins.includes(id) ? s : { skins: [...s.skins, id] })),
      setActiveSkin: (id) => set({ activeSkin: id }),

      completeDaily: (gearsEarned = 40) =>
        set((s) => ({ dailyLastCompleted: today(), gears: s.gears + gearsEarned })),

      touchStreak: () =>
        set((s) => {
          const t = today()
          if (s.lastPlayedDay === t) return s
          const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
          return {
            lastPlayedDay: t,
            streakDays: s.lastPlayedDay === yesterday ? s.streakDays + 1 : 1,
          }
        }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetAll: () => set({ ...INITIAL, settings: { ...DEFAULT_SETTINGS } }),
    }),
    {
      name: 'vecto-save-v1',
      version: 1,
    },
  ),
)

/* ---------------- derived selectors ---------------- */

/** Player titles per design.md content inventory */
export const PLAYER_TITLES: Array<[number, string]> = [
  [30, 'Riftwalker'],
  [25, 'Eigen Hunter'],
  [20, 'Chainwright'],
  [15, 'Machinist'],
  [10, 'Sailor'],
  [5, 'Drifter'],
  [1, 'Spark'],
]

/** 100 XP per player level (flat arcade curve) */
export const selectPlayerLevel = (xp: number) => Math.floor(xp / 100) + 1
export const selectXpIntoLevel = (xp: number) => xp % 100

export const selectPlayerTitle = (level: number) => {
  for (const [min, title] of PLAYER_TITLES) if (level >= min) return title
  return 'Spark'
}

export const selectTotalStars = (s: Pick<GameState, 'levels'>) =>
  Object.values(s.levels).reduce((n, l) => n + l.stars, 0)

export const selectHasAnyProgress = (s: Pick<GameState, 'levels'>) =>
  Object.values(s.levels).some((l) => l.completed)

/** Chapter id ("1".."6") of a level id ("3-4" -> "3") */
export const chapterOf = (levelId: string) => levelId.split('-')[0]

export const CHAPTERS: Array<{ id: string; name: string; accent: string }> = [
  { id: '1', name: 'Vector Valley', accent: '#3DFFA2' },
  { id: '2', name: 'Windfall Isles', accent: '#22D3EE' },
  { id: '3', name: 'Warp Works', accent: '#FFB020' },
  { id: '4', name: 'Tandem Towers', accent: '#8B5CF6' },
  { id: '5', name: 'Eigen Keep', accent: '#FF2E93' },
  { id: '6', name: 'Rewind Rift', accent: '#FF6B4A' },
]

export const chapterName = (levelId: string) =>
  CHAPTERS.find((c) => c.id === chapterOf(levelId))?.name ?? 'Vector Valley'
