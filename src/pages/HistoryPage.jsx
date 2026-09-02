import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { format, formatDistanceToNow } from 'date-fns'
import { fetchSplits } from '../lib/config.js'

// Muscle groups on the PR board are still a fixed vocabulary (they come from
// the exercise library); split names are not, so they load from the DB.
const GROUP_COLOR = { Pull: 'var(--pull)', Push: 'var(--push)', Legs: 'var(--legs)' }

const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function HistoryPage() {
  const [tab, setTab] = useState('history')
  const [sessions, setSessions] = useState([])
  const [prs, setPrs] = useState([])
  const [prSearch, setPrSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [sessionDetail, setSessionDetail] = useState({})
  const [loading, setLoading] = useState(true)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Edit session
  const [editSession, setEditSession] = useState(null) // {id, session_type, started_at (local input), notes}

  // Add session
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    session_type: '',
    started_at: toLocalInput(new Date().toISOString()),
    notes: '',
    exercises: [], // [{exercise_id, exercise_name, sets: [{reps:'', weight_lbs:''}]}]
  })
  const [allExercises, setAllExercises] = useState([])
  const [splits, setSplits] = useState([])

  useEffect(() => {
    supabase.from('exercises').select('id, name, muscle_group')
      .eq('is_archived', false).order('name')
      .then(({ data }) => setAllExercises(data || []))
    fetchSplits().then(({ splits }) => {
      setSplits(splits)
      setAddForm(f => (f.session_type ? f : { ...f, session_type: splits[0]?.name || '' }))
    })
  }, [])

  // A session's split may since have been renamed, archived, or predate the
  // splits table entirely — always fall back rather than render a blank chip.
  const colorOf = (name) => splits.find(s => s.name === name)?.color || 'var(--muted2)'

  useEffect(() => {
    tab === 'history' ? loadHistory() : loadPRs()
  }, [tab])

  const loadHistory = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100)
    if (!error) setSessions(data || [])
    setLoading(false)
  }

  const loadPRs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('personal_records')
      .select('*')
      .order('pr_weight', { ascending: false })

    // The personal_records view emits one row per set matching the max weight,
    // so every time you repeat a PR it lists again. Collapse to one row per
    // exercise: best weight, then most reps at that weight, then the date it
    // was first hit.
    if (!error) {
      const best = new Map()
      ;(data || []).forEach(pr => {
        const key = pr.exercise_id ?? pr.exercise_name
        const held = best.get(key)
        if (
          !held ||
          Number(pr.pr_weight) > Number(held.pr_weight) ||
          (Number(pr.pr_weight) === Number(held.pr_weight) &&
            (Number(pr.pr_reps) > Number(held.pr_reps) ||
              (Number(pr.pr_reps) === Number(held.pr_reps) &&
                new Date(pr.achieved_at) < new Date(held.achieved_at))))
        ) best.set(key, pr)
      })
      setPrs([...best.values()].sort((a, b) => Number(b.pr_weight) - Number(a.pr_weight)))
    }
    setLoading(false)
  }

  const loadSessionDetail = async (sessionId) => {
    if (sessionDetail[sessionId]) {
      setExpanded(expanded === sessionId ? null : sessionId)
      return
    }
    const { data } = await supabase
      .from('session_exercises')
      .select(`
        id, division_number,
        exercises(name),
        sets(set_number, reps, weight_lbs)
      `)
      .eq('session_id', sessionId)
      .order('division_number')

    // Hide exercises with no sets. Older sessions can still contain rows left
    // behind by the previous "pick an exercise writes a row immediately"
    // behaviour — those are the phantom duplicates. migration-002.sql deletes
    // them for good; this keeps the display honest either way.
    setSessionDetail(prev => ({ ...prev, [sessionId]: (data || []).filter(se => se.sets?.length) }))
    setExpanded(sessionId)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmDelete = (id) => setDeleteConfirm(id)

  const doDelete = async () => {
    const id = deleteConfirm
    setDeleteConfirm(null)
    // Optimistic remove
    setSessions(prev => prev.filter(s => s.id !== id))
    setExpanded(e => e === id ? null : e)
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) loadHistory() // rollback on failure
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (sess) => {
    setEditSession({
      id: sess.id,
      session_type: sess.session_type,
      started_at: toLocalInput(sess.started_at),
      notes: sess.notes || '',
    })
  }

  const saveEdit = async () => {
    const iso = new Date(editSession.started_at).toISOString()
    const { error } = await supabase
      .from('sessions')
      .update({ session_type: editSession.session_type, started_at: iso, notes: editSession.notes })
      .eq('id', editSession.id)

    if (!error) {
      setSessions(prev => prev.map(s =>
        s.id === editSession.id
          ? { ...s, session_type: editSession.session_type, started_at: iso, notes: editSession.notes }
          : s
      ))
      setEditSession(null)
    }
  }

  // ── Add session ─────────────────────────────────────────────────────────────
  const addExercise = () => {
    setAddForm(f => ({
      ...f,
      exercises: [...f.exercises, { exercise_id: '', exercise_name: '', sets: [{ reps: '', weight_lbs: '' }] }],
    }))
  }

  const removeExercise = (idx) => {
    setAddForm(f => ({ ...f, exercises: f.exercises.filter((_, i) => i !== idx) }))
  }

  const updateExercise = (idx, exId) => {
    const ex = allExercises.find(e => e.id === exId)
    setAddForm(f => ({
      ...f,
      exercises: f.exercises.map((e, i) =>
        i === idx ? { ...e, exercise_id: exId, exercise_name: ex?.name || '' } : e
      ),
    }))
  }

  const addSet = (exIdx) => {
    setAddForm(f => ({
      ...f,
      exercises: f.exercises.map((e, i) =>
        i === exIdx ? { ...e, sets: [...e.sets, { reps: '', weight_lbs: '' }] } : e
      ),
    }))
  }

  const removeSet = (exIdx, setIdx) => {
    setAddForm(f => ({
      ...f,
      exercises: f.exercises.map((e, i) =>
        i === exIdx ? { ...e, sets: e.sets.filter((_, si) => si !== setIdx) } : e
      ),
    }))
  }

  const updateSet = (exIdx, setIdx, field, val) => {
    setAddForm(f => ({
      ...f,
      exercises: f.exercises.map((e, i) =>
        i === exIdx
          ? { ...e, sets: e.sets.map((s, si) => si === setIdx ? { ...s, [field]: val } : s) }
          : e
      ),
    }))
  }

  const saveAddSession = async () => {
    setAddSaving(true)
    const iso = new Date(addForm.started_at).toISOString()
    const { data: sess, error } = await supabase
      .from('sessions')
      .insert({ session_type: addForm.session_type, started_at: iso, finished_at: iso, notes: addForm.notes })
      .select()
      .single()

    if (!error && sess) {
      for (let ei = 0; ei < addForm.exercises.length; ei++) {
        const ex = addForm.exercises[ei]
        if (!ex.exercise_id) continue
        const { data: se } = await supabase
          .from('session_exercises')
          .insert({ session_id: sess.id, exercise_id: ex.exercise_id, division_number: ei + 1, order_index: ei })
          .select().single()
        if (se) {
          const validSets = ex.sets.filter(s => s.reps || s.weight_lbs)
          for (let si = 0; si < validSets.length; si++) {
            const s = validSets[si]
            await supabase.from('sets').insert({
              session_exercise_id: se.id,
              set_number: si + 1,
              reps: parseInt(s.reps) || 0,
              weight_lbs: parseFloat(s.weight_lbs) || 0,
            })
          }
        }
      }
      setAddOpen(false)
      setAddForm({ session_type: splits[0]?.name || '', started_at: toLocalInput(new Date().toISOString()), notes: '', exercises: [] })
      loadHistory()
    }
    setAddSaving(false)
  }

  const fmtDuration = (start, end) => {
    if (!end) return '—'
    const mins = Math.round((new Date(end) - new Date(start)) / 60000)
    return `${mins}m`
  }

  const prQuery = prSearch.trim().toLowerCase()
  const filteredPrs = prQuery
    ? prs.filter(p =>
        (p.exercise_name || '').toLowerCase().includes(prQuery) ||
        (p.muscle_group || '').toLowerCase().includes(prQuery))
    : prs

  // Derive groups from the data rather than a fixed list, so a PR filed under
  // an unexpected muscle group is never silently dropped from the board.
  const prGroups = [...new Set(filteredPrs.map(p => p.muscle_group || 'Other'))]
    .sort((a, b) => {
      const order = ['Pull', 'Push', 'Legs', 'Core', 'Other']
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
    })

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 style={styles.title}>HISTORY</h1>
        {tab === 'history' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(true)}>+ Add</button>
        )}
      </div>

      {/* Tab switcher */}
      <div style={styles.tabBar}>
        {['history', 'prs'].map(t => (
          <button
            key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t === 'history' ? 'Sessions' : 'PRs'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : tab === 'history' ? (
        <div style={styles.list}>
          {!sessions.length && (
            <div className="empty-state">
              <h3>No sessions yet</h3>
              <p>Complete your first workout or tap + Add to log a past session.</p>
            </div>
          )}
          {sessions.map(sess => (
            <div key={sess.id} className="card" style={styles.sessionCard}>
              <button style={styles.sessionRow} onClick={() => loadSessionDetail(sess.id)}>
                <div style={styles.sessionLeft}>
                  <span
                    className="pill"
                    style={{
                      background: `color-mix(in srgb, ${colorOf(sess.session_type)} 22%, transparent)`,
                      color: colorOf(sess.session_type),
                    }}
                  >
                    {sess.session_type}
                  </span>
                  <div>
                    <p style={styles.sessionDate}>{format(new Date(sess.started_at), 'EEE MMM d, yyyy')}</p>
                    <p style={styles.sessionMeta}>
                      {formatDistanceToNow(new Date(sess.started_at), { addSuffix: true })}
                      {sess.finished_at && ` · ${fmtDuration(sess.started_at, sess.finished_at)}`}
                    </p>
                  </div>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="var(--muted)" strokeWidth="2"
                  style={{ transform: expanded === sess.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {expanded === sess.id && sessionDetail[sess.id] && (
                <div style={styles.detail} className="fade-up">
                  <div className="divider" />
                  {sessionDetail[sess.id].map(se => (
                    <div key={se.id} style={styles.detailExercise}>
                      <p style={styles.detailExName}>{se.exercises?.name}</p>
                      <div style={styles.detailSets}>
                        {se.sets?.map(s => (
                          <span key={s.set_number} style={styles.detailSet}>
                            {s.reps}×{s.weight_lbs}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {sess.notes && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4 }}>
                      {sess.notes}
                    </p>
                  )}
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ flex: 1 }}
                      onClick={(e) => { e.stopPropagation(); openEdit(sess) }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={(e) => { e.stopPropagation(); confirmDelete(sess.id) }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.list}>
          {prs.length > 0 && (
            <input
              className="input"
              placeholder="Search PRs by exercise or muscle group…"
              value={prSearch}
              onChange={e => setPrSearch(e.target.value)}
              style={{ marginBottom: 4 }}
            />
          )}

          {!prs.length && (
            <div className="empty-state">
              <h3>No PRs recorded yet</h3>
              <p>Log sets to build your personal record board.</p>
            </div>
          )}

          {prs.length > 0 && !filteredPrs.length && (
            <div className="empty-state">
              <h3>No matches</h3>
              <p>Nothing in your PR board matches “{prSearch}”.</p>
            </div>
          )}

          {prGroups.map(group => {
            const groupPRs = filteredPrs.filter(p => (p.muscle_group || 'Other') === group)
            if (!groupPRs.length) return null
            return (
              <div key={group}>
                <p className="section-label" style={{ color: GROUP_COLOR[group] || 'var(--muted)', marginTop: 12 }}>
                  {group}
                </p>
                {groupPRs.map((pr, i) => (
                  <div key={i} style={styles.prCard} className="card">
                    <div>
                      <p style={styles.prName}>{pr.exercise_name}</p>
                      {pr.achieved_at && (
                        <p style={styles.prDate}>{format(new Date(pr.achieved_at), 'MMM d, yyyy')}</p>
                      )}
                    </div>
                    <div style={styles.prRight}>
                      <span style={styles.prWeight} className="pr-glow">{pr.pr_weight}</span>
                      <span style={styles.prUnit}>lbs</span>
                      <span style={styles.prX}> × </span>
                      <span style={styles.prReps}>{pr.pr_reps}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Delete confirm overlay ──────────────────────────────────────────── */}
      {deleteConfirm && (
        <div style={styles.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={styles.confirmSheet} className="fade-up" onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 22, letterSpacing: '0.04em' }}>Delete Session?</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              This will permanently delete all exercises and sets from this session. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--danger)', color: '#fff' }}
                onClick={doDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit session overlay ────────────────────────────────────────────── */}
      {editSession && (
        <div style={styles.overlay} onClick={() => setEditSession(null)}>
          <div style={{ ...styles.sheet, maxHeight: 'calc(100dvh - 40px)' }} className="fade-up" onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 26, letterSpacing: '0.04em' }}>Edit Session</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Session Type</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {splits.map(sp => (
                    <button
                      key={sp.id}
                      onClick={() => setEditSession(s => ({ ...s, session_type: sp.name }))}
                      style={{
                        flex: '1 1 auto', padding: '8px', borderRadius: 8, border: '1px solid',
                        borderColor: editSession.session_type === sp.name ? sp.color : 'var(--border)',
                        color: editSession.session_type === sp.name ? sp.color : 'var(--muted)',
                        background: editSession.session_type === sp.name
                          ? `color-mix(in srgb, ${sp.color} 10%, var(--surface2))`
                          : 'var(--surface2)',
                        cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      }}
                    >{sp.name}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Date & Time</p>
                <input
                  type="datetime-local"
                  className="input"
                  value={editSession.started_at}
                  onChange={e => setEditSession(s => ({ ...s, started_at: e.target.value }))}
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Notes</p>
                <textarea
                  className="input"
                  placeholder="Session notes..."
                  value={editSession.notes}
                  onChange={e => setEditSession(s => ({ ...s, notes: e.target.value }))}
                  style={{ minHeight: 72, resize: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditSession(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add session overlay ─────────────────────────────────────────────── */}
      {addOpen && (
        <div style={styles.overlay} onClick={() => setAddOpen(false)}>
          <div style={{ ...styles.sheet, maxHeight: 'calc(100dvh - 40px)' }} className="fade-up" onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 26, letterSpacing: '0.04em' }}>Add Past Session</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
              {/* Session type */}
              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Session Type</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {splits.map(sp => (
                    <button
                      key={sp.id}
                      onClick={() => setAddForm(f => ({ ...f, session_type: sp.name }))}
                      style={{
                        flex: '1 1 auto', padding: '8px', borderRadius: 8, border: '1px solid',
                        borderColor: addForm.session_type === sp.name ? sp.color : 'var(--border)',
                        color: addForm.session_type === sp.name ? sp.color : 'var(--muted)',
                        background: addForm.session_type === sp.name
                          ? `color-mix(in srgb, ${sp.color} 10%, var(--surface2))`
                          : 'var(--surface2)',
                        cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      }}
                    >{sp.name}</button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Date & Time</p>
                <input
                  type="datetime-local"
                  className="input"
                  value={addForm.started_at}
                  onChange={e => setAddForm(f => ({ ...f, started_at: e.target.value }))}
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              {/* Notes */}
              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Notes</p>
                <textarea
                  className="input"
                  placeholder="Optional notes..."
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ minHeight: 60, resize: 'none' }}
                />
              </div>

              {/* Exercises */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p className="section-label">Exercises</p>
                  <button className="btn btn-sm btn-ghost" onClick={addExercise}>+ Exercise</button>
                </div>

                {addForm.exercises.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    No exercises — tap + Exercise to add.
                  </p>
                )}

                {addForm.exercises.map((ex, ei) => (
                  <div key={ei} style={styles.addExCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <select
                        className="input"
                        value={ex.exercise_id}
                        onChange={e => updateExercise(ei, e.target.value)}
                        style={{ flex: 1, height: 36, fontSize: 13, paddingRight: 8, colorScheme: 'dark' }}
                      >
                        <option value="">Select exercise…</option>
                        {allExercises.map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                      <button
                        style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                        onClick={() => removeExercise(ei)}
                      >×</button>
                    </div>

                    {ex.sets.map((s, si) => (
                      <div key={si} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', minWidth: 16 }}>S{si+1}</span>
                        <input
                          className="input"
                          placeholder="Reps"
                          type="number"
                          value={s.reps}
                          onChange={e => updateSet(ei, si, 'reps', e.target.value)}
                          style={{ flex: 1, height: 34, fontSize: 13 }}
                        />
                        <input
                          className="input"
                          placeholder="lbs"
                          type="number"
                          value={s.weight_lbs}
                          onChange={e => updateSet(ei, si, 'weight_lbs', e.target.value)}
                          style={{ flex: 1, height: 34, fontSize: 13 }}
                        />
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                          onClick={() => removeSet(ei, si)}
                        >×</button>
                      </div>
                    ))}
                    <button className="btn btn-sm btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => addSet(ei)}>
                      + Set
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAddOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={saveAddSession}
                disabled={addSaving}
              >
                {addSaving ? 'Saving…' : 'Save Session'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  title: {
    fontFamily: 'var(--font-head)',
    fontSize: 40,
    letterSpacing: '0.04em',
  },
  tabBar: {
    display: 'flex',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    padding: '8px',
    background: 'none',
    border: 'none',
    borderRadius: 8,
    color: 'var(--muted)',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'var(--surface2)',
    color: 'var(--text)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sessionCard: {
    padding: 0,
    overflow: 'hidden',
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '14px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    gap: 12,
    WebkitTapHighlightColor: 'transparent',
  },
  sessionLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  sessionDate: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
    textAlign: 'left',
  },
  sessionMeta: {
    fontSize: 12,
    color: 'var(--muted)',
    textAlign: 'left',
  },
  detail: {
    padding: '0 16px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  detailExercise: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  detailExName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--muted2)',
  },
  detailSets: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  detailSet: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--muted)',
    background: 'var(--surface2)',
    padding: '2px 8px',
    borderRadius: 6,
  },
  prCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  prName: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
  },
  prDate: {
    fontSize: 11,
    color: 'var(--muted)',
    marginTop: 2,
  },
  prRight: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 1,
  },
  prWeight: {
    fontFamily: 'var(--font-mono)',
    fontSize: 22,
    fontWeight: 500,
  },
  prUnit: { fontSize: 11, color: 'var(--muted)' },
  prX: { fontSize: 12, color: 'var(--muted)', margin: '0 2px' },
  prReps: { fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--muted2)' },
  // 100dvh, not 100vh: on mobile 100vh measures the viewport behind the
  // browser chrome, which is what pushed sheet buttons below the fold.
  overlay: {
    position: 'fixed',
    inset: 0,
    height: '100dvh',
    background: 'rgba(0,0,0,0.75)',
    zIndex: 300,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sheet: {
    background: 'var(--surface)',
    borderRadius: '20px 20px 0 0',
    border: '1px solid var(--border)',
    borderBottom: 'none',
    padding: '16px 20px calc(24px + var(--safe-bot))',
    width: '100%',
    maxWidth: 480,
    maxHeight: 'calc(100dvh - 40px)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    overflowY: 'auto',
  },
  confirmSheet: {
    background: 'var(--surface)',
    borderRadius: '20px 20px 0 0',
    border: '1px solid var(--border)',
    borderBottom: 'none',
    padding: '16px 20px calc(24px + var(--safe-bot))',
    width: '100%',
    maxWidth: 480,
    maxHeight: 'calc(100dvh - 40px)',
    boxSizing: 'border-box',
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
  addExCard: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px',
    marginBottom: 8,
  },
}
