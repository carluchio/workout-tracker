import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { format, startOfMonth } from 'date-fns'

// Key lifts to track — matched by partial name against exercise library
const KEY_LIFTS = [
  { keyword: 'Deadlift',   label: 'Deadlift',       group: 'Pull' },
  { keyword: 'Squat',      label: 'Squat',           group: 'Legs' },
  { keyword: 'Bench',      label: 'Bench Press',     group: 'Push' },
  { keyword: 'Row',        label: 'Barbell Row',     group: 'Pull' },
  { keyword: 'Hip Thrust', label: 'Hip Thrust',      group: 'Legs' },
  { keyword: 'Shoulder',   label: 'Shoulder Press',  group: 'Push' },
]

const TYPE_COLOR = { Pull: 'var(--pull)', Push: 'var(--push)', Legs: 'var(--legs)' }

export default function DashboardPage() {
  const [cards, setCards]           = useState([])
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading]       = useState(true)

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)

    // Sessions this month
    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', startOfMonth(new Date()).toISOString())
    setSessionCount(count || 0)

    // For each key lift find matching exercises then pull their set history
    const results = await Promise.all(KEY_LIFTS.map(async (lift) => {
      // Find exercise by keyword
      const { data: exs } = await supabase
        .from('exercises')
        .select('id, name')
        .ilike('name', `%${lift.keyword}%`)
        .eq('is_archived', false)
        .limit(5)

      if (!exs?.length) return { ...lift, pr: null, lastSet: null, history: [] }

      // Prefer exact keyword match, otherwise first result
      const ex = exs.find(e => e.name.toLowerCase().includes(lift.keyword.toLowerCase())) || exs[0]

      // Get all session_exercise IDs for this exercise
      const { data: seRows } = await supabase
        .from('session_exercises')
        .select('id, sessions(id, started_at)')
        .eq('exercise_id', ex.id)
        .order('id', { ascending: false })
        .limit(30)

      if (!seRows?.length) return { ...lift, exerciseName: ex.name, pr: null, lastSet: null, history: [] }

      const seIds = seRows.map(r => r.id)

      // Get all sets for those session_exercises
      const { data: allSets } = await supabase
        .from('sets')
        .select('set_number, reps, weight_lbs, session_exercise_id, logged_at')
        .in('session_exercise_id', seIds)
        .order('logged_at', { ascending: false })

      if (!allSets?.length) return { ...lift, exerciseName: ex.name, pr: null, lastSet: null, history: [] }

      // Build a map of session_exercise_id -> session date
      const seToDate = {}
      seRows.forEach(r => { if (r.sessions?.started_at) seToDate[r.id] = r.sessions.started_at })

      // PR = highest weight set
      const pr = allSets.reduce((best, s) =>
        !best || s.weight_lbs > best.weight_lbs ? s : best, null)

      // Last session = most recent session_exercise, top set by weight
      const lastSeId = seRows[0].id
      const lastSessionSets = allSets.filter(s => s.session_exercise_id === lastSeId)
      const lastSet = lastSessionSets.length
        ? lastSessionSets.reduce((best, s) => s.weight_lbs > best.weight_lbs ? s : best, lastSessionSets[0])
        : null

      // Sparkline: max weight per session, last 8 sessions
      const bySession = {}
      allSets.forEach(s => {
        const date = seToDate[s.session_exercise_id]
        if (!date) return
        const d = date.slice(0, 10)
        if (!bySession[d] || s.weight_lbs > bySession[d].weight) {
          bySession[d] = { weight: s.weight_lbs, date: d }
        }
      })
      const history = Object.values(bySession)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-8)
        .map(v => v.weight)

      return { ...lift, exerciseName: ex.name, pr, lastSet, history }
    }))

    setCards(results)
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={S.page}>
        <h1 style={S.title}>DASHBOARD</h1>
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>DASHBOARD</h1>
        <div style={S.monthStats}>
          <span style={S.monthNum}>{sessionCount}</span>
          <span style={S.monthLabel}>sessions<br />this month</span>
        </div>
      </div>

      {cards.every(c => !c.pr) ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <h3>No data yet</h3>
          <p>Complete a few sessions and your strength metrics will appear here.</p>
        </div>
      ) : (
        <div style={S.grid}>
          {cards.map((card, i) => (
            <LiftCard key={i} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}

function LiftCard({ card }) {
  const accent = TYPE_COLOR[card.group]

  return (
    <div style={{ ...S.card, borderColor: card.pr ? `${accent}30` : 'var(--border)' }} className="fade-up">
      {/* Top row: group tag + sparkline */}
      <div style={S.cardTop}>
        <div>
          <span style={{ fontSize: 10, color: accent, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {card.group}
          </span>
          <h3 style={S.liftName}>{card.exerciseName || card.label}</h3>
        </div>
        <Sparkline data={card.history} color={accent} />
      </div>

      {/* PR + last session */}
      {card.pr ? (
        <div style={S.statsRow}>
          <div>
            <span style={S.statLabel}>ALL-TIME PR</span>
            <div style={S.prVal}>
              <span className="pr-glow">{card.pr.weight_lbs}</span>
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
  if (!data?.length || data.length < 2) return <div style={{ width: 64 }} />
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
  const lx = w
  const ly = h - ((last - min) / range) * (h - 6) - 2

  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      <circle cx={lx} cy={ly} r="3" fill={color} opacity="0.9" />
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
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  liftName: { fontFamily: 'var(--font-head)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1.1, marginTop: 2 },
  statsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  statLabel: { display: 'block', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.1em', marginBottom: 3 },
  prVal: { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: 'var(--gold)', display: 'inline' },
  lastVal: { fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--muted2)' },
  unit: { fontSize: 12, color: 'var(--muted)', opacity: 0.8 },
  times: { fontSize: 13, color: 'var(--muted)' },
}
