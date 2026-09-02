import { supabase } from './supabase.js'
import { format } from 'date-fns'

// Pulls the whole training log in one round trip.
export async function fetchAll() {
  const [sessionsRes, exercisesRes, notesRes] = await Promise.all([
    supabase
      .from('sessions')
      .select(`
        id, session_type, started_at, finished_at, notes,
        session_exercises(
          id, division_number, order_index,
          exercises(id, name, muscle_group),
          sets(set_number, reps, weight_lbs, logged_at)
        )
      `)
      .order('started_at', { ascending: false }),
    supabase
      .from('exercises')
      .select('id, name, muscle_group, coaching_notes, default_sets, default_reps, is_archived'),
    supabase
      .from('exercise_notes')
      .select('id, exercise_id, body, created_at')
      .order('created_at', { ascending: false }),
  ])

  const sessions = (sessionsRes.data || []).map(s => ({
    ...s,
    // Drop any exercise with no sets, and put divisions back in order —
    // PostgREST does not guarantee ordering inside an embedded array.
    session_exercises: (s.session_exercises || [])
      .filter(se => se.sets?.length)
      .sort((a, b) => (a.division_number ?? 0) - (b.division_number ?? 0))
      .map(se => ({ ...se, sets: [...se.sets].sort((x, y) => x.set_number - y.set_number) })),
  }))

  return {
    sessions,
    exercises: exercisesRes.data || [],
    // exercise_notes may not exist pre-migration; treat an error as "none".
    exerciseNotes: notesRes.error ? [] : (notesRes.data || []),
  }
}

const volumeOf = (sets) =>
  sets.reduce((n, s) => n + (Number(s.reps) || 0) * (Number(s.weight_lbs) || 0), 0)

// ── JSON ────────────────────────────────────────────────────────────────────

export function toJSON({ sessions, exercises, exerciseNotes }) {
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    schema: 'lift.v1',
    counts: {
      sessions: sessions.length,
      exercises: exercises.length,
      sets: sessions.reduce((n, s) =>
        n + s.session_exercises.reduce((m, se) => m + se.sets.length, 0), 0),
    },
    exercises,
    exercise_notes: exerciseNotes,
    sessions,
  }, null, 2)
}

// ── CSV (one row per set) ───────────────────────────────────────────────────

const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV({ sessions }) {
  const header = [
    'session_date', 'session_time', 'split', 'session_duration_min',
    'division', 'exercise', 'muscle_group',
    'set_number', 'reps', 'weight_lbs', 'volume_lbs', 'session_notes',
  ]
  const rows = [header.join(',')]

  sessions.forEach(s => {
    const start = new Date(s.started_at)
    const mins = s.finished_at
      ? Math.round((new Date(s.finished_at) - start) / 60000)
      : ''
    s.session_exercises.forEach(se => {
      se.sets.forEach(set => {
        rows.push([
          format(start, 'yyyy-MM-dd'),
          format(start, 'HH:mm'),
          s.session_type,
          mins,
          se.division_number ?? '',
          se.exercises?.name ?? '',
          se.exercises?.muscle_group ?? '',
          set.set_number,
          set.reps,
          set.weight_lbs,
          (Number(set.reps) || 0) * (Number(set.weight_lbs) || 0),
          s.notes ?? '',
        ].map(csvCell).join(','))
      })
    })
  })

  return rows.join('\n')
}

// ── Markdown ────────────────────────────────────────────────────────────────
// Shaped for pasting into a Claude conversation: a PR board and per-exercise
// trend up top so the model gets the summary before the raw log.

