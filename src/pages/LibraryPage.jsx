import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { format, formatDistanceToNow } from 'date-fns'

const GROUPS = ['Pull', 'Push', 'Legs', 'Core', 'Other']

export default function LibraryPage() {
  const [exercises, setExercises] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedHistory, setSelectedHistory] = useState([])
  const [selectedPR, setSelectedPR] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newEx, setNewEx] = useState({ name: '', muscle_group: 'Pull', coaching_notes: '', default_sets: 3, default_reps: '8-10' })

  useEffect(() => { loadExercises() }, [])

  const loadExercises = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .eq('is_archived', false)
      .order('name')
    setExercises(data || [])
    setLoading(false)
  }

  const openExercise = async (ex) => {
    setSelected(ex)
    const { data } = await supabase
      .from('sets')
      .select(`
        set_number, reps, weight_lbs, logged_at,
        session_exercises!inner(
          exercise_id,
          sessions!inner(started_at)
        )
      `)
      .eq('session_exercises.exercise_id', ex.id)
      .order('logged_at', { ascending: false })
      .limit(100)

    const history = data || []
    setSelectedHistory(history)

    const pr = history.reduce((best, s) =>
      (!best || s.weight_lbs > best.weight_lbs) ? s : best, null)
    setSelectedPR(pr)
  }

  const saveNewExercise = async () => {
    if (!newEx.name.trim()) return
    const { data } = await supabase
      .from('exercises')
      .insert(newEx)
      .select()
      .single()
    if (data) {
      setExercises(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setAddOpen(false)
      setNewEx({ name: '', muscle_group: 'Pull', coaching_notes: '', default_sets: 3, default_reps: '8-10' })
    }
  }

  const filtered = exercises.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.muscle_group?.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = GROUPS.reduce((acc, g) => {
    const items = filtered.filter(ex => ex.muscle_group === g)
    if (items.length) acc[g] = items
    return acc
  }, {})

  // Group history by session date
  const bySession = {}
  selectedHistory.forEach(s => {
    const date = s.session_exercises?.sessions?.started_at?.slice(0, 10) || 'unknown'
    if (!bySession[date]) bySession[date] = []
    bySession[date].push(s)
  })

  const lastSet = selectedHistory[0]
  const lastSetLabel = lastSet
    ? `${lastSet.reps} × ${lastSet.weight_lbs} lbs · ${formatDistanceToNow(new Date(lastSet.logged_at), { addSuffix: true })}`
    : null

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>LIBRARY</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(true)}>+ Add</button>
      </div>

      <input
        className="input"
        placeholder="Search exercises..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <p className="section-label">{group}</p>
              <div style={styles.list}>
                {items.map(ex => (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    onClick={() => openExercise(ex)}
                  />
                ))}
              </div>
            </div>
          ))}
          {!Object.keys(grouped).length && (
            <div className="empty-state">
              <h3>No exercises found</h3>
              <p>Add exercises to build your library.</p>
            </div>
          )}
        </div>
      )}

      {/* Exercise detail sheet */}
      {selected && (
        <div style={styles.overlay} onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div style={styles.sheet} className="fade-up">
            <div style={styles.sheetHandle} />

            <div style={styles.sheetHeader}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {selected.muscle_group}
                </span>
                <h2 style={styles.sheetTitle}>{selected.name}</h2>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* PR highlight */}
            {selectedPR && (
              <div style={styles.prBanner}>
                <div>
                  <p style={styles.prBannerLabel}>ALL-TIME BEST</p>
                  <p style={styles.prBannerVal} className="pr-glow">
                    {selectedPR.weight_lbs} lbs × {selectedPR.reps} reps
                  </p>
                  {selectedPR.logged_at && (
                    <p style={styles.prBannerDate}>
                      {format(new Date(selectedPR.logged_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 32 }}>🏆</span>
              </div>
            )}

            {/* Coaching notes */}
            {selected.coaching_notes && (
              <div style={styles.coachNote}>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Notes
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted2)', lineHeight: 1.5 }}>
                  {selected.coaching_notes}
                </p>
              </div>
            )}

            {/* History */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <p className="section-label" style={{ marginBottom: 10 }}>History</p>
              {Object.keys(bySession).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>No sets logged yet.</p>
              )}
              {Object.entries(bySession).map(([date, sets]) => {
                const isPRSession = sets.some(s => s.weight_lbs === selectedPR?.weight_lbs)
                return (
                  <div key={date} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, color: isPRSession ? 'var(--gold)' : 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                      {date !== 'unknown' ? format(new Date(date), 'EEE MMM d, yyyy') : '—'}
                      {isPRSession && ' ★ PR'}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {sets.map((s, i) => (
                        <span
                          key={i}
                          style={{
                            ...styles.histChip,
                            ...(s.weight_lbs === selectedPR?.weight_lbs ? styles.histChipPR : {}),
                          }}
                        >
                          {s.reps} × {s.weight_lbs}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add exercise sheet */}
      {addOpen && (
        <div style={styles.overlay} onClick={e => e.target === e.currentTarget && setAddOpen(false)}>
          <div style={{ ...styles.sheet, maxHeight: '85vh' }} className="fade-up">
            <div style={styles.sheetHandle} />
            <h2 style={styles.sheetTitle}>New Exercise</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Name</p>
                <input
                  className="input"
                  placeholder="e.g. Romanian Deadlift"
                  value={newEx.name}
                  onChange={e => setNewEx(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Muscle Group</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {GROUPS.map(g => (
                    <button
                      key={g}
                      onClick={() => setNewEx(p => ({ ...p, muscle_group: g }))}
                      style={{
                        ...styles.groupChip,
                        background: newEx.muscle_group === g ? 'var(--text)' : 'var(--surface2)',
                        color: newEx.muscle_group === g ? 'var(--bg)' : 'var(--muted2)',
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Coaching Notes</p>
                <textarea
                  className="input"
                  placeholder="Form cues, setup notes..."
                  value={newEx.coaching_notes}
                  onChange={e => setNewEx(p => ({ ...p, coaching_notes: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p className="section-label" style={{ marginBottom: 6 }}>Default Sets</p>
                  <div className="stepper">
                    <button className="stepper-btn" onClick={() => setNewEx(p => ({ ...p, default_sets: Math.max(1, p.default_sets - 1) }))}>−</button>
                    <span className="stepper-value">{newEx.default_sets}</span>
                    <button className="stepper-btn" onClick={() => setNewEx(p => ({ ...p, default_sets: p.default_sets + 1 }))}>+</button>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p className="section-label" style={{ marginBottom: 6 }}>Default Reps</p>
                  <input
                    className="input"
                    placeholder="8-10"
                    value={newEx.default_reps}
                    onChange={e => setNewEx(p => ({ ...p, default_reps: e.target.value }))}
                    style={{ height: 44 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveNewExercise}>
                Save Exercise
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseRow({ exercise, onClick }) {
  const [lastSet, setLastSet] = useState(null)

  useEffect(() => {
    supabase
      .from('sets')
      .select('reps, weight_lbs, logged_at, session_exercises!inner(exercise_id)')
      .eq('session_exercises.exercise_id', exercise.id)
      .order('logged_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => setLastSet(data))
  }, [exercise.id])

  return (
    <button style={styles.exRow} onClick={onClick}>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <p style={styles.exName}>{exercise.name}</p>
        {lastSet ? (
          <p style={styles.exLast}>
            Last: {lastSet.reps} × {lastSet.weight_lbs} lbs
            <span style={{ color: 'var(--muted)', marginLeft: 4 }}>
              · {formatDistanceToNow(new Date(lastSet.logged_at), { addSuffix: true })}
            </span>
          </p>
        ) : (
          <p style={styles.exLast}>No sets logged yet</p>
        )}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

const styles = {
  page: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    fontFamily: 'var(--font-head)',
    fontSize: 40,
    letterSpacing: '0.04em',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  exRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    cursor: 'pointer',
    gap: 12,
    width: '100%',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.1s',
  },
  exName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 2,
  },
  exLast: {
    fontSize: 11,
    color: 'var(--muted2)',
    fontFamily: 'var(--font-mono)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
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
    padding: '16px 20px 40px',
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    overflowY: 'auto',
    animation: 'slideUp 0.25s ease',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--border)',
    margin: '0 auto 4px',
    flexShrink: 0,
  },
  sheetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetTitle: {
    fontFamily: 'var(--font-head)',
    fontSize: 28,
    letterSpacing: '0.04em',
    color: 'var(--text)',
    lineHeight: 1.1,
  },
  closeBtn: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 10px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 14,
    WebkitTapHighlightColor: 'transparent',
  },
  prBanner: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(234,179,8,0.3)',
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prBannerLabel: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--gold)',
    letterSpacing: '0.12em',
    marginBottom: 4,
  },
  prBannerVal: {
    fontFamily: 'var(--font-mono)',
    fontSize: 20,
    fontWeight: 500,
  },
  prBannerDate: {
    fontSize: 11,
    color: 'var(--muted)',
    marginTop: 2,
  },
  coachNote: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    borderLeft: '3px solid var(--muted)',
  },
  histChip: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--muted2)',
    background: 'var(--surface2)',
    padding: '3px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
  },
  histChipPR: {
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(234,179,8,0.3)',
  },
  groupChip: {
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.1s',
    WebkitTapHighlightColor: 'transparent',
  },
}
