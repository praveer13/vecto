import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { bindKitTheme, applyThemeToDom } from '@gridverse/kit'
import './index.css'
import App from './App.tsx'
import '@/store/gameStore'
import { VECTO_THEME } from '@/lib/theme'

bindKitTheme(VECTO_THEME)
applyThemeToDom(VECTO_THEME)

// MemoryRouter: in-app navigation never touches window.history (series canon).
// No <React.StrictMode>: it double-runs canvas/rAF effects (react-dev guide).
window.addEventListener('contextmenu', (e) => e.preventDefault())
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <App />
  </MemoryRouter>,
)
