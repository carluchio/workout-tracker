import { createContext, useContext, useEffect, useRef, useState } from 'react'

const KEY = 'rest_timer_v1'
const PREFS_KEY = 'rest_timer_prefs_v1'

const loadPrefs = () => {
  try {
    return { duration: 60, autoStart: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return { duration: 60, autoStart: true }
  }
}

// endsAt is an absolute epoch timestamp rather than a decrementing counter, so
// the countdown stays truthful across a route change, a reload, or the phone
// locking mid-set — none of which a setInterval would survive.
const loadState = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!s) return { endsAt: null, paused: null }
    if (s.endsAt && s.endsAt < Date.now() - 60000) return { endsAt: null, paused: null }
    return s
  } catch {
    return { endsAt: null, paused: null }
  }
}

const Ctx = createContext(null)

export const useRestTimer = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRestTimer must be used inside <RestTimerProvider>')
  return v
}

export function RestTimerProvider({ children }) {
  const [prefs, setPrefs] = useState(loadPrefs)
  const [{ endsAt, paused }, setTimer] = useState(loadState)
  const [, forceTick] = useState(0)
  const firedRef = useRef(false)

  useEffect(() => { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) }, [prefs])
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify({ endsAt, paused })) }, [endsAt, paused])

  const running = endsAt != null
  const remaining = running
    ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    : (paused ?? prefs.duration)

  // Only tick while actually counting down.
  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => forceTick(n => n + 1), 250)
    return () => clearInterval(iv)
  }, [running])

  // Fire once when the countdown lands on zero.
  useEffect(() => {
    if (running && remaining === 0 && !firedRef.current) {
      firedRef.current = true
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    }
    if (remaining > 0) firedRef.current = false
  }, [running, remaining])

  const start = (secs) => {
    const d = secs ?? prefs.duration
    setTimer({ endsAt: Date.now() + d * 1000, paused: null })
  }

  // Called automatically when a set is logged.
  const autoStart = () => { if (prefs.autoStart) start() }

  const pause = () => setTimer({ endsAt: null, paused: remaining })
  const resume = () => setTimer({ endsAt: Date.now() + (paused ?? prefs.duration) * 1000, paused: null })
  const toggle = () => (running ? pause() : (remaining === 0 ? start() : resume()))
  const reset = () => setTimer({ endsAt: null, paused: null })

  // Adjusting while running shifts the deadline; while idle it retargets the
  // default so the next auto-start uses the new length.
  const adjust = (delta) => {
    if (running) {
      setTimer(t => ({ ...t, endsAt: Math.max(Date.now(), t.endsAt + delta * 1000) }))
    } else {
      const next = Math.max(15, (paused ?? prefs.duration) + delta)
      setPrefs(p => ({ ...p, duration: next }))
      setTimer({ endsAt: null, paused: null })
    }
  }

  const setDuration = (d) => {
    setPrefs(p => ({ ...p, duration: Math.max(15, d) }))
    if (!running) setTimer({ endsAt: null, paused: null })
  }

  const setAutoStart = (on) => setPrefs(p => ({ ...p, autoStart: on }))

  return (
    <Ctx.Provider value={{
      running, remaining, duration: prefs.duration, autoStartEnabled: prefs.autoStart,
      finished: running && remaining === 0,
      start, autoStart, pause, resume, toggle, reset, adjust, setDuration, setAutoStart,
    }}>
      {children}
    </Ctx.Provider>
  )
}
