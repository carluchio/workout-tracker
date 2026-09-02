import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const KEY = 'active_workout_v2'
export const IDLE_LIMIT_MS = 30 * 60 * 1000

const EMPTY = {
  phase: 'select',   // 'select' | 'active' | 'summary'
  sessionId: null,
  split: null,       // { name, color, subtitle }
  divisions: [],
  currentDiv: 0,
  chosen: {},        // divIdx -> exercise
  seIds: {},         // divIdx -> session_exercises.id (created on first logged set)
  sets: {},          // divIdx -> [{ id, set_number, reps, weight_lbs }]
  inputs: {},        // divIdx -> { reps, weight }
  prev: {},          // exerciseId -> { date, sets }
  notes: {},         // exerciseId -> [{ id, body, created_at }]
  startedAt: null,
  lastActivity: null,
  summary: null,
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const saved = JSON.parse(raw)
    // Only an in-progress session is worth restoring.
    if (saved.phase !== 'active') return EMPTY
    return { ...EMPTY, ...saved }
  } catch {
    return EMPTY
  }
}

const Ctx = createContext(null)

export const useWorkout = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWorkout must be used inside <WorkoutProvider>')
  return v
}

export function WorkoutProvider({ children }) {
  const [state, setState] = useState(load)

  // Mirror of state readable synchronously inside async actions.
  const stateRef = useRef(state)
  stateRef.current = state

  // In-flight session_exercises inserts, keyed by division, so two fast taps
  // cannot create two rows for the same exercise.
  const sePending = useRef({})

  // Every update stamps activity — this is what the 30-minute idle timeout
  // reads. Only user-driven actions call it; the elapsed clock and the rest
  // timer tick outside this store and so never count as activity.
  const update = (partialOrFn) => {
    setState(prev => {
      const next = typeof partialOrFn === 'function'
        ? partialOrFn(prev)
        : { ...prev, ...partialOrFn }
      return { ...next, lastActivity: Date.now() }
    })
  }

  useEffect(() => {
    if (state.phase === 'active') localStorage.setItem(KEY, JSON.stringify(state))
    else localStorage.removeItem(KEY)
  }, [state])

  // ── 30-minute inactivity auto-end ─────────────────────────────────────────
  // Checked on mount (covers the app being closed entirely), on a slow poll,
  // and whenever the tab becomes visible again.
  useEffect(() => {
    const check = () => {
      const s = stateRef.current
      if (s.phase !== 'active' || !s.lastActivity) return
      if (Date.now() - s.lastActivity > IDLE_LIMIT_MS) {
        finishSession({ at: s.lastActivity, autoEnded: true })
      }
    }
    check()
    const iv = setInterval(check, 30000)
    const onVis = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reads ─────────────────────────────────────────────────────────────────

  // The last session in which this exercise was ACTUALLY performed.
  //
  // The old query ordered by `id` — a random UUID — took 10 rows, sorted those
  // by date, then read sets from that single row. With more than 10 rows of
  // history the pick was effectively random, and if the chosen row had no sets
  // (an orphan from the old "change" behaviour) it gave up rather than falling
  // through. PostgREST cannot order parent rows by an embedded column, so pull
  // the rows with their sets attached and resolve newest-with-sets client-side.
  const fetchPrevSets = async (exerciseId, excludeSessionId) => {
    let q = supabase
      .from('session_exercises')
      .select('id, session_id, sessions!inner(started_at), sets(set_number, reps, weight_lbs)')
      .eq('exercise_id', exerciseId)
      .limit(200)
    if (excludeSessionId) q = q.neq('session_id', excludeSessionId)

    const { data } = await q
    const performed = (data || [])
      .filter(r => r.sets?.length && r.sessions?.started_at)
      .sort((a, b) => new Date(b.sessions.started_at) - new Date(a.sessions.started_at))

    if (!performed.length) return null
    const top = performed[0]
    return {
      date: top.sessions.started_at,
      sets: [...top.sets].sort((a, b) => a.set_number - b.set_number),
    }
  }

  const fetchNotes = async (exerciseId) => {
    const { data } = await supabase
      .from('exercise_notes')
      .select('id, body, created_at')
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false })
      .limit(25)
    return data || []
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  const startSession = async (split) => {
    const { data: sess, error } = await supabase
      .from('sessions').insert({ session_type: split.name }).select().single()
    if (error) return false

    const { data: divRows } = await supabase
      .from('divisions').select('*')
      .eq('session_type', split.name).order('division_number')

    const byNumber = {}
    divRows?.forEach(d => { byNumber[d.division_number] = d })

    const count = split.division_count || divRows?.length || 5
    const slots = Array.from({ length: count }, (_, i) => byNumber[i + 1] || {
      session_type: split.name,
      division_number: i + 1,
      label: `Division ${i + 1}`,
      exercise_ids: [],
    })

    // One query for every exercise across every division, then map back so the
    // order configured in Settings is the order shown during the workout.
    const ids = [...new Set(slots.flatMap(d => d.exercise_ids || []))]
    const byId = {}
    if (ids.length) {
      const { data: exs } = await supabase
        .from('exercises').select('*').in('id', ids).eq('is_archived', false)
      exs?.forEach(e => { byId[e.id] = e })
    }

    const divisions = slots.map(d => ({
      ...d,
      exercises: (d.exercise_ids || []).map(id => byId[id]).filter(Boolean),
    }))

    localStorage.setItem('last_session', JSON.stringify({
      type: split.name, date: new Date().toISOString(),
    }))

    update({
      ...EMPTY,
      phase: 'active',
      sessionId: sess.id,
      split: { name: split.name, color: split.color, subtitle: split.subtitle },
      divisions,
      startedAt: Date.now(),
    })
    return true
  }

  const setCurrentDiv = (i) => update(s => ({ ...s, currentDiv: i }))

  const setInput = (divIdx, patch) => update(s => ({
    ...s,
    inputs: { ...s.inputs, [divIdx]: { ...(s.inputs[divIdx] || {}), ...patch } },
  }))

  const chooseExercise = async (divIdx, exercise) => {
    // No DB write here. The session_exercises row is created on the first
    // logged set — that is what stops an abandoned pick becoming a History
    // ghost when you hit "change" or step back to look at the division list.
    update(s => ({ ...s, chosen: { ...s.chosen, [divIdx]: exercise } }))

    const sessionId = stateRef.current.sessionId
    const [prev, notes] = await Promise.all([
      fetchPrevSets(exercise.id, sessionId),
      fetchNotes(exercise.id),
    ])

    update(s => {
      const seed = prev?.sets?.length
        ? prev.sets.reduce((a, b) => Number(b.weight_lbs) > Number(a.weight_lbs) ? b : a, prev.sets[0])
        : null
      return {
        ...s,
        prev:  { ...s.prev,  [exercise.id]: prev },
        notes: { ...s.notes, [exercise.id]: notes },
        inputs: {
          ...s.inputs,
          // Never clobber inputs the user already touched for this division.
          [divIdx]: s.inputs[divIdx] || (seed
            ? { reps: Number(seed.reps), weight: Number(seed.weight_lbs) }
            : { reps: parseInt(exercise.default_reps) || 8, weight: 135 }),
        },
      }
    })
  }

  const ensureSe = (divIdx) => {
    const s = stateRef.current
    if (s.seIds[divIdx]) return Promise.resolve(s.seIds[divIdx])
    if (sePending.current[divIdx]) return sePending.current[divIdx]

    const ex = s.chosen[divIdx]
    if (!ex || !s.sessionId) return Promise.resolve(null)

    const p = supabase
      .from('session_exercises')
      .insert({
        session_id: s.sessionId,
        exercise_id: ex.id,
        division_number: divIdx + 1,
        order_index: divIdx,
      })
      .select().single()
      .then(({ data }) => {
        if (data) update(st => ({ ...st, seIds: { ...st.seIds, [divIdx]: data.id } }))
        return data?.id || null
      })
      .finally(() => { delete sePending.current[divIdx] })

    sePending.current[divIdx] = p
    return p
  }

  const logSet = async (divIdx, reps, weight) => {
    const existing = stateRef.current.sets[divIdx] || []
    const setNum = existing.length + 1
    const tempId = `opt-${Date.now()}`

    update(s => ({
      ...s,
      sets: {
        ...s.sets,
        [divIdx]: [
          ...(s.sets[divIdx] || []),
          { id: tempId, set_number: setNum, reps, weight_lbs: weight, optimistic: true },
        ],
      },
    }))

    const seId = await ensureSe(divIdx)
    if (!seId) {
      update(s => ({
        ...s,
        sets: { ...s.sets, [divIdx]: (s.sets[divIdx] || []).filter(x => x.id !== tempId) },
      }))
      return false
    }

    const { data: saved } = await supabase
      .from('sets')
      .insert({ session_exercise_id: seId, set_number: setNum, reps, weight_lbs: weight })
      .select().single()

    update(s => ({
      ...s,
      sets: {
        ...s.sets,
        [divIdx]: (s.sets[divIdx] || []).map(x =>
          x.id === tempId ? (saved || { ...x, optimistic: false, id: `fallback-${setNum}` }) : x),
      },
    }))
    return true
  }

  const deleteSet = async (divIdx, setId) => {
    update(s => ({
      ...s,
      sets: {
        ...s.sets,
        [divIdx]: (s.sets[divIdx] || [])
          .filter(x => x.id !== setId)
          .map((x, i) => ({ ...x, set_number: i + 1 })),
      },
    }))
    const persisted = !String(setId).startsWith('opt-') && !String(setId).startsWith('fallback-')
    if (persisted) await supabase.from('sets').delete().eq('id', setId)
  }

  // Swapping the exercise for a division. If a row was already created but
  // every set has since been deleted, drop the row rather than orphan it.
  const changeExercise = async (divIdx) => {
    const s = stateRef.current
    const seId = s.seIds[divIdx]
    const hasSets = (s.sets[divIdx] || []).length > 0

    update(st => {
      const chosen = { ...st.chosen }; delete chosen[divIdx]
      const sets   = { ...st.sets };   delete sets[divIdx]
      const seIds  = { ...st.seIds };  delete seIds[divIdx]
      const inputs = { ...st.inputs }; delete inputs[divIdx]
      return { ...st, chosen, sets, seIds, inputs }
    })

    if (seId && !hasSets) await supabase.from('session_exercises').delete().eq('id', seId)
  }

  const saveNote = async (exerciseId, body) => {
    const text = body.trim()
    if (!text) return false
    const { data } = await supabase
      .from('exercise_notes')
      .insert({ exercise_id: exerciseId, session_id: stateRef.current.sessionId, body: text })
      .select().single()
    if (!data) return false
    update(s => ({
      ...s,
      notes: { ...s.notes, [exerciseId]: [data, ...(s.notes[exerciseId] || [])] },
    }))
    return true
  }

  const deleteNote = async (exerciseId, noteId) => {
    update(s => ({
      ...s,
      notes: { ...s.notes, [exerciseId]: (s.notes[exerciseId] || []).filter(n => n.id !== noteId) },
    }))
    await supabase.from('exercise_notes').delete().eq('id', noteId)
  }

  const finishSession = async ({ at = Date.now(), autoEnded = false } = {}) => {
    const s = stateRef.current
    if (s.phase !== 'active') return

    // Sweep any session_exercises row that ended up with no sets, so History
    // never shows an exercise that was not actually performed.
    const empties = Object.entries(s.seIds)
      .filter(([divIdx]) => !(s.sets[divIdx] || []).length)
      .map(([, id]) => id)
    if (empties.length) await supabase.from('session_exercises').delete().in('id', empties)

    if (s.sessionId) {
      await supabase.from('sessions')
        .update({ finished_at: new Date(at).toISOString() }).eq('id', s.sessionId)
    }

    const topLifts = []
    Object.entries(s.sets).forEach(([divIdx, sets]) => {
      const ex = s.chosen[divIdx]
      if (!ex || !sets.length) return
      const top = sets.reduce((a, b) => Number(b.weight_lbs) > Number(a.weight_lbs) ? b : a, sets[0])
      topLifts.push({ name: ex.name, reps: top.reps, weight_lbs: top.weight_lbs })
    })
    topLifts.sort((a, b) => Number(b.weight_lbs) - Number(a.weight_lbs))

    const totalSets = Object.values(s.sets).reduce((n, arr) => n + arr.length, 0)

    setState({
      ...EMPTY,
      phase: 'summary',
      summary: {
        splitName: s.split?.name,
        color: s.split?.color,
        durationSecs: Math.max(0, Math.floor((at - (s.startedAt || at)) / 1000)),
        totalSets,
        exerciseCount: Object.values(s.sets).filter(a => a.length).length,
        topLifts: topLifts.slice(0, 3),
        autoEnded,
      },
    })
  }

  const dismissSummary = () => setState(EMPTY)

  const totalSetsLogged = Object.values(state.sets).reduce((n, arr) => n + arr.length, 0)

  return (
    <Ctx.Provider value={{
      ...state,
      totalSetsLogged,
      startSession, setCurrentDiv, setInput,
      chooseExercise, changeExercise,
      logSet, deleteSet,
      saveNote, deleteNote,
      finishSession, dismissSummary,
    }}>
      {children}
    </Ctx.Provider>
  )
}
