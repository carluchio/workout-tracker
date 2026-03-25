import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { format, formatDistanceToNow } from 'date-fns'

const TYPE_COLOR = { Pull: 'var(--pull)', Push: 'var(--push)', Legs: 'var(--legs)' }
const TYPE_BG    = { Pull: 'pull-bg',     Push: 'push-bg',     Legs: 'legs-bg' }

export default function HistoryPage() {
  const [tab, setTab] = useState('history')
  const [sessions, setSessions] = useState([])
  const [prs, setPrs] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [sessionDetail, setSessionDetail] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    tab === 'history' ? loadHistory() : loadPRs()
  }, [tab])

  const loadHistory = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50)
    setSessions(data || [])
    setLoading(false)
  }

  const loadPRs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('personal_records')
      .select('*')
      .order('pr_weight', { ascending: false })
    setPrs(data || [])
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

    setSessionDetail(prev => ({ ...prev, [sessionId]: data || [] }))
    setExpanded(sessionId)
  }

  const fmtDuration = (start, end) => {
    if (!end) return '—'
    const mins = Math.round((new Date(end) - new Date(start)) / 60000)
    return `${mins}m`
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>HISTORY</h1>

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
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
      ) : tab === 'history' ? (
        <div style={styles.list}>
          {!sessions.length && (
            <div className="empty-state">
              <h3>No sessions yet</h3>
              <p>Complete your first workout to see history here.</p>
            </div>
          )}
          {sessions.map(sess => (
            <div key={sess.id} className="card" style={styles.sessionCard}>
              <button style={styles.sessionRow} onClick={() => loadSessionDetail(sess.id)}>
                <div style={styles.sessionLeft}>
                  <span className={`pill ${TYPE_BG[sess.session_type]}`}>
                    {sess.session_type}
                  </span>
                  <div>
                    <p style={styles.sessionDate}>
                      {format(new Date(sess.started_at), 'EEE MMM d, yyyy')}
                    </p>
                    <p style={styles.sessionMeta}>
                      {formatDistanceToNow(new Date(sess.started_at), { addSuffix: true })}
                      {sess.finished_at && ` · ${fmtDuration(sess.started_at, sess.finished_at)}`}
                    </p>
                  </div>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="var(--muted)" strokeWidth="2"
                  style={{ transform: expanded === sess.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
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
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.list}>
          {!prs.length && (
            <div className="empty-state">
              <h3>No PRs recorded yet</h3>
              <p>Log sets to build your personal record board.</p>
            </div>
          )}
          {/* Group by muscle group */}
          {['Pull', 'Push', 'Legs'].map(group => {
            const groupPRs = prs.filter(p => p.muscle_group === group)
            if (!groupPRs.length) return null
            return (
              <div key={group}>
                <p className="section-label" style={{ color: TYPE_COLOR[group], marginTop: 12 }}>
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
  prUnit: {
    fontSize: 11,
    color: 'var(--muted)',
  },
  prX: {
    fontSize: 12,
    color: 'var(--muted)',
    margin: '0 2px',
  },
  prReps: {
    fontFamily: 'var(--font-mono)',
    fontSize: 16,
    color: 'var(--muted2)',
  },
}
