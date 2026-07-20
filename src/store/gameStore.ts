import {
  createGameStore,
  type GameState,
  type LevelProgress,
  chapterName as kitChapterName,
  chapterOf as kitChapterOf,
  DEFAULT_PLAYER_TITLES,
  selectHasAnyProgress,
  selectPlayerLevel,
  selectPlayerTitle,
  selectTotalStars,
  selectXpIntoLevel,
} from '@gridverse/kit/store'
import { bindKitSettings, type ColorblindMode, type KitSettings } from '@gridverse/kit/lib'

/**
 * VECTO game store instance — app wiring on top of @gridverse/kit/store.
 */

export type { GameState, LevelProgress, KitSettings }
export type { ColorblindMode }

export const useGameStore = createGameStore({
  saveKey: 'vecto-save-v1',
  firstLevelId: '1-1',
  defaultSkins: ['amber'],
})

// Bind kit engine/lib to the live store settings once.
bindKitSettings(() => useGameStore.getState().settings)

/** Player titles per design.md content inventory */
export const PLAYER_TITLES = DEFAULT_PLAYER_TITLES

export {
  selectPlayerLevel,
  selectXpIntoLevel,
  selectPlayerTitle,
  selectTotalStars,
  selectHasAnyProgress,
}

export const chapterOf = kitChapterOf

export const CHAPTERS: Array<{ id: string; name: string; accent: string }> = [
  { id: '1', name: 'Vector Valley', accent: '#3DFFA2' },
  { id: '2', name: 'Windfall Isles', accent: '#22D3EE' },
  { id: '3', name: 'Warp Works', accent: '#FFB020' },
  { id: '4', name: 'Tandem Towers', accent: '#8B5CF6' },
  { id: '5', name: 'Eigen Keep', accent: '#FF2E93' },
  { id: '6', name: 'Rewind Rift', accent: '#FF6B4A' },
]

export const chapterName = (levelId: string): string =>
  kitChapterName(levelId, CHAPTERS)
