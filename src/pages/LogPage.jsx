import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import RestTimer from '../components/RestTimer.jsx'
import { formatDistanceToNow } from 'date-fns'

const SESSION_TYPES = ['Pull', 'Push', 'Legs']
const TYPE_COLOR = { Pull: 'var(--pull)', Push: 'var(--push)', Legs: 'var(--legs)' }
const TYPE_BG    = { Pull: 'pull-bg', Push: 'push-bg', Legs: 'legs-bg' }

export default function LogPage() {
  const [phase, setPhase]                     = useState('select')
  const [sessionType, setSessionType]         = useState(null)
  const [sessionId, setSessionId]             = useState(null)
  const [lastSession, setLastSession]         = useState(null)
  const [divisions, setDivisions]             = useState([])
  const [currentDiv, setCurrentDiv]           = useState(0)
  const [chosenExercises, setChosenExercises] = useState({})
  const [seIds, setSeIds]                     = useState({})
  const [loggedSets, setLoggedSets]           = useState({})
  const [reps, setReps]                       = useState(8)
  const [weight, setWeight]                   = useState(135)
  const [elapsed, setElapsed]                 = useState(0)
  const [notesOpen, setNotesOpen]             = useState(false)
  const [lastSessionData, setLastSessionData] = useState({})
  const [loggingSet, setLoggingSet]           = useState(false)
  const [starting, setStarting]               = useState(false)
  const startTime = useRef(null)
  const timerRef  = useRef(null)

  useEffect(() => {
    const stored = localStorage.getItem('last_session')
    if (stored) { try { setLastSession(JSON.parse(stored)) } catch {} }
  }, [])

  useEffect(() => {
    if (phase === 'active') {
      startTime.current = Date.now()
      timerRef.current = setInterval(() =>
        setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [phase])

  // Reset notes when switching divisions
  useEffect(() => { setNotesOpen(false) }, [currentDiv])

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const startSession = async (type) => {
    setStarting(true)
    const { data: sess, error } = await supabase
      .from('sessions').insert({ session_type: type }).select().single()
    if (error) { setStarting(false); return }

    setSessionId(sess.id)
    setSessionType(type)

    const { data: divs } = await supabase
      .from('divisions').select('*')
      .eq('session_type', type).order('division_number')

    if (divs?.length) {
      const enriched = await Promise.all(divs.map(async (div) => {
        if (!div.exercise_ids?.length) return { ...div, exercises: [] }
        const { data: exs } = await supabase
          .from('exercises').select('*')
          .in('id', div.exercise_ids).eq('is_archived', false)
        return { ...div, exercises: exs || [] }
      }))
      setDivisions(enriched)
    } else {
      setDivisions([])
    }

    localStorage.setItem('last_session', JSON.stringify({ type, date: new Date().toISOString() }))
    setChosenExercises({}); setSeIds({}); setLoggedSets({})
    setCurrentDiv(0); setElapsed(0); setPhase('active'); setStarting(false)
  }

  const chooseExercise = async (divIndex, exercise) => {
    setChosenExercises(prev => ({ ...prev, [divIndex]: exercise }))

    const { data: se } = await supabase
      .from('session_exercises')
      .insert({ session_id: sessionId, exercise_id: exercise.id,
                division_number: divIndex + 1, order_index: divIndex })
      .select().single()
    if (se) setSeIds(prev => ({ ...prev, [divIndex]: se.id }))

    // Correct query: get most recent session_exercise for this exercise, then its sets
    const { data: seRows } = await supabase
      .from('session_exercises')
      .select('id, sessions(started_at)')
      .eq('exercise_id', exercise.id)
      .neq('id', se?.id || 'none')           // exclude current session
      .order('id', { ascending: false })      // latest first (proxy for date)
      .limit(10)

    if (seRows?.length) {
      // Sort by session date and grab most recent
      const sorted = seRows
        .filter(r => r.sessions?.started_at)
        .sort((a, b) => new Date(b.sessions.started_at) - new Date(a.sessions.started_at))

      if (sorted.length) {
        const { data: prevSets } = await supabase
          .from('sets')
          .select('set_number, reps, weight_lbs')
          .eq('session_exercise_id', sorted[0].id)
          .order('set_number')

        if (prevSets?.length) {
          setLastSessionData(prev => ({ ...prev, [exercise.id]: prevSets }))
          const top = prevSets.reduce((a, b) => b.weight_lbs > a.weight_lbs ? b : a, prevSets[0])
          setWeight(Number(top.weight_lbs))
          setReps(Number(top.reps))
          return
        }
      }
    }

    // No history — fall back to exercise defaults
    setReps(exercise.default_reps?.includes('-')
      ? parseInt(exercise.default_reps) || 8 : 8)
    setWeight(135)
  }

  const logSet = async (divIndex) => {
    const seId = seIds[divIndex]
    if (!seId || loggingSet) return
    setLoggingSet(true)

    const existing = loggedSets[divIndex] || []
    const setNum   = existing.length + 1
    const tempId   = `opt-${Date.now()}`

    // Optimistic UI
    setLoggedSets(prev => ({
      ...prev,
      [divIndex]: [...existing, { id: tempId, set_number: setNum, reps, weight_lbs: weight, optimistic: true }],
    }))

    const { data: saved, error } = await supabase
      .from('sets')
      .insert({ session_exercise_id: seId, set_number: setNum, reps, weight_lbs: weight })
      .select().single()

    setLoggedSets(prev => ({
      ...prev,
      [divIndex]: (prev[divIndex] || []).map(s =>
        s.id === tempId ? (saved || { ...s, optimistic: false, id: `fallback-${setNum}` }) : s
      ),
    }))
    if (error) console.error('Set error:', error)
    setLoggingSet(false)
  }

  const deleteSet = async (divIndex, setId, isOptimistic) => {
    setLoggedSets(prev => ({
      ...prev,
      [divIndex]: (prev[divIndex] || [])
        .filter(s => s.id !== setId)
        .map((s, i) => ({ ...s, set_number: i + 1 })),
    }))
    if (!isOptimistic && !String(setId).startsWith('opt-') && !String(setId).startsWith('fallback-')) {
      await supabase.from('sets').delete().eq('id', setId)
    }
  }

  const finishSession = async () => {
    clearInterval(timerRef.current)
    if (sessionId) {
      await supabase.from('sessions')
        .update({ finished_at: new Date().toISOString() }).eq('id', sessionId)
    }
    setPhase('select'); setSessionType(null); setSessionId(null)
    setDivisions([]); setChosenExercises({}); setSeIds({})
    setLoggedSets({}); setLastSessionData({})
    setCurrentDiv(0); setElapsed(0); setReps(8); setWeight(135)
  }

  // ── SELECT ─────────────────────────────────────────────────────────────────
  if (phase === 'select') {
    const lastInfo = lastSession
      ? `Last: ${lastSession.type} · ${formatDistanceToNow(new Date(lastSession.date), { addSuffix: true })}`
      : null

    return (
      <div style={S.selectPage} className="fade-in">
        <div style={S.selectInner}>
          <div>
            <p style={S.selectEyebrow}>LIFT</p>
            <h1 style={S.selectHeading}>WHAT ARE WE<br />DOING TODAY?</h1>
          </div>

          <div style={S.typeButtons}>
            {SESSION_TYPES.map(type => (
              <button
                key={type}
                onClick={() => !starting && startSession(type)}
                style={{ ...S.typeBtn, '--accent': TYPE_COLOR[type], opacity: starting ? 0.5 : 1 }}
                className="type-btn"
                disabled={starting}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ ...S.typeBtnLabel, color: starting ? 'var(--muted)' : TYPE_COLOR[type] }}>
                    {type}
                  </span>
                  <span style={{ color: TYPE_COLOR[type], fontSize: 22, opacity: 0.5 }}>→</span>
                </div>
                <span style={S.typeBtnSub}>{typeSubtitle(type)}</span>
              </button>
            ))}
          </div>

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
          }
          .type-btn:active { transform: scale(0.98); }
          .type-btn:hover  { border-color: var(--accent); }
        `}</style>
      </div>
    )
  }

  // ── ACTIVE SESSION ─────────────────────────────────────────────────────────
  const accent         = TYPE_COLOR[sessionType]
  const currentExercise = chosenExercises[currentDiv]
  const currentDivData  = divisions[currentDiv]
  const currentLogged   = loggedSets[currentDiv] || []
  const prevData        = currentExercise ? lastSessionData[currentExercise.id] : null
  const totalDivs       = divisions.length || 5
  const isLastDiv       = currentDiv === totalDivs - 1

  return (
    <div style={S.activePage} className="fade-in">

      {/* Top bar */}
      <div style={S.topBar}>
        <div>
          <span style={{ ...S.sessionTag, color: accent }}>{sessionType}</span>
          <span style={S.elapsedBadge}>{fmt(elapsed)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" style={S.finishBtn} onClick={finishSession}>
          End
        </button>
      </div>

      {/* Division nodes */}
      <div style={S.divRow}>
        {Array.from({ length: totalDivs }).map((_, i) => {
          const done   = i < currentDiv
          const active = i === currentDiv
          return (
            <button
              key={i}
              onClick={() => done && setCurrentDiv(i)}
              style={{
                ...S.divNode,
                background: done ? accent : active ? 'transparent' : 'var(--surface2)',
                border: `2px solid ${(done || active) ? accent : 'var(--border)'}`,
                cursor: done ? 'pointer' : 'default',
              }}
            >
              {done
                ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><path d="M5 13l4 4L19 7"/></svg>
                : <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: active ? accent : 'var(--muted)' }}>{i + 1}</span>
              }
            </button>
          )
        })}
        <span style={S.divLabel}>{currentDivData?.label || `Div ${currentDiv + 1}`}</span>
      </div>

      <div style={S.content}>

        {/* Exercise chooser */}
        {!currentExercise ? (
          <div className="card fade-up">
            <p className="section-label" style={{ marginBottom: 10 }}>
              Division {currentDiv + 1} — choose exercise
            </p>
            {currentDivData?.exercises?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {currentDivData.exercises.map(ex => (
                  <button key={ex.id} onClick={() => chooseExercise(currentDiv, ex)}
                    style={S.exChoice}>
                    <span style={S.exChoiceName}>{ex.name}</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      {ex.coaching_notes
                        ? <span style={S.exChoiceNote}>{ex.coaching_notes.length > 55 ? ex.coaching_notes.slice(0,55)+'…' : ex.coaching_notes}</span>
                        : <span />}
                      <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                        {ex.default_sets}×{ex.default_reps}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <h3>No exercises assigned</h3>
                <p>Go to Settings and assign exercises to Division {currentDiv + 1} ({sessionType}).</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Exercise card */}
            <div className="card fade-up" style={{ borderColor: `${accent}40` }}>
              <div style={S.exHeader}>
                <h2 style={S.exName}>{currentExercise.name}</h2>
                <button
                  onClick={() => {
                    setChosenExercises(p => { const n={...p}; delete n[currentDiv]; return n })
                    setLoggedSets(p => { const n={...p}; delete n[currentDiv]; return n })
                  }}
                  style={S.changeBtn}
                >change</button>
              </div>
              <button style={S.notesToggle} onClick={() => setNotesOpen(o => !o)}>
                <span>{notesOpen ? '▲' : '▼'}</span>&nbsp;Form notes
              </button>
              {notesOpen && (
                <div style={S.coachNote} className="fade-up">
                  {currentExercise.coaching_notes ||
                    <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No notes — add them in Library.</span>}
                </div>
              )}
            </div>

            {/* Last session ghost */}
            {prevData?.length > 0 && (
              <div style={S.lastStrip} className="fade-up">
                <span style={S.lastLabel}>LAST SESSION</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {prevData.map((s, i) => (
                    <span key={i} style={S.lastChip}>{s.reps} × {s.weight_lbs}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Logged sets */}
            {currentLogged.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {currentLogged.map(s => (
                  <div key={s.id} style={{ ...S.setChip, opacity: s.optimistic ? 0.55 : 1 }}>
                    <span style={S.setNum}>S{s.set_number}</span>
                    <span style={S.setData}>{s.reps} reps</span>
                    <span style={S.setWeight}>{s.weight_lbs} lbs</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--legs)" strokeWidth="2.5">
                      <path d="M5 13l4 4L19 7"/>
                    </svg>
                    <button style={S.deleteBtn}
                      onClick={() => deleteSet(currentDiv, s.id, s.optimistic)}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Inputs */}
            <div className="card fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={S.inputRow}>
                <div style={S.inputGroup}>
                  <span className="section-label" style={{ marginBottom: 8 }}>Reps</span>
                  <div className="stepper">
                    <button className="stepper-btn" onClick={() => setReps(r => Math.max(1, r - 1))}>−</button>
                    <span className="stepper-value">{reps}</span>
                    <button className="stepper-btn" onClick={() => setReps(r => r + 1)}>+</button>
                  </div>
                </div>
                <div style={S.inputGroup}>
                  <span className="section-label" style={{ marginBottom: 8 }}>Weight (lbs)</span>
                  <div className="stepper">
                    <button className="stepper-btn" onClick={() => setWeight(w => Math.max(0, w - 5))}>−</button>
                    <span className="stepper-value" style={{ minWidth: 58, fontSize: 14 }}>{weight}</span>
                    <button className="stepper-btn" onClick={() => setWeight(w => w + 5)}>+</button>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-full"
                style={{ background: loggingSet ? 'var(--surface3)' : accent, color: '#fff', fontSize: 16, fontWeight: 700 }}
                onClick={() => logSet(currentDiv)}
                disabled={loggingSet}
              >
                {loggingSet ? 'Saving…' : `+ Log Set ${currentLogged.length + 1}`}
              </button>
            </div>

            {/* Navigation */}
            <div style={S.divNav}>
              {currentDiv > 0 && (
                <button className="btn btn-ghost" style={{ flex: 1 }}
                  onClick={() => setCurrentDiv(d => d - 1)}>← Back</button>
              )}
              {!isLastDiv ? (
                <button className="btn" style={{ flex: 2, background: accent, color: '#fff' }}
                  onClick={() => setCurrentDiv(d => d + 1)}>Next Division →</button>
              ) : (
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={finishSession}>
                  Complete Session ✓
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <RestTimer />
    </div>
  )
}

function typeSubtitle(t) {
  return { Pull: 'Deadlifts · Rows · Lat work · Curls', Push: 'Bench · Shoulders · Triceps · Cables', Legs: 'Squats · Hip Thrust · Lunges · Calves' }[t] || ''
}

const S = {
  selectPage: { minHeight: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' },
  selectInner: { width: '100%', display: 'flex', flexDirection: 'column', gap: 28 },
  selectEyebrow: { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', color: 'var(--muted)', marginBottom: 8 },
  selectHeading: { fontFamily: 'var(--font-head)', fontSize: 54, lineHeight: 1.0, letterSpacing: '0.01em', color: 'var(--text)' },
  typeButtons: { display: 'flex', flexDirection: 'column', gap: 10 },
  typeBtn: { display: 'flex', flexDirection: 'column', gap: 4 },
  typeBtnLabel: { fontFamily: 'var(--font-head)', fontSize: 34, letterSpacing: '0.06em' },
  typeBtnSub: { fontSize: 12, color: 'var(--muted)', fontWeight: 400 },
  lastInfo: { fontSize: 12, color: 'var(--muted)', textAlign: 'center' },
  activePage: { display: 'flex', flexDirection: 'column', gap: 0, minHeight: 'calc(100vh - 64px)' },
  topBar: { display: 'flex', alignItems: 'center', padding: '20px 16px 10px', gap: 10 },
  sessionTag: { fontFamily: 'var(--font-head)', fontSize: 26, letterSpacing: '0.06em', display: 'block', lineHeight: 1 },
  elapsedBadge: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 },
  finishBtn: { background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' },
  divRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px 10px' },
  divNode: { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0, WebkitTapHighlightColor: 'transparent' },
  divLabel: { flex: 1, textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.04em' },
  content: { padding: '0 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 },
  exChoice: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', width: '100%', WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.1s' },
  exChoiceName: { fontWeight: 600, fontSize: 15, color: 'var(--text)' },
  exChoiceNote: { fontSize: 12, color: 'var(--muted)', lineHeight: 1.4, flex: 1, marginRight: 8 },
  exHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  exName: { fontFamily: 'var(--font-head)', fontSize: 30, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1.05, flex: 1 },
  changeBtn: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent' },
  notesToggle: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent' },
  coachNote: { marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13, color: 'var(--muted2)', lineHeight: 1.55, borderLeft: '3px solid var(--border)' },
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
  divNav: { display: 'flex', gap: 10, marginTop: 4 },
}
