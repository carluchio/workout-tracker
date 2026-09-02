import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { startOfMonth } from 'date-fns'
import { fetchSplits, getConfig, setConfig, PALETTE } from '../lib/config.js'

const CONFIG_KEY = 'dashboard_lifts'

// Only used to seed the very first dashboard, before anything is configured.
const SEED_KEYWORDS = ['Deadlift', 'Squat', 'Bench', 'Row', 'Hip Thrust', 'Shoulder']

export default function DashboardPage() {
  const [exercises, setExercises] = useState([])
  const [splits, setSplits] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [cards, setCards] = useState([])
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    setLoading(true)

    const [{ data: exs }, { splits }, { count }] = await Promise.all([
      supabase.from('exercises').select('id, name, muscle_group').eq('is_archived', false).order('name'),
      fetchSplits(),
      supabase.from('sessions')
        .select('id', { count: 'exact', head: true })
        .gte('started_at', startOfMonth(new Date()).toISOString()),
    ])

    const library = exs || []
    setExercises(library)
    setSplits(splits)
    setSessionCount(count || 0)

    let ids = await getConfig(CONFIG_KEY, null)
    if (!Array.isArray(ids)) {
      // First run (or pre-migration): reproduce the old hardcoded six.
      ids = SEED_KEYWORDS
        .map(k => library.find(e => e.name.toLowerCase().includes(k.toLowerCase()))?.id)
        .filter(Boolean)
    }
    // Drop anything since archived or deleted.
    ids = ids.filter(id => library.some(e => e.id === id))

    setSelectedIds(ids)
    await loadCards(ids, library, splits)
    setLoading(false)
  }

  // One query for every tracked lift, then aggregate client-side.
  //
  // The previous version ordered session_exercises by `id` — a UUID — and then
  // read "last session" from row zero, so the figure it showed was frequently
  // from an arbitrary older session rather than the most recent one.
  const loadCards = async (ids, library, splitList) => {
    if (!ids.length) { setCards([]); return }

    const { data: rows } = await supabase
      .from('session_exercises')
      .select('id, exercise_id, sessions!inner(started_at), sets(reps, weight_lbs)')
      .in('exercise_id', ids)
      .limit(2000)

    const byExercise = {}
    ;(rows || []).forEach(r => {
      if (!r.sets?.length || !r.sessions?.started_at) return
      ;(byExercise[r.exercise_id] ||= []).push(r)
    })

    const built = ids.map((id, i) => {
      const ex = library.find(e => e.id === id)
      const performed = (byExercise[id] || [])
        .sort((a, b) => new Date(b.sessions.started_at) - new Date(a.sessions.started_at))

      const color =
        splitList.find(s => s.name === ex?.muscle_group)?.color ||
        PALETTE[i % PALETTE.length]

      if (!performed.length) {
        return { id, name: ex?.name || '—', group: ex?.muscle_group, color, pr: null, lastSet: null, history: [] }
      }

      const allSets = performed.flatMap(r => r.sets)
      const pr = allSets.reduce((best, s) =>
        !best || Number(s.weight_lbs) > Number(best.weight_lbs) ? s : best, null)

      const topOf = (sets) =>
        sets.reduce((a, b) => Number(b.weight_lbs) > Number(a.weight_lbs) ? b : a, sets[0])

      const lastSet = topOf(performed[0].sets)

      // Best weight per session day, oldest → newest, last 8.
      const byDay = {}
      performed.forEach(r => {
        const d = r.sessions.started_at.slice(0, 10)
        const t = Number(topOf(r.sets).weight_lbs)
        if (!byDay[d] || t > byDay[d]) byDay[d] = t
      })
      const history = Object.entries(byDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-8)
        .map(([, v]) => v)

      return { id, name: ex?.name || '—', group: ex?.muscle_group, color, pr, lastSet, history }
    })

    setCards(built)
  }

  const saveSelection = async (ids) => {
    setSelectedIds(ids)
    setEditOpen(false)
    setLoading(true)
    await setConfig(CONFIG_KEY, ids)
    await loadCards(ids, exercises, splits)
    setLoading(false)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>DASHBOARD</h1>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setEditOpen(true)}>
            Choose lifts
          </button>
        </div>
        <div style={S.monthStats}>
          <span style={S.monthNum}>{sessionCount}</span>
          <span style={S.monthLabel}>sessions<br />this month</span>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : !cards.length ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <h3>Nothing tracked yet</h3>
          <p>Tap “Choose lifts” to pick the exercises you want on this dashboard.</p>
        </div>
      ) : (
        <div style={S.grid}>
          {cards.map(card => <LiftCard key={card.id} card={card} />)}
        </div>
      )}

      {editOpen && (
        <LiftPicker
          exercises={exercises}
          selected={selectedIds}
          onCancel={() => setEditOpen(false)}
          onSave={saveSelection}
        />
      )}
    </div>
  )
}

