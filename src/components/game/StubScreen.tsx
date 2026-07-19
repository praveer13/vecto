import { useNavigate } from 'react-router'
import NeonButton from '@/components/game/NeonButton'
import Chip from '@/components/game/Chip'

/**
 * Placeholder for route stubs — page agents replace their page file wholesale.
 * Keeps every route renderable + on-theme until its real screen lands.
 */
export default function StubScreen({
  title,
  art,
  blurb,
}: {
  title: string
  art: string
  blurb: string
}) {
  const navigate = useNavigate()
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
      <img
        src="/nebula-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <img
          src={art}
          alt=""
          className="h-32 w-48 rounded-lg border border-line object-cover shadow-panel"
        />
        <h1 className="font-display text-h1 text-hi">{title}</h1>
        <p className="max-w-[260px] text-body font-semibold text-mid">{blurb}</p>
        <Chip tone="cyan">Route stub — screen in progress</Chip>
        <NeonButton variant="secondary" onClick={() => navigate('/')}>
          Back to title
        </NeonButton>
      </div>
    </div>
  )
}
