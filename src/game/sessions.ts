/**
 * Session factory — dispatches to the right chapter session.
 */
import {
  createSessionRegistry,
  type Session,
  type SessionCtor,
  type SessionEvents,
} from '@gridverse/kit/session'
import type { LevelDef } from './levels'
import { Ch1Session } from './ch1'
import { Ch2Session } from './ch2'
import { Ch3Session } from './ch3'
import { Ch4Session } from './ch4'
import { Ch6Session } from './ch6'

const registry = createSessionRegistry<LevelDef, object>()

registry.register(
  '1',
  Ch1Session as unknown as SessionCtor<LevelDef, object>,
)
registry.register(
  '2',
  Ch2Session as unknown as SessionCtor<LevelDef, object>,
)
registry.register(
  '3',
  Ch3Session as unknown as SessionCtor<LevelDef, object>,
)
registry.register(
  '4',
  Ch4Session as unknown as SessionCtor<LevelDef, object>,
)
registry.register(
  '6',
  Ch6Session as unknown as SessionCtor<LevelDef, object>,
)

export function createSession(
  canvas: HTMLCanvasElement,
  level: LevelDef,
  events: SessionEvents<any>,
): Session<LevelDef, any> {
  const key = String(level.chapter)
  if (!['1', '2', '3', '4', '6'].includes(key)) {
    return new Ch1Session(
      canvas,
      level as never,
      events as unknown as ConstructorParameters<typeof Ch1Session>[2],
    )
  }
  return registry.create(
    key,
    canvas,
    level,
    events as unknown as SessionEvents<object>,
  ) as Session<LevelDef, any>
}
