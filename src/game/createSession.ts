/**
 * Session factory — one session class per playable chapter.
 */
import type { LevelDef } from './levels'
import type { Session, SessionEvents } from './session'
import { Ch1Session } from './ch1'
import { Ch2Session } from './ch2'
import { Ch3Session } from './ch3'
import { Ch4Session } from './ch4'
import { Ch6Session } from './ch6'

export function createSession(canvas: HTMLCanvasElement, level: LevelDef, events: SessionEvents): Session {
  switch (level.chapter) {
    case 1:
      return new Ch1Session(canvas, level, events)
    case 2:
      return new Ch2Session(canvas, level, events)
    case 3:
      return new Ch3Session(canvas, level, events)
    case 4:
      return new Ch4Session(canvas, level, events)
    case 6:
      return new Ch6Session(canvas, level, events)
    default:
      // chapters outside this screen's scope (5/boss) fall back to Ch1 mechanics
      return new Ch1Session(canvas, { ...level, chapter: 1 } as never, events)
  }
}
