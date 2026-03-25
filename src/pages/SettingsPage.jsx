import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const SESSION_TYPES = ['Pull', 'Push', 'Legs']
const TYPE_COLOR = { Pull: 'var(--pull)', Push: 'var(--push)', Legs: 'var(--legs)' }
const COUNTS_KEY = 'division_counts'

function getDivisionCounts() {
  try {
    const s = localStorage.getItem(COUNTS_KEY)
    return s ? JSON.parse(s) : { Pull: 5, Push: 5, Legs: 5 }
  } catch { return { Pull: 5, Push: 5, Legs: 5 } }
}

export default function SettingsPage() {
  const [activeType, setActiveType] = useState('Pull')
  const [divisionCounts, setDivisionCounts] = useState(getDivisionCounts)
  const [divisions, setDivisions] = useState([])
  const [exercises, setExercises] = useState([])
  const [editDiv, setEditDiv] = useState(null)
  const [saving, setSaving] = useState(false)

  const count = divisionCounts[activeType] || 5

  useEffect(() => {
    setEditDiv(null)
    loadDivisions()
    loadExercises()
  }, [activeType])

  const loadDivisions = async () => {
    const { data } = await supabase
      .from('divisions')
      .select('*')
      .eq('session_type', activeType)
      .order('division_number')

    // Build map from DB results
    const dbMap = {}
    data?.forEach(d => { dbMap[d.division_number] = d })

    // Always show `count` slots — merge DB rows in, use defaults for missing ones
    const currentCount = divisionCounts[activeType] || 5
    buildSlots(currentCount, dbMap)
  }

  const buildSlots = (n, dbMap) => {
    const slots = Array.from({ length: n }, (_, i) =>
      dbMap?.[i + 1] ?? {
        session_type: activeType,
        division_number: i + 1,
        label: `Division ${i + 1}`,
        exercise_ids: [],
      }
    )
    setDivisions(slots)
  }

  const loadExercises = async () => {
    const { data } = await supabase
      .from('exercises')
      .select('id, name, muscle_group')
      .eq('is_archived', false)
      .order('name')
    setExercises(data || [])
  }

  const setCount = (newCount) => {
    const updated = { ...divisionCounts, [activeType]: newCount }
    setDivisionCounts(updated)
    localStorage.setItem(COUNTS_KEY, JSON.stringify(updated))

    setDivisions(prev => {
      if (newCount > prev.length) {
        const extra = Array.from({ length: newCount - prev.length }, (_, i) => ({
          session_type: activeType,
          division_number: prev.length + i + 1,
          label: `Division ${prev.length + i + 1}`,
          exercise_ids: [],
        }))
        return [...prev, ...extra]
      }
      return prev.slice(0, newCount)
    })

    // Close edit panel if its division was removed
    if (editDiv !== null && editDiv >= newCount) setEditDiv(null)
  }

  // KEY FIX: update state in place instead of reloading all divisions
  const saveDivision = async (div) => {
    setSaving(true)

    if (div.id) {
      // Row already exists — update only this row
      const { error } = await supabase
        .from('divisions')
        .update({ label: div.label, exercise_ids: div.exercise_ids })
        .eq('id', div.id)

      if (!error) {
        setDivisions(prev => prev.map(d => d.id === div.id ? { ...div } : d))
      }
    } else {
      // No DB row yet — upsert on the unique key (session_type, division_number)
      // NOTE: if division_number > 5, you need to run in Supabase SQL Editor:
      //   ALTER TABLE divisions DROP CONSTRAINT divisions_division_number_check;
      //   ALTER TABLE divisions ADD CONSTRAINT divisions_division_number_check
      //     CHECK (division_number BETWEEN 1 AND 6);
      const { data, error } = await supabase
        .from('divisions')
        .upsert({
          session_type: activeType,
          division_number: div.division_number,
          label: div.label,
          exercise_ids: div.exercise_ids || [],
        }, { onConflict: 'session_type,division_number' })
        .select()
        .single()

      if (data && !error) {
        setDivisions(prev => prev.map(d =>
          d.division_number === div.division_number ? data : d
        ))
      }
    }

    setSaving(false)
    setEditDiv(null)
    // No loadDivisions() call — state updated in place above
  }

  const toggleExercise = (divIndex, exId) => {
    setDivisions(prev => prev.map((d, i) => {
      if (i !== divIndex) return d
      const ids = d.exercise_ids || []
      return {
        ...d,
        exercise_ids: ids.includes(exId)
          ? ids.filter(id => id !== exId)
          : [...ids, exId],
      }
    }))
  }

  const accent = TYPE_COLOR[activeType]

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SETTINGS</h1>

      <div>
        <p className="section-label">Workout Divisions</p>
        <p style={styles.hint}>
          Assign 2–3 exercise options per division — you'll choose one during the workout.
        </p>

        {/* Type tabs */}
        <div style={styles.typeTabs}>
          {SESSION_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              style={{
                ...styles.typeTab,
                borderColor: activeType === t ? TYPE_COLOR[t] : 'var(--border)',
                color: activeType === t ? TYPE_COLOR[t] : 'var(--muted)',
                background: activeType === t
                  ? `color-mix(in srgb, ${TYPE_COLOR[t]} 10%, var(--surface))`
                  : 'var(--surface)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Division count control */}
        <div style={styles.countRow}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Divisions for <strong style={{ color: 'var(--muted2)' }}>{activeType}</strong>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => count > 1 && setCount(count - 1)}
              disabled={count <= 1}
            >−</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text)', minWidth: 14, textAlign: 'center' }}>
              {count}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => count < 6 && setCount(count + 1)}
              disabled={count >= 6}
            >+</button>
          </div>
        </div>

        {/* Divisions list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {divisions.map((div, i) => {
            const isEditing = editDiv === i
            const assignedExercises = exercises.filter(ex =>
              (div.exercise_ids || []).includes(ex.id)
            )

            return (
              <div key={i} className="card" style={{ borderColor: isEditing ? accent : 'var(--border)' }}>
                <div style={styles.divHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span style={{ ...styles.divNum, color: accent, borderColor: accent }}>
                      {div.division_number}
                    </span>
                    {isEditing ? (
                      <input
                        className="input"
                        value={div.label}
                        onChange={e => setDivisions(prev => prev.map((d, idx) =>
                          idx === i ? { ...d, label: e.target.value } : d
                        ))}
                        style={{ height: 36, fontSize: 14, flex: 1 }}
                      />
                    ) : (
                      <span style={styles.divLabel}>
                        {div.label || `Division ${div.division_number}`}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => isEditing ? saveDivision(divisions[i]) : setEditDiv(i)}
                  >
                    {isEditing ? (saving ? '…' : 'Save') : 'Edit'}
                  </button>
                </div>

                {/* Assigned exercises preview */}
                {!isEditing && (
                  <div style={styles.assignedList}>
                    {assignedExercises.length ? (
                      assignedExercises.map(ex => (
                        <span key={ex.id} style={styles.assignedChip}>{ex.name}</span>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                        No exercises assigned
                      </span>
                    )}
                  </div>
                )}

                {/* Exercise picker */}
                {isEditing && (
                  <div style={{ marginTop: 12 }} className="fade-up">
                    <p className="section-label" style={{ marginBottom: 8 }}>
                      Assign exercises (select 2–3)
                    </p>
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
      </div>

      <div className="divider" />

      <div>
        <p className="section-label">Dashboard Lifts</p>
        <p style={styles.hint}>
          The dashboard tracks: Deadlift, BB Squat, Bench Press, Barbell Row, Hip Thrust, Shoulder
          Press. These are matched by exercise name from your library.
        </p>
      </div>

      <div className="divider" />

      <div>
        <p className="section-label" style={{ color: 'var(--danger)' }}>Data</p>
        <p style={styles.hint}>Your data is stored in Supabase and persists across devices.</p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  title: {
    fontFamily: 'var(--font-head)',
    fontSize: 40,
    letterSpacing: '0.04em',
  },
  hint: {
    fontSize: 13,
    color: 'var(--muted)',
    lineHeight: 1.5,
    marginTop: 4,
  },
  typeTabs: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  typeTab: {
    flex: 1,
    padding: '10px',
    borderRadius: 10,
    border: '1px solid',
    background: 'var(--surface)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.15s',
    WebkitTapHighlightColor: 'transparent',
  },
  countRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: '10px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  divHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  divNum: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    flexShrink: 0,
  },
  divLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
  },
  assignedList: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  assignedChip: {
    fontSize: 11,
    padding: '3px 10px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--muted2)',
  },
  exPickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 260,
    overflowY: 'auto',
  },
  exPickerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid',
    cursor: 'pointer',
    transition: 'all 0.1s',
    WebkitTapHighlightColor: 'transparent',
  },
}
