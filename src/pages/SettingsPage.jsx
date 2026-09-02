import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useRestTimer } from '../store/restTimer.jsx'
import {
  fetchSplits, createSplit, updateSplit, archiveSplit, reorderSplits, PALETTE,
} from '../lib/config.js'
import {
  fetchAll, toJSON, toCSV, toMarkdown, download, copyToClipboard, stamp,
} from '../lib/exportData.js'

const blankSplit = (sortOrder) => ({
  name: '', color: PALETTE[sortOrder % PALETTE.length], subtitle: '', division_count: 5,
})

export default function SettingsPage() {
  const timer = useRestTimer()

  const [splits, setSplits] = useState([])
  const [migrated, setMigrated] = useState(true)
  const [activeName, setActiveName] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [exercises, setExercises] = useState([])
  const [editDiv, setEditDiv] = useState(null)
  const [saving, setSaving] = useState(false)
  const [splitEditor, setSplitEditor] = useState(null)  // { mode, draft, original }
  const [confirmArchive, setConfirmArchive] = useState(null)

  useEffect(() => { loadSplits(); loadExercises() }, [])

  const activeSplit = splits.find(s => s.name === activeName) || splits[0] || null

  useEffect(() => {
    if (!activeSplit) return
    setEditDiv(null)
    loadDivisions(activeSplit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSplit?.id, activeSplit?.division_count])

  const loadSplits = async () => {
    const { splits, migrated } = await fetchSplits()
    setSplits(splits)
    setMigrated(migrated)
    setActiveName(prev => (splits.some(s => s.name === prev) ? prev : splits[0]?.name || null))
  }

  const loadExercises = async () => {
    const { data } = await supabase
      .from('exercises').select('id, name, muscle_group')
      .eq('is_archived', false).order('name')
    setExercises(data || [])
  }

  const loadDivisions = async (split) => {
    const { data } = await supabase
      .from('divisions').select('*')
      .eq('session_type', split.name).order('division_number')

    const byNumber = {}
    data?.forEach(d => { byNumber[d.division_number] = d })

    setDivisions(Array.from({ length: split.division_count }, (_, i) => byNumber[i + 1] || {
      session_type: split.name,
      division_number: i + 1,
      label: `Division ${i + 1}`,
      exercise_ids: [],
    }))
  }

  // ── Divisions ─────────────────────────────────────────────────────────────

  const saveDivision = async (div) => {
    setSaving(true)
    if (div.id) {
      const { error } = await supabase
        .from('divisions')
        .update({ label: div.label, exercise_ids: div.exercise_ids })
        .eq('id', div.id)
      if (!error) setDivisions(prev => prev.map(d => (d.id === div.id ? { ...div } : d)))
    } else {
      const { data, error } = await supabase
        .from('divisions')
        .upsert({
          session_type: activeSplit.name,
          division_number: div.division_number,
          label: div.label,
          exercise_ids: div.exercise_ids || [],
        }, { onConflict: 'session_type,division_number' })
        .select().single()
      if (data && !error) {
        setDivisions(prev => prev.map(d => (d.division_number === div.division_number ? data : d)))
      }
    }
    setSaving(false)
    setEditDiv(null)
  }

  const toggleExercise = (divIndex, exId) => {
    setDivisions(prev => prev.map((d, i) => {
      if (i !== divIndex) return d
      const ids = d.exercise_ids || []
      return {
        ...d,
        exercise_ids: ids.includes(exId) ? ids.filter(x => x !== exId) : [...ids, exId],
      }
    }))
  }

  const setDivisionCount = async (n) => {
    if (!activeSplit || n < 1 || n > 12) return
    if (!migrated) {
      // Pre-migration fallback: counts still live in localStorage.
      const counts = JSON.parse(localStorage.getItem('division_counts') || '{}')
      counts[activeSplit.name] = n
      localStorage.setItem('division_counts', JSON.stringify(counts))
    } else {
      await updateSplit(activeSplit, { division_count: n })
    }
    setSplits(prev => prev.map(s => (s.id === activeSplit.id ? { ...s, division_count: n } : s)))
    if (editDiv !== null && editDiv >= n) setEditDiv(null)
  }

  // ── Splits ────────────────────────────────────────────────────────────────

  const saveSplitEditor = async () => {
    const d = splitEditor.draft
    if (!d.name.trim()) return
    setSaving(true)

    if (splitEditor.mode === 'new') {
      const { error } = await createSplit({ ...d, sort_order: splits.length })
      if (error) { setSaving(false); alert(`Could not add split: ${error.message}`); return }
    } else {
      const { error } = await updateSplit(splitEditor.original, d)
      if (error) { setSaving(false); alert(`Could not save split: ${error.message}`); return }
      if (activeName === splitEditor.original.name) setActiveName(d.name.trim())
    }

    setSplitEditor(null)
    setSaving(false)
    await loadSplits()
  }

  const move = async (index, dir) => {
    const next = [...splits]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setSplits(next)
    await reorderSplits(next)
  }

  const doArchive = async () => {
    const s = confirmArchive
    setConfirmArchive(null)
    await archiveSplit(s.id)
    await loadSplits()
  }

  const accent = activeSplit?.color || 'var(--pull)'

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SETTINGS</h1>

      {!migrated && (
        <div className="banner banner-warn">
          <strong>Database migration pending.</strong> Custom splits, exercise notes and the
          configurable dashboard need <code>supabase/migration-002.sql</code> run once in the
          Supabase SQL editor. Until then this screen edits the three built-in splits only.
        </div>
      )}

      {/* ── Splits ──────────────────────────────────────────────────────── */}
      <section>
        <div style={styles.sectionHead}>
          <p className="section-label" style={{ marginBottom: 0 }}>Split Categories</p>
          <button
            className="btn btn-sm btn-ghost"
            disabled={!migrated}
            style={{ opacity: migrated ? 1 : 0.4 }}
            onClick={() => setSplitEditor({ mode: 'new', draft: blankSplit(splits.length) })}
          >
            + Add
          </button>
        </div>
        <p style={styles.hint}>
          These are the workouts offered on the Log screen. Renaming one updates every past
          session of that type, so your history stays intact.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {splits.map((s, i) => (
            <div key={s.id} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ ...styles.swatch, background: s.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {s.division_count} divisions{s.subtitle ? ` · ${s.subtitle}` : ''}
                  </p>
                </div>
                {migrated && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button style={styles.iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button style={styles.iconBtn} onClick={() => move(i, +1)} disabled={i === splits.length - 1} aria-label="Move down">↓</button>
                    <button style={styles.iconBtn} onClick={() => setSplitEditor({ mode: 'edit', draft: { ...s }, original: s })}>Edit</button>
                    <button
                      style={{ ...styles.iconBtn, color: 'var(--danger)' }}
                      onClick={() => setConfirmArchive(s)}
                      disabled={splits.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="divider" />

      {/* ── Divisions ───────────────────────────────────────────────────── */}
      <section>
        <p className="section-label">Workout Divisions</p>
        <p style={styles.hint}>
          Assign 2–3 exercise options per division — you'll choose one during the workout.
        </p>

        <div style={styles.typeTabs}>
          {splits.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveName(s.name)}
              style={{
                ...styles.typeTab,
                borderColor: activeSplit?.name === s.name ? s.color : 'var(--border)',
                color: activeSplit?.name === s.name ? s.color : 'var(--muted)',
                background: activeSplit?.name === s.name
                  ? `color-mix(in srgb, ${s.color} 10%, var(--surface))`
                  : 'var(--surface)',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>

        {activeSplit && (
          <>
            <div style={styles.countRow}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                Divisions for <strong style={{ color: 'var(--muted2)' }}>{activeSplit.name}</strong>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setDivisionCount(activeSplit.division_count - 1)}
                  disabled={activeSplit.division_count <= 1}
                >−</button>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, minWidth: 16, textAlign: 'center' }}>
                  {activeSplit.division_count}
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setDivisionCount(activeSplit.division_count + 1)}
                  disabled={activeSplit.division_count >= 12}
                >+</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {divisions.map((div, i) => {
                const isEditing = editDiv === i
                const assigned = exercises.filter(ex => (div.exercise_ids || []).includes(ex.id))
                return (
                  <div key={i} className="card" style={{ borderColor: isEditing ? accent : 'var(--border)' }}>
                    <div style={styles.divHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ ...styles.divNum, color: accent, borderColor: accent }}>
                          {div.division_number}
                        </span>
                        {isEditing ? (
                          <input
                            className="input"
                            value={div.label || ''}
                            onChange={e => setDivisions(prev => prev.map((d, idx) =>
                              idx === i ? { ...d, label: e.target.value } : d))}
                            style={{ height: 36, fontSize: 14, flex: 1 }}
                          />
                        ) : (
                          <span style={styles.divLabel}>{div.label || `Division ${div.division_number}`}</span>
                        )}
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => (isEditing ? saveDivision(divisions[i]) : setEditDiv(i))}
                      >
                        {isEditing ? (saving ? '…' : 'Save') : 'Edit'}
                      </button>
                    </div>

                    {!isEditing && (
                      <div style={styles.assignedList}>
                        {assigned.length ? assigned.map(ex => (
                          <span key={ex.id} style={styles.assignedChip}>{ex.name}</span>
                        )) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                            No exercises assigned
                          </span>
                        )}
                      </div>
                    )}

                    {isEditing && (
                      <div style={{ marginTop: 12 }} className="fade-up">
                        <p className="section-label" style={{ marginBottom: 8 }}>Assign exercises</p>
                        <div style={styles.exPickerList}>
                          {exercises.map(ex => {
                            const checked = (div.exercise_ids || []).includes(ex.id)
                            return (
                              <button
                                key={ex.id}
                                onClick={() => toggleExercise(i, ex.id)}
                                style={{
                                  ...styles.exPickerItem,
                                  borderColor: checked ? accent : 'var(--border)',
                                  background: checked
                                    ? `color-mix(in srgb, ${accent} 12%, var(--surface2))`
                                    : 'var(--surface2)',
                                }}
                              >
                                <span style={{ flex: 1, textAlign: 'left', fontSize: 13, color: checked ? 'var(--text)' : 'var(--muted2)' }}>
                                  {ex.name}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{ex.muscle_group}</span>
                                {checked && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5">
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      <div className="divider" />

      {/* ── Rest timer ──────────────────────────────────────────────────── */}
      <section>
        <p className="section-label">Rest Timer</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <label className="toggle-row">
            <span>
              Auto-start after each set
              <em>The countdown begins the moment you log a set.</em>
            </span>
            <input
              type="checkbox"
              checked={timer.autoStartEnabled}
              onChange={e => timer.setAutoStart(e.target.checked)}
            />
          </label>
          <div style={styles.countRow}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Default rest</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => timer.setDuration(timer.duration - 15)}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, minWidth: 46, textAlign: 'center' }}>
                {Math.floor(timer.duration / 60)}:{String(timer.duration % 60).padStart(2, '0')}
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => timer.setDuration(timer.duration + 15)}>+</button>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      <ExportSection />

      <div className="divider" />

      <section>
        <p className="section-label">Session Safety</p>
        <p style={styles.hint}>
          An active workout survives switching screens and reloading the app. If there's no
          activity for 30 minutes it ends and saves itself automatically.
        </p>
      </section>

      {/* ── Split editor sheet ──────────────────────────────────────────── */}
      {splitEditor && (
        <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && setSplitEditor(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">
              {splitEditor.mode === 'new' ? 'New Split' : 'Edit Split'}
            </h2>
            <div className="sheet-body" style={{ marginTop: 14 }}>
              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Name</p>
                <input
                  className="input"
                  placeholder="e.g. Upper A"
                  value={splitEditor.draft.name}
                  onChange={e => setSplitEditor(s => ({ ...s, draft: { ...s.draft, name: e.target.value } }))}
                />
                {splitEditor.mode === 'edit' && splitEditor.draft.name !== splitEditor.original.name && (
                  <p style={{ ...styles.hint, color: 'var(--gold)' }}>
                    Renaming will also update every past session and division labelled
                    “{splitEditor.original.name}”.
                  </p>
                )}
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Subtitle</p>
                <input
                  className="input"
                  placeholder="Bench · Shoulders · Triceps"
                  value={splitEditor.draft.subtitle || ''}
                  onChange={e => setSplitEditor(s => ({ ...s, draft: { ...s.draft, subtitle: e.target.value } }))}
                />
              </div>

              <div>
                <p className="section-label" style={{ marginBottom: 6 }}>Accent colour</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => setSplitEditor(s => ({ ...s, draft: { ...s.draft, color: c } }))}
                      style={{
                        ...styles.swatch,
                        background: c,
                        width: 34, height: 34,
                        cursor: 'pointer',
                        outline: splitEditor.draft.color === c ? '2px solid var(--text)' : 'none',
                        outlineOffset: 2,
                      }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div style={styles.countRow}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Divisions</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => setSplitEditor(s => ({ ...s, draft: { ...s.draft, division_count: Math.max(1, s.draft.division_count - 1) } }))}>−</button>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, minWidth: 16, textAlign: 'center' }}>
                    {splitEditor.draft.division_count}
                  </span>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => setSplitEditor(s => ({ ...s, draft: { ...s.draft, division_count: Math.min(12, s.draft.division_count + 1) } }))}>+</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSplitEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={saveSplitEditor}
                disabled={saving || !splitEditor.draft.name.trim()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive confirm ─────────────────────────────────────────────── */}
      {confirmArchive && (
        <div className="sheet-overlay" onClick={() => setConfirmArchive(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-body">
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 22, letterSpacing: '0.04em' }}>
                Remove “{confirmArchive.name}”?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                It disappears from the Log screen, but every past {confirmArchive.name} session
                stays in your history and exports. Nothing is deleted.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmArchive(null)}>Cancel</button>
                <button className="btn" style={{ flex: 1, background: 'var(--danger)', color: '#fff' }} onClick={doArchive}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export ──────────────────────────────────────────────────────────────────

function ExportSection() {
  const [busy, setBusy] = useState(null)
  const [status, setStatus] = useState(null)

  const run = async (kind) => {
    setBusy(kind)
    setStatus(null)
    try {
      const data = await fetchAll()
      const n = data.sessions.length
      if (kind === 'json') {
        download(`lift-export-${stamp()}.json`, toJSON(data), 'application/json')
      } else if (kind === 'csv') {
        download(`lift-sets-${stamp()}.csv`, toCSV(data), 'text/csv')
      } else if (kind === 'md') {
        download(`lift-log-${stamp()}.md`, toMarkdown(data), 'text/markdown')
      } else if (kind === 'copy') {
        const ok = await copyToClipboard(toMarkdown(data))
        setStatus(ok ? 'Copied to clipboard — paste it straight into Claude.' : 'Clipboard blocked; try a download instead.')
        setBusy(null)
        return
      }
      setStatus(`Exported ${n} session${n === 1 ? '' : 's'}.`)
    } catch (e) {
      setStatus(`Export failed: ${e.message}`)
    }
    setBusy(null)
  }

  const Btn = ({ kind, children }) => (
    <button
      className="btn btn-sm btn-ghost"
      style={{ flex: '1 1 45%' }}
      onClick={() => run(kind)}
      disabled={busy !== null}
    >
      {busy === kind ? '…' : children}
    </button>
  )

  return (
    <section>
      <p className="section-label">Export Data</p>
      <p style={styles.hint}>
        Your full training log — every session, set, PR and note. Markdown is the one to hand
        to Claude: it leads with a PR board and per-exercise progression before the raw log.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Btn kind="copy">Copy for Claude</Btn>
        <Btn kind="md">Markdown (.md)</Btn>
        <Btn kind="csv">Spreadsheet (.csv)</Btn>
        <Btn kind="json">Full backup (.json)</Btn>
      </div>
      {status && <p style={{ ...styles.hint, color: 'var(--legs)' }}>{status}</p>}
    </section>
  )
}

const styles = {
  page: { padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 20 },
  title: { fontFamily: 'var(--font-head)', fontSize: 40, letterSpacing: '0.04em' },
  hint: { fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginTop: 6 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  swatch: { width: 22, height: 22, borderRadius: 7, flexShrink: 0, border: '1px solid rgba(255,255,255,0.12)' },
  iconBtn: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 32, height: 32, color: 'var(--muted2)', fontSize: 12, cursor: 'pointer', padding: '0 8px', WebkitTapHighlightColor: 'transparent' },
  typeTabs: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  typeTab: { flex: '1 1 auto', minWidth: 72, padding: '10px', borderRadius: 10, border: '1px solid', background: 'var(--surface)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s', WebkitTapHighlightColor: 'transparent' },
  countRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 },
  divHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  divNum: { width: 26, height: 26, borderRadius: '50%', border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 500, flexShrink: 0 },
  divLabel: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  assignedList: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  assignedChip: { fontSize: 11, padding: '3px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted2)' },
  exPickerList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' },
  exPickerItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid', cursor: 'pointer', transition: 'all 0.1s', WebkitTapHighlightColor: 'transparent' },
}