function LiftPicker({ exercises, selected, onCancel, onSave }) {
  const [ids, setIds] = useState(selected)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return exercises
    return exercises.filter(e =>
      e.name.toLowerCase().includes(t) || (e.muscle_group || '').toLowerCase().includes(t))
  }, [q, exercises])

  // Selection order is display order, so picking builds the list top-down.
  const toggle = (id) =>
    setIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">Dashboard Lifts</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 12px' }}>
          {ids.length} selected · they appear in the order you pick them.
        </p>

        <input
          className="input"
          placeholder="Search exercises…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ marginBottom: 12, flexShrink: 0 }}
        />

        <div className="sheet-body" style={{ gap: 6 }}>
          {filtered.map(ex => {
            const on = ids.includes(ex.id)
            const pos = ids.indexOf(ex.id)
            return (
              <button
                key={ex.id}
                onClick={() => toggle(ex.id)}
                style={{
                  ...S.pickRow,
                  borderColor: on ? 'var(--gold)' : 'var(--border)',
                  background: on ? 'color-mix(in srgb, var(--gold) 10%, var(--surface2))' : 'var(--surface2)',
                }}
              >
                <span style={{ ...S.pickIndex, opacity: on ? 1 : 0 }}>{pos + 1}</span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: 14, color: on ? 'var(--text)' : 'var(--muted2)' }}>
                  {ex.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{ex.muscle_group}</span>
              </button>
            )
          })}
          {!filtered.length && (
            <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              No exercises match “{q}”.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(ids)}>
            Save ({ids.length})
          </button>
        </div>
      </div>
    </div>
  )
}

function LiftCard({ card }) {
  const accent = card.color
  return (
    <div style={{ ...S.card, borderColor: card.pr ? `${accent}30` : 'var(--border)' }} className="fade-up">
      <div style={S.cardTop}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 10, color: accent, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {card.group || 'Other'}
          </span>
          <h3 style={S.liftName}>{card.name}</h3>
        </div>
        <Sparkline data={card.history} color={accent} />
      </div>

      {card.pr ? (
        <div style={S.statsRow}>
          <div>
            <span style={S.statLabel}>ALL-TIME PR</span>
            <div>
              <span style={S.prVal} className="pr-glow">{card.pr.weight_lbs}</span>
              <span style={S.unit}> lbs</span>
              <span style={S.times}> × </span>
              <span style={{ ...S.prVal, fontSize: 18, color: 'var(--muted2)' }}>{card.pr.reps}</span>
            </div>
          </div>
          {card.lastSet && (
            <div style={{ textAlign: 'right' }}>
              <span style={S.statLabel}>LAST SESSION</span>
              <div style={S.lastVal}>
                {card.lastSet.weight_lbs}
                <span style={S.unit}> lbs</span>
                <span style={S.times}> × </span>
                {card.lastSet.reps}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>No data logged</p>
      )}
    </div>
  )
}

function Sparkline({ data, color }) {
  if (!data?.length || data.length < 2) return <div style={{ width: 64, flexShrink: 0 }} />
  const w = 64, h = 30
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 6) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last = data[data.length - 1]
  const ly = h - ((last - min) / range) * (h - 6) - 2

  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      <circle cx={w} cy={ly} r="3" fill={color} opacity="0.9" />
    </svg>
  )
}

const S = {
  page: { padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontFamily: 'var(--font-head)', fontSize: 40, letterSpacing: '0.04em' },
  monthStats: { display: 'flex', alignItems: 'baseline', gap: 8 },
  monthNum: { fontFamily: 'var(--font-mono)', fontSize: 36, color: 'var(--text)', lineHeight: 1 },
  monthLabel: { fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 },
  grid: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: 'var(--surface)', border: '1px solid', borderRadius: 14, padding: '14px 16px' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 },
  liftName: { fontFamily: 'var(--font-head)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1.1, marginTop: 2 },
  statsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  statLabel: { display: 'block', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.1em', marginBottom: 3 },
  prVal: { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: 'var(--gold)' },
  lastVal: { fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--muted2)' },
  unit: { fontSize: 12, color: 'var(--muted)', opacity: 0.8 },
  times: { fontSize: 13, color: 'var(--muted)' },

  pickRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 8, border: '1px solid', cursor: 'pointer', transition: 'all 0.1s', WebkitTapHighlightColor: 'transparent' },
  pickIndex: { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold)', minWidth: 14 },
}
