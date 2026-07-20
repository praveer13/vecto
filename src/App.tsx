import { asset } from '@/lib/asset'
import { AppShell } from '@gridverse/kit/shell'
import { Home, Map as MapIcon, BookOpen, User } from 'lucide-react'
import HomePage from '@/pages/Home'
import Map from '@/pages/Map'
import Codex from '@/pages/Codex'
import Gameplay from '@/pages/Gameplay'
import Boss from '@/pages/Boss'
import Results from '@/pages/Results'
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'

/**
 * App shell — kit-driven router scaffold with bottom nav.
 * Routes: /, /map, /codex, /play, /boss, /results, /profile, /settings, *→Home.
 */
const ROUTES = [
  { path: '/', element: <HomePage />, navId: 'home' },
  { path: '/map', element: <Map />, navId: 'map' },
  { path: '/codex', element: <Codex />, navId: 'codex' },
  { path: '/play', element: <Gameplay /> },
  { path: '/boss', element: <Boss /> },
  { path: '/results', element: <Results /> },
  { path: '/profile', element: <Profile />, navId: 'profile' },
  { path: '/settings', element: <Settings /> },
  { path: '*', element: <HomePage /> },
] as const

const NAV = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'map', label: 'Map', icon: <MapIcon className="h-5 w-5" /> },
  { id: 'codex', label: 'Codex', icon: <BookOpen className="h-5 w-5" /> },
  { id: 'profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
] as const

export default function App() {
  return <AppShell routes={ROUTES} nav={NAV} mascotSrc={asset('mascot-vex.png')} />
}
