import { useState, useEffect, useRef } from 'react'

export default function RestTimer() {
  const [open, setOpen] = useState(false)
  const [duration, setDuration] = useState(60)
  const [remaining, setRemaining] = useState(60)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setRunning(false)
            clearInterval(intervalRef.current)
            // haptic if available
            if (navigator.vibrate) navigator.vibrate([200, 100, 200])
            return 0
          }
          return r - 1
        })
      }, 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  const startPause = () => {
    if (remaining === 0) {
      setRemaining(duration)
      setRunning(true)
    } else {
      setRunning(r => !r)
    }
  }

  const adjust = (delta) => {
    const next = Math.max(15, duration + delta)
    setDuration(next)
    if (!running) setRemaining(next)
  }

  const reset = () => {
    setRunning(false)
    setRemaining(duration)
  }

  const pct = remaining / duration
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <>
      {/* Floating trigger */}
      <button onClick={() => setOpen(true)} style={styles.fab} aria-label="Rest timer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        {running && <span style={styles.fabBadge}>{fmt(remaining)}</span>}
      </button>

      {/* Overlay */}
      {open && (
        <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div style={styles.sheet} className="fade-up">
            <div style={styles.handle} />
            <p style={styles.title}>Rest Timer</p>

            {/* Ring */}
            <div style={styles.ringWrap}>
              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface3)" strokeWidth="6" />
                <circle
                  cx="60" cy="60" r={r} fill="none"
                  stroke={remaining === 0 ? 'var(--legs)' : 'var(--pull)'}
                  strokeWidth="6"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
              </svg>
              <div style={styles.ringCenter}>
                <span style={styles.timerNum}>{fmt(remaining)}</span>
              </div>
            </div>

            {/* Adjust */}
            <div style={styles.adjustRow}>
              <button className="btn btn-ghost btn-sm" onClick={() => adjust(-15)}>−15s</button>
              <button className="btn btn-ghost btn-sm" onClick={() => adjust(+15)}>+15s</button>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>Reset</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, background: remaining === 0 ? 'var(--legs)' : undefined }}
                onClick={startPause}
              >
                {remaining === 0 ? 'Done ✓' : running ? 'Pause' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const styles = {
  fab: {
    position: 'fixed',
    bottom: 'calc(72px + 16px + var(--safe-bot))',
    right: '16px',
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--muted2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 50,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    flexDirection: 'column',
    gap: 2,
    WebkitTapHighlightColor: 'transparent',
  },
  fabBadge: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--pull)',
    lineHeight: 1,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sheet: {
    background: 'var(--surface)',
    borderRadius: '20px 20px 0 0',
    border: '1px solid var(--border)',
    borderBottom: 'none',
    padding: '16px 24px',
    paddingBottom: 'calc(40px + 80px + env(safe-area-inset-bottom, 0px))',
    width: '100%',
    maxWidth: 480,
    maxHeight: 'calc(100dvh - 60px)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    boxSizing: 'border-box',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--border)',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'var(--font-head)',
    fontSize: 22,
    letterSpacing: '0.06em',
    color: 'var(--text)',
  },
  ringWrap: {
    position: 'relative',
    width: 120,
    height: 120,
  },
  ringCenter: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerNum: {
    fontFamily: 'var(--font-mono)',
    fontSize: 28,
    fontWeight: 500,
    color: 'var(--text)',
  },
  adjustRow: {
    display: 'flex',
    gap: 10,
  },
}
