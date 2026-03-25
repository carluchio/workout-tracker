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

  // Edit state
  const [editingSelected, setEditingSelected] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null) // exercise id

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
    setEditingSelected(false)
    setEditDraft(null)
    await fetchHistory(ex)
  }

  const fetchHistory = async (ex) => {
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

  const startEditSelected = () => {
    setEditDraft({ ...selected })
    setEditingSelected(true)
  }

  const saveEditSelected = async () => {
    if (!editDraft) return
    setSavingEdit(true)
    const { data, error } = await supabase
      .from('exercises')
      .update({
        name: editDraft.name,
        muscle_group: editDraft.muscle_group,
        coaching_notes: editDraft.coaching_notes,
        default_sets: editDraft.default_sets,
        default_reps: editDraft.default_reps,
      })
      .eq('id', editDraft.id)
      .select()
      .single()

    if (!error && data) {
      setSelected(data)
      setExercises(prev => prev.map(e => e.id === data.id ? data : e))
      setEditingSelected(false)
      setEditDraft(null)
    }
    setSavingEdit(false)
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

  const doDelete = async () => {
    const id = deleteConfirm
    setDeleteConfirm(null)
    // Archive instead of hard-delete to preserve history data
    setExercises(prev => prev.filter(e => e.id !== id)) // optimistic
    if (selected?.id === id) setSelected(null)
    const { error } = await supabase
      .from('exercises')
      .update({ is_archived: true })
      .eq('id', id)
    if (error) loadExercises() // rollback
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

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>EXERCISE LIBRARY</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(true)}>+ Add</button>
      </div>

      <input
        className="input"
        placeholder="Search exercises…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
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
                    onDelete={() => setDeleteConfirm(ex.id)}
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

      {/* ── Exercise detail sheet ──────────────────────────────────────────── */}
      {selected && (
        <div style={styles.overlay} onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div style={styles.sheet} className="fade-up">
            <div style={styles.sheetHandle} />

            {editingSelected && editDraft ? (
              /* ── Edit mode ── */
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={styles.sheetTitle}>Edit Exercise</h2>
                  <button style={styles.closeBtn} onClick={() => { setEditingSelected(false); setEditDraft(null) }}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <p className="section-label" style={{ marginBottom: 6 }}>Name</p>
                    <input
                      className="input"
                      value={editDraft.name}
                      onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    />
                  </div>

                  <div>
                    <p className="section-label" style={{ marginBottom: 6 }}>Muscle Group</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {GROUPS.map(g => (
                        <button
                          key={g}
                          onClick={() => setEditDraft(d => ({ ...d, muscle_group: g }))}
                          style={{
                            ...styles.groupChip,
                            background: editDraft.muscle_group === g ? 'var(--text)' : 'var(--surface2)',
                            color: editDraft.muscle_group === g ? 'var(--bg)' : 'var(--muted2)',
                          }}
                        >{g}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="section-label" style={{ marginBottom: 6 }}>Coaching Notes</p>
                    <textarea
                      className="input"
                      value={editDraft.coaching_notes || ''}
                      onChange={e => setEditDraft(d => ({ ...d, coaching_notes: e.target.value }))}
                      style={{ minHeight: 72, resize: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p className="section-label" style={{ marginBottom: 6 }}>Default Sets</p>
                      <div className="stepper">
                        <button className="stepper-btn" onClick={() => setEditDraft(d => ({ ...d, default_sets: Math.max(1, d.default_sets - 1) }))}>−</button>
                        <span className="stepper-value">{editDraft.default_sets}</span>
                        <button className="stepper-btn" onClick={() => setEditDraft(d => ({ ...d, default_sets: d.default_sets + 1 }))}>+</button>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="section-label" style={{ marginBottom: 6 }}>Default Reps</p>
                      <input
                        className="input"
                        value={editDraft.default_reps || ''}
                        onChange={e => setEditDraft(d => ({ ...d, default_reps: e.target.value }))}
                        style={{ height: 44 }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setEditingSelected(false); setEditDraft(null) }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveEditSelected} disabled={savingEdit}>
                    {savingEdit ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </>
            ) : (
              /* ── View mode ── */
              <>
                <div style={styles.sheetHeader}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {selected.muscle_group}
                    </span>
                    <h2 style={styles.sheetTitle}>{selected.name}</h2>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={styles.editBtn} onClick={startEditSelected}>Edit</button>
                    <button style={styles.closeBtn} onClick={() => setSelected(null)}>✕</button>
                  </div>
                </div>

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

                {selected.coaching_notes ? (
                  <div style={styles.coachNote}>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</p>
                    <p style={{ fontSize: 13, color: 'var(--muted2)', lineHeight: 1.5 }}>{selected.coaching_notes}</p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    No coaching notes — tap Edit to add some.
                  </p>
                )}

                {/* Defaults row */}
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Default Sets</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text)' }}>{selected.default_sets}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Default Reps</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text)' }}>{selected.default_reps || '—'}</p>
                  </div>
                </div>

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
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add exercise sheet ─────────────────────────────────────────────── */}
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
                    >{g}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Coaching Notes</p>
                <textarea
                  className="input"
                  placeholder="Form cues, setup notes…"
                  value={newEx.coaching_notes}
                  onChange={e => setNewEx(p => ({ ...p, coaching_notes: e.target.value }))}
                  style={{ minHeight: 72, resize: 'none' }}
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

      {/* ── Delete confirm overlay ─────────────────────────────────────────── */}
      {deleteConfirm && (
        <div style={styles.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={{ ...styles.sheet, maxHeight: 'auto', gap: 16 }} className="fade-up" onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 22, letterSpacing: '0.04em' }}>Remove Exercise?</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              This will hide the exercise from your library. Your historical sets will still be preserved.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
                onClick={doDelete}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseRow({ exercise, onClick, onDelete }) {
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
    <div style={styles.exRowWrap}>
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
      <button
        style={styles.deleteRowBtn}
        onClick={e => { e.stopPropagation(); onDelete() }}
        aria-label="Delete exercise"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </div>
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
    fontSize: 36,
    letterSpacing: '0.04em',
    lineHeight: 1.1,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  exRowWrap: {
    display: 'flex',
    alignItems: 'stretch',
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
    flex: 1,
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.1s',
  },
  deleteRowBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--muted)',
    cursor: 'pointer',
    flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
    transition: 'color 0.1s, border-color 0.1s',
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
    gap: 12,
  },
  sheetTitle: {
    fontFamily: 'var(--font-head)',
    fontSize: 28,
    letterSpacing: '0.04em',
    color: 'var(--text)',
    lineHeight: 1.1,
  },
  editBtn: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 12px',
    color: 'var(--muted2)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    WebkitTapHighlightColor: 'transparent',
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
