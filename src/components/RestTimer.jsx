import { useState } from 'react'
import { useRestTimer } from '../store/restTimer.jsx'
import { useWorkout } from '../store/workout.jsx'

const PRESETS = [45, 60, 90, 120, 180]
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function RestTimer() {
  const t = useRestTimer()
  const { phase, split } = useWorkout()
  const [open, setOpen] = useState(false)

  const workoutActive = phase === 'active'
  // Stay out of the way entirely when there's nothing to time.
  if (!workoutActive && !t.running && !open) return null

  const accent = split?.color || 'var(--pull)'
  const nearlyDone = t.running && t.remaining <= 10 && t.remaining > 0
  const color = t.finished ? 'var(--legs)' : nearlyDone ? 'var(--gold)' : accent

  // Ring geometry for the minimised pill.
  const R = 13
  const CIRC = 2 * Math.PI * R
  const pct = t.duration > 0 ? Math.min(1, t.remaining / t.duration) : 0

  return (
    <>
      {/* ── Minimised: a legible countdown, not a 9px badge ─────────────── */}
      <button
        onClick={() => setOpen(true)}
        className={`rest-pill ${t.running ? 'is-running' : ''} ${t.finished ? 'is-done' : ''} ${nearlyDone ? 'is-urgent' : ''}`}
        style={{ '--pill-accent': color }}
        aria-label={t.running ? `Rest timer, ${fmt(t.remaining)} remaining` : 'Rest timer'}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
          <circle cx="16" cy="16" r={R} fill="none" stroke="var(--surface3)" strokeWidth="3" />
          {t.running && (
            <circle
              cx="16" cy="16" r={R} fill="none"
              stroke={color} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - pct)}
              transform="rotate(-90 16 16)"
              style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }}
            />
          )}
          {!t.running && (
            <g stroke="var(--muted2)" strokeWidth="2" strokeLinecap="round" fill="none">
              <path d="M16 10v6l4 3" />
            </g>
          )}
        </svg>

        {t.running && (
          <span className="rest-pill-time">{t.finished ? 'GO' : fmt(t.remaining)}</span>
        )}
      </button>

      {/* ── Expanded sheet ──────────────────────────────────────────────── */}
      {open && (
        <div className="sheet-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body" style={{ alignItems: 'center', gap: 20 }}>
              <p style={{ fontFamily: 'var(--font-head)', fontSize: 22, letterSpacing: '0.06em' }}>
                Rest Timer
              </p>

              <BigRing remaining={t.remaining} duration={t.duration} color={color} />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {PRESETS.map(p => (
                  <button
                    key={p}
                    className="btn btn-sm btn-ghost"
                    style={{
                      borderColor: t.duration === p ? color : 'transparent',
                      border: `1px solid ${t.duration === p ? color : 'var(--border)'}`,
                      color: t.duration === p ? color : 'var(--muted2)',
                    }}
                    onClick={() => t.setDuration(p)}
                  >
                    {p}s
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => t.adjust(-15)}>−15s</button>
                <button className="btn btn-ghost btn-sm" onClick={() => t.adjust(+15)}>+15s</button>
              </div>

              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={t.reset}>Reset</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2, background: t.finished ? 'var(--legs)' : undefined, color: t.finished ? '#fff' : undefined }}
                  onClick={t.finished ? t.reset : t.toggle}
                >
                  {t.finished ? 'Done ✓' : t.running ? 'Pause' : 'Start'}
                </button>
              </div>

              <label className="toggle-row">
                <span>
                  Auto-start after each set
                  <em>Starts this timer the moment you log a set.</em>
                </span>
                <input
                  type="checkbox"
                  checked={t.autoStartEnabled}
                  onChange={e => t.setAutoStart(e.target.checked)}
                />
              </label>

              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BigRing({ remaining, duration, color }) {
  const r = 46
  const circ = 2 * Math.PI * r
  const pct = duration > 0 ? Math.min(1, remaining / duration) : 0
  return (
    <div style={{ position: 'relative', width: 124, height: 124 }}>
      <svg width="124" height="124" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="62" cy="62" r={r} fill="none" stroke="var(--surface3)" strokeWidth="6" />
        <circle
          cx="62" cy="62" r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 500, color: 'var(--text)' }}>
          {fmt(remaining)}
        </span>
      </div>
    </div>
  )
}