export function toMarkdown({ sessions, exercises, exerciseNotes }) {
  const out = []
  const totalSets = sessions.reduce((n, s) =>
    n + s.session_exercises.reduce((m, se) => m + se.sets.length, 0), 0)

  out.push('# Training log export')
  out.push('')
  out.push(`Exported ${format(new Date(), 'MMMM d, yyyy')} · ${sessions.length} sessions · ${totalSets} sets logged`)
  if (sessions.length) {
    const oldest = sessions[sessions.length - 1].started_at
    out.push(`Range: ${format(new Date(oldest), 'MMM d, yyyy')} → ${format(new Date(sessions[0].started_at), 'MMM d, yyyy')}`)
  }
  out.push('')

  // Per-exercise aggregate
  const byExercise = {}
  sessions.forEach(s => {
    s.session_exercises.forEach(se => {
      const name = se.exercises?.name
      if (!name) return
      if (!byExercise[name]) {
        byExercise[name] = { group: se.exercises.muscle_group, sessions: [], best: null }
      }
      const top = se.sets.reduce((a, b) =>
        Number(b.weight_lbs) > Number(a.weight_lbs) ? b : a, se.sets[0])
      byExercise[name].sessions.push({
        date: s.started_at, top, volume: volumeOf(se.sets), setCount: se.sets.length,
      })
      const best = byExercise[name].best
      if (!best || Number(top.weight_lbs) > Number(best.weight_lbs)) {
        byExercise[name].best = { ...top, date: s.started_at }
      }
    })
  })

  const names = Object.keys(byExercise).sort()

  if (names.length) {
    out.push('## Personal records')
    out.push('')
    out.push('| Exercise | Muscle group | Best set | Achieved | Sessions |')
    out.push('|---|---|---|---|---|')
    names
      .slice()
      .sort((a, b) => Number(byExercise[b].best?.weight_lbs || 0) - Number(byExercise[a].best?.weight_lbs || 0))
      .forEach(n => {
        const e = byExercise[n]
        out.push(`| ${n} | ${e.group || '—'} | ${e.best.weight_lbs} lbs × ${e.best.reps} | ${format(new Date(e.best.date), 'MMM d, yyyy')} | ${e.sessions.length} |`)
      })
    out.push('')

    out.push('## Progression by exercise')
    out.push('')
    out.push('Top set of each session, oldest to newest.')
    out.push('')
    names.forEach(n => {
      const e = byExercise[n]
      const ordered = [...e.sessions].sort((a, b) => new Date(a.date) - new Date(b.date))
      out.push(`### ${n}`)
      out.push('')
      out.push(ordered
        .map(x => `${format(new Date(x.date), 'MMM d')}: ${x.top.weight_lbs}×${x.top.reps}`)
        .join(' → '))
      out.push('')
      const notes = exerciseNotes.filter(note => {
        const ex = exercises.find(x => x.id === note.exercise_id)
        return ex?.name === n
      })
      if (notes.length) {
        out.push('Notes:')
        notes.slice(0, 5).forEach(note =>
          out.push(`- ${format(new Date(note.created_at), 'MMM d, yyyy')}: ${note.body}`))
        out.push('')
      }
    })
  }

  out.push('## Session log')
  out.push('')
  sessions.forEach(s => {
    const start = new Date(s.started_at)
    const mins = s.finished_at ? Math.round((new Date(s.finished_at) - start) / 60000) : null
    out.push(`### ${format(start, 'EEE MMM d, yyyy')} — ${s.session_type}${mins != null ? ` (${mins} min)` : ''}`)
    out.push('')
    if (!s.session_exercises.length) {
      out.push('_No sets logged._')
      out.push('')
      return
    }
    s.session_exercises.forEach(se => {
      const sets = se.sets.map(x => `${x.weight_lbs}×${x.reps}`).join(', ')
      out.push(`- **${se.exercises?.name || 'Unknown'}** — ${sets}`)
    })
    if (s.notes) {
      out.push('')
      out.push(`> ${s.notes}`)
    }
    out.push('')
  })

  return out.join('\n')
}

// ── Download ────────────────────────────────────────────────────────────────

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export const stamp = () => format(new Date(), 'yyyy-MM-dd')
