import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import LogPage from './pages/LogPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import LibraryPage from './pages/LibraryPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import RestTimer from './components/RestTimer.jsx'
import { WorkoutProvider, useWorkout } from './store/workout.jsx'
import { RestTimerProvider } from './store/restTimer.jsx'

const NAV = [
  { path: '/',          label: 'Log',        icon: LogIcon },
  { path: '/dashboard', label: 'Dashboard',  icon: DashIcon },
  { path: '/history',   label: 'History',    icon: HistoryIcon },
  { path: '/library',   label: 'Ex Library', icon: LibIcon },
  { path: '/settings',  label: 'Settings',   icon: SettingsIcon },
]

// Session state lives above the router, so switching to History or the Exercise
// Library no longer unmounts the workout. Both providers wrap the shell.
export default function App() {
  return (
    <WorkoutProvider>
      <RestTimerProvider>
        <Shell />
      </RestTimerProvider>
    </WorkoutProvider>
  )
}

function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { phase, split } = useWorkout()
  const sessionLive = phase === 'active'

  return (
    <div className="app-shell grain">
      <div className="page-content">
        <Routes>
          <Route path="/"          element={<LogPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/history"   element={<HistoryPage />} />
          <Route path="/library"   element={<LibraryPage />} />
          <Route path="/settings"  element={<SettingsPage />} />
        </Routes>
      </div>

      <nav className="bottom-nav">
        {NAV.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path
          return (
            <button
              key={path}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <span style={{ position: 'relative', display: 'flex' }}>
                <Icon active={active} />
                {/* A live session is now survivable, so say so. */}
                {path === '/' && sessionLive && (
                  <span
                    style={{
                      position: 'absolute', top: -2, right: -4,
                      width: 7, height: 7, borderRadius: '50%',
                      background: split?.color || 'var(--legs)',
                      boxShadow: '0 0 0 2px var(--surface)',
                    }}
                  />
                )}
              </span>
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <RestTimer />
    </div>
  )
}

function LogIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function DashIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function HistoryIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}
function LibIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14" />
      <path d="M8 21h8M12 7v6M9 10h6" />
    </svg>
  )
}
function SettingsIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}
