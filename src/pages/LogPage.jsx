import { useEffect, useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { useWorkout } from '../store/workout.jsx'
import { useRestTimer } from '../store/restTimer.jsx'
import { fetchSplits } from '../lib/config.js'
import Stepper from '../components/Stepper.jsx'

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function LogPage() {
  const w = useWorkout()
  const timer = useRestTimer()

  const [splits, setSplits] = useState([])
  const [migrated, setMigrated] = useState(true)
  const [loadingSplits, setLoadingSplits] = useState(true)
  const [starting, setStarting] = useState(false)
  const [lastSession, setLastSession] = useState(null)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const [logging, setLogging] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const stored = localStorage.getItem('last_session')
    if (stored) { try { setLastSession(JSON.parse(stored)) } catch { /* ignore */ } }
  }, [])

  useEffect(() => {
    if (w.phase !== 'select') return
    let alive = true
    setLoadingSplits(true)
    fetchSplits().then(({ splits, migrated }) => {
      if (!alive) return
      setSplits(splits)
      setMigrated(migrated)
      setLoadingSplits(false)
    })
    return () => { alive = false }
  }, [w.phase])

  // Elapsed is derived from the persisted start timestamp rather than an
  // accumulating interval, so it stays correct across a screen change.
  useEffect(() => {
    if (w.phase !== 'active') return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [w.phase])

  const elapsed = w.startedAt ? Math.max(0, Math.floor((now - w.startedAt) / 1000)) : 0

  const start = async (split) => {
    setStarting(true)
    const ok = await w.startSession(split)
    if (!ok) setStarting(false)
  }

  const requestFinish = () => {
    if (w.totalSetsLogged > 0) setShowFinishConfirm(true)
    else w.finishSession()
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  if (w.phase === 'summary' && w.summary) {
    const s = w.summary
    const accent = s.color || 'var(--pull)'
    const mins = Math.floor(s.durationSecs / 60)
    const secs = s.durationSecs % 60

    return (
      <div style={S.centeredPage} className="fade-in">
        <div style={S.centeredInner}>
          <div style={{ textAlign: 'center' }}>
            <p style={S.eyebrow}>{s.autoEnded ? 'ENDED — 30 MIN INACTIVE' : 'SESSION COMPLETE'}</p>
            <h1 style={{ ...S.heading, color: accent, fontSize: 60, textAlign: 'center' }}>
              {(s.splitName || '').toUpperCase()}
            </h1>
          </div>

          {s.autoEnded && (
            <div className="banner banner-warn">
              No activity for 30 minutes, so this session was closed and saved automatically.
              Everything you logged is safe.
            </div>
          )}

          <div style={S.summaryStats}>
            <Stat value={`${mins}:${String(secs).padStart(2, '0')}`} label="Duration" />
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
            <Stat value={s.totalSets} label="Total Sets" />
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
            <Stat value={s.exerciseCount} label="Exercises" />
          </div>

          {s.topLifts.length > 0 && (
            <div style={S.summaryLifts}>
              <p className="section-label" style={{ marginBottom: 10 }}>Top Lifts</p>
              {s.topLifts.map((lift, i) => (
                <div
                  key={i}
                  style={{
                    ...S.summaryLift,
                    ...(i === s.topLifts.length - 1
                      ? { borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }
                      : {}),
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted2)', flex: 1 }}>{lift.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
                    {lift.weight_lbs} lbs × {lift.reps}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary" style={{ fontSize: 16, fontWeight: 700 }} onClick={w.dismissSummary}>
            Done ✓
          </button>
        </div>
      </div>
    )
  }

  // ── SELECT ────────────────────────────────────────────────────────────────
  if (w.phase === 'select') {
    const lastInfo = lastSession
      ? `Last: ${lastSession.type} · ${formatDistanceToNow(new Date(lastSession.date), { addSuffix: true })}`
      : null

    return (
      <div style={S.centeredPage} className="fade-in">
        <div style={S.centeredInner}>
          <div>
            <p style={S.eyebrow}>LIFT</p>
            <h1 style={S.heading}>WHAT ARE WE<br />DOING TODAY?</h1>
          </div>

          {!migrated && (
            <div className="banner banner-warn">
              Running on the built-in splits. Run <strong>supabase/migration-002.sql</strong> in the
              Supabase SQL editor to unlock custom splits, exercise notes and a configurable dashboard.
            </div>
          )}

          {loadingSplits ? (
            <p style={S.lastInfo}>Loading…</p>
          ) : !splits.length ? (
            <div className="empty-state">
              <h3>No splits configured</h3>
              <p>Add one in Settings to start training.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {splits.map(split => (
                <button
                  key={split.id}
                  onClick={() => !starting && start(split)}
                  style={{ '--accent': split.color, opacity: starting ? 0.5 : 1 }}
                  className="type-btn"
                  disabled={starting}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...S.typeBtnLabel, color: starting ? 'var(--muted)' : split.color }}>
                      {split.name}
                    </span>
                    <span style={{ color: split.color, fontSize: 22, opacity: 0.5 }}>→</span>
                  </div>
                  {split.subtitle && <span style={S.typeBtnSub}>{split.subtitle}</span>}
                </button>
              ))}
            </div>
          )}

          {lastInfo && <p style={S.lastInfo}>{lastInfo}</p>}
          {starting && <p style={{ ...S.lastInfo, color: 'var(--muted2)' }}>Starting…</p>}
        </div>

        <style>{`
          .type-btn {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 18px 22px;
            cursor: pointer;
            text-align: left;
            transition: border-color 0.15s, transform 0.1s;
            -webkit-tap-highlight-color: transparent;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .type-btn:active { transform: scale(0.98); }
          .type-btn:hover  { border-color: var(--accent); }
        `}</style>
      </div>
    )
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  const accent = w.split?.color || 'var(--pull)'
  const div = w.currentDiv
  const currentExercise = w.chosen[div]
  const currentDivData = w.divisions[div]
  const currentLogged = w.sets[div] || []
  const prev = currentExercise ? w.prev[currentExercise.id] : null
  const notes = currentExercise ? (w.notes[currentExercise.id] || []) : []
  const totalDivs = w.divisions.length || 5
  const isLastDiv = div === totalDivs - 1
  const input = w.inputs[div] || { reps: 8, weight: 135 }

  const doLogSet = async () => {
    if (logging) return
    setLogging(true)
    const ok = await w.logSet(div, input.reps, input.weight)
    setLogging(false)
    if (ok) timer.autoStart()   // item 2: the timer starts itself
  }

  return (
    <div style={S.activePage} className="fade-in">
      <div style={S.topBar}>
        <div>
          <span style={{ ...S.sessionTag, color: accent }}>{w.split?.name}</span>
          <span style={S.elapsedBadge}>{fmtClock(elapsed)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" style={S.finishBtn} onClick={requestFinish}>End</button>
      </div>

      {/* Division nodes — every division is reachable, and "done" now means
          "has logged sets" rather than "is behind the cursor". Stepping back
          to review div 2 no longer greys out the work in div 3 and 4. */}
      <div style={S.divRow}>
        {Array.from({ length: totalDivs }).map((_, i) => {
          const setCount = (w.sets[i] || []).length
          const done = setCount > 0
          const isActive = i === div
          const touched = !!w.chosen[i]
          return (
            <button
              key={i}
              onClick={() => w.setCurrentDiv(i)}
              style={{
                ...S.divNode,
                background: done ? accent : 'var(--surface2)',
                border: `2px solid ${done || isActive ? accent : touched ? 'var(--muted)' : 'var(--border)'}`,
                transform: isActive ? 'scale(1.12)' : 'none',
                cursor: 'pointer',
              }}
              aria-label={`Division ${i + 1}${done ? `, ${setCount} sets logged` : ''}`}
            >
              {done
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
                : <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: isActive ? accent : 'var(--muted)' }}>{i + 1}</span>}
            </button>
          )
        })}
        <span style={S.divLabel}>
          {currentDivData?.label || `Div ${div + 1}`}
          {currentLogged.length > 0 && ` · ${currentLogged.length} set${currentLogged.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <div style={S.content}>
        {!currentExercise ? (
          <div className="card fade-up">
            <p className="section-label" style={{ marginBottom: 10 }}>
              Division {div + 1} — choose exercise
            </p>
            {currentDivData?.exercises?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentDivData.exercises.map(ex => (
                  <button key={ex.id} onClick={() => w.chooseExercise(div, ex)} style={S.exChoice}>
                    <span style={S.exChoiceName}>{ex.name}</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, gap: 8 }}>
                      <span style={S.exChoiceNote}>
                        {ex.coaching_notes
                          ? (ex.coaching_notes.length > 55 ? ex.coaching_notes.slice(0, 55) + '…' : ex.coaching_notes)
                          : ''}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                        {ex.default_sets}×{ex.default_reps}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <h3>No exercises assigned</h3>
                <p>Go to Settings and assign exercises to Division {div + 1} ({w.split?.name}).</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="card fade-up" style={{ borderColor: `${accent}40` }}>
              <div style={S.exHeader}>
                <div style={{ flex: 1 }}>
                  <h2 style={S.exName}>{currentExercise.name}</h2>
                  {/* item 14: the target no longer lives only on the division list */}
                  <p style={S.exTarget}>
                    TARGET {currentExercise.default_sets} × {currentExercise.default_reps}
                    <span style={{ color: 'var(--muted)' }}>
                      {'  ·  '}{currentLogged.length} logged
                    </span>
                  </p>
                </div>
                <button onClick={() => w.changeExercise(div)} style={S.changeBtn}>change</button>
              </div>

              <Collapse label="Form notes">
                <div style={S.coachNote}>
                  {currentExercise.coaching_notes || (
                    <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                      No notes — add them in Exercise Library.
                    </span>
                  )}
                </div>
              </Collapse>

              {/* Keyed by exercise so an unsaved draft never follows you to
                  the next exercise. */}
              <NotesSection
                key={currentExercise.id}
                exercise={currentExercise}
                notes={notes}
                onSave={body => w.saveNote(currentExercise.id, body)}
                onDelete={id => w.deleteNote(currentExercise.id, id)}
              />
            </div>

            {prev?.sets?.length > 0 && (
              <div style={S.lastStrip} className="fade-up">
                <span style={S.lastLabel}>
                  LAST · {format(new Date(prev.date), 'MMM d')}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {prev.sets.map((s, i) => (
                    <span key={i} style={S.lastChip}>{s.reps} × {s.weight_lbs}</span>
                  ))}
                </div>
              </div>
            )}

            {currentLogged.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {currentLogged.map(s => (
                  <div key={s.id} style={{ ...S.setChip, opacity: s.optimistic ? 0.55 : 1 }}>
                    <span style={S.setNum}>S{s.set_number}</span>
                    <span style={S.setData}>{s.reps} reps</span>
                    <span style={S.setWeight}>{s.weight_lbs} lbs</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--legs)" strokeWidth="2.5">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    <button style={S.deleteBtn} onClick={() => w.deleteSet(div, s.id)} aria-label="Delete set">×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="card fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={S.inputRow}>
                <div style={S.inputGroup}>
                  <span className="section-label" style={{ marginBottom: 8 }}>Reps</span>
                  <Stepper
                    value={input.reps}
                    onChange={v => w.setInput(div, { reps: v })}
                    step={1} min={1} max={100}
                  />
                </div>
                <div style={S.inputGroup}>
                  <span className="section-label" style={{ marginBottom: 8 }}>Weight (lbs)</span>
                  <Stepper
                    value={input.weight}
                    onChange={v => w.setInput(div, { weight: v })}
                    step={5} min={0} max={1200}
                    valueStyle={{ minWidth: 62, fontSize: 15 }}
                  />
                </div>
              </div>

              <p style={S.gestureHint}>Hold ± to jump fast · drag the number to scrub</p>

              <button
                className="btn btn-full"
                style={{ background: logging ? 'var(--surface3)' : accent, color: '#fff', fontSize: 16, fontWeight: 700 }}
                onClick={doLogSet}
                disabled={logging}
              >
                {logging ? 'Saving…' : `+ Log Set ${currentLogged.length + 1}`}
              </button>
            </div>

            <div style={S.divNav}>
              {div > 0 && (
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => w.setCurrentDiv(div - 1)}>
                  ← Back
                </button>
              )}
              {!isLastDiv ? (
                <button className="btn" style={{ flex: 2, background: accent, color: '#fff' }} onClick={() => w.setCurrentDiv(div + 1)}>
                  Next Division →
                </button>
              ) : (
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={requestFinish}>
                  Complete Session ✓
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showFinishConfirm && (
        <div className="sheet-overlay" onClick={() => setShowFinishConfirm(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 24, letterSpacing: '0.04em', textAlign: 'center' }}>
                End Session?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center' }}>
                You've logged {w.totalSetsLogged} set{w.totalSetsLogged !== 1 ? 's' : ''} so far.
                Finishing will save your session.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowFinishConfirm(false)}>
                  Keep Going
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => { setShowFinishConfirm(false); w.finishSession() }}
                >
                  Finish ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ value, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500 }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

function Collapse({ label, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button style={S.notesToggle} onClick={() => setOpen(o => !o)}>
        <span style={{ width: 12 }}>{open ? '▲' : '▼'}</span>
        {label}
        {badge != null && <span style={S.badge}>{badge}</span>}
      </button>
      {open && <div className="fade-up">{children}</div>}
    </>
  )
}

// item 6: your own note log per exercise — most recent surfaced first, older
// ones behind a toggle. Separate from the library's static coaching cues.
function NotesSection({ exercise, notes, onSave, onDelete }) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showOlder, setShowOlder] = useState(false)

  const latest = notes[0]
  const older = notes.slice(1)

  const save = async () => {
    if (!draft.trim() || saving) return
    setSaving(true)
    const ok = await onSave(draft)
    setSaving(false)
    if (ok) setDraft('')
  }

  return (
    // Notes arrive after the first render, so re-key once they land to let the
    // section open itself — that is the whole point of "see it next time".
    <Collapse
      key={notes.length > 0 ? 'has-notes' : 'no-notes'}
      label="My notes"
      badge={notes.length || null}
      defaultOpen={!!latest}
    >
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {latest ? (
          <div className="note-card">
            <span className="note-meta">
              {format(new Date(latest.created_at), 'MMM d, yyyy').toUpperCase()}
            </span>
            {latest.body}
            <button style={S.noteDelete} onClick={() => onDelete(latest.id)} aria-label="Delete note">×</button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
            No notes yet for {exercise.name}.
          </p>
        )}

        {older.length > 0 && (
          <>
            <button style={S.olderToggle} onClick={() => setShowOlder(o => !o)}>
              {showOlder ? 'Hide' : `Show ${older.length} older note${older.length > 1 ? 's' : ''}`}
            </button>
            {showOlder && older.map(n => (
              <div key={n.id} className="note-card" style={{ borderLeftColor: 'var(--border)', opacity: 0.8 }}>
                <span className="note-meta">
                  {format(new Date(n.created_at), 'MMM d, yyyy').toUpperCase()}
                </span>
                {n.body}
                <button style={S.noteDelete} onClick={() => onDelete(n.id)} aria-label="Delete note">×</button>
              </div>
            ))}
          </>
        )}

        <textarea
          className="input"
          placeholder="How did it feel? Cues, tweaks, pain, setup…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          style={{ minHeight: 64, fontSize: 14 }}
        />
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: 'flex-start', opacity: draft.trim() ? 1 : 0.4 }}
          onClick={save}
          disabled={!draft.trim() || saving}
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </Collapse>
  )
}

const S = {
  centeredPage: { minHeight: 'calc(100dvh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' },
  centeredInner: { width: '100%', display: 'flex', flexDirection: 'column', gap: 24 },
  eyebrow: { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', color: 'var(--muted)', marginBottom: 8 },
  heading: { fontFamily: 'var(--font-head)', fontSize: 54, lineHeight: 1.0, letterSpacing: '0.01em', color: 'var(--text)' },
  typeBtnLabel: { fontFamily: 'var(--font-head)', fontSize: 34, letterSpacing: '0.06em' },
  typeBtnSub: { fontSize: 12, color: 'var(--muted)', fontWeight: 400 },
  lastInfo: { fontSize: 12, color: 'var(--muted)', textAlign: 'center' },

  summaryStats: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 16px' },
  summaryLifts: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' },
  summaryLift: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)' },

  activePage: { display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 64px)' },
  topBar: { display: 'flex', alignItems: 'center', padding: '20px 16px 10px', gap: 10 },
  sessionTag: { fontFamily: 'var(--font-head)', fontSize: 26, letterSpacing: '0.06em', display: 'block', lineHeight: 1 },
  elapsedBadge: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 },
  finishBtn: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' },
  divRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 10px' },
  divNode: { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)', flexShrink: 0, WebkitTapHighlightColor: 'transparent' },
  divLabel: { flex: 1, textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.04em' },
  content: { padding: '0 16px 120px', display: 'flex', flexDirection: 'column', gap: 10 },

  exChoice: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', width: '100%', WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.1s' },
  exChoiceName: { fontWeight: 600, fontSize: 15, color: 'var(--text)' },
  exChoiceNote: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, flex: 1 },
  exHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  exName: { fontFamily: 'var(--font-head)', fontSize: 30, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1.05 },
  exTarget: { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--muted2)', marginTop: 4 },
  changeBtn: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent' },
  notesToggle: { background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, WebkitTapHighlightColor: 'transparent' },
  badge: { fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--surface3)', color: 'var(--muted2)', borderRadius: 999, padding: '1px 7px', marginLeft: 6 },
  coachNote: { marginTop: 6, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13, color: 'var(--muted2)', lineHeight: 1.55, borderLeft: '3px solid var(--border)' },
  noteDelete: { float: 'right', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 15, cursor: 'pointer', lineHeight: 1, marginLeft: 8 },
  olderToggle: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: '2px 0' },

  lastStrip: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  lastLabel: { fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.12em', whiteSpace: 'nowrap' },
  lastChip: { fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--muted2)', background: 'var(--surface2)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)' },
  setChip: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, transition: 'opacity 0.2s' },
  setNum: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', minWidth: 20 },
  setData: { flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text)' },
  setWeight: { fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--muted2)' },
  deleteBtn: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1, WebkitTapHighlightColor: 'transparent' },
  inputRow: { display: 'flex', gap: 12 },
  inputGroup: { flex: 1, display: 'flex', flexDirection: 'column' },
  gestureHint: { fontSize: 10, color: 'var(--muted)', textAlign: 'center', letterSpacing: '0.04em', marginTop: -4 },
  divNav: { display: 'flex', gap: 10, marginTop: 4 },
}
