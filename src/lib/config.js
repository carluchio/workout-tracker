import { supabase } from './supabase.js'

// The three splits the app shipped with. Used only as a fallback so the app
// keeps working if migration-002.sql has not been run yet.
export const LEGACY_SPLITS = [
  { id: 'legacy-pull', name: 'Pull', color: '#3b82f6', subtitle: 'Deadlifts · Rows · Lat work · Curls',   division_count: 5, sort_order: 0 },
  { id: 'legacy-push', name: 'Push', color: '#a855f7', subtitle: 'Bench · Shoulders · Triceps · Cables',  division_count: 5, sort_order: 1 },
  { id: 'legacy-legs', name: 'Legs', color: '#22c55e', subtitle: 'Squats · Hip Thrust · Lunges · Calves', division_count: 5, sort_order: 2 },
]

export const PALETTE = [
  '#3b82f6', '#a855f7', '#22c55e', '#eab308',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
]

// ── Splits ──────────────────────────────────────────────────────────────────

export async function fetchSplits() {
  const { data, error } = await supabase
    .from('splits').select('*')
    .eq('is_archived', false)
    .order('sort_order')

  // Table missing → migration not run yet. Fall back rather than break the app.
  if (error) {
    const counts = legacyDivisionCounts()
    return {
      splits: LEGACY_SPLITS.map(s => ({ ...s, division_count: counts[s.name] || 5 })),
      migrated: false,
    }
  }
  return { splits: data || [], migrated: true }
}

// Pre-migration, division counts lived in localStorage under this key.
function legacyDivisionCounts() {
  try { return JSON.parse(localStorage.getItem('division_counts') || '{}') } catch { return {} }
}

export async function createSplit({ name, color, subtitle, division_count, sort_order }) {
  const { data, error } = await supabase
    .from('splits')
    .insert({ name: name.trim(), color, subtitle, division_count, sort_order })
    .select().single()
  return { data, error }
}

// Renaming rewrites the string in sessions and divisions too. session_type is
// deliberately plain text rather than a foreign key, so existing history keeps
// working — but that means a rename has to cascade by hand.
export async function updateSplit(split, patch) {
  const renaming = patch.name != null && patch.name.trim() !== split.name

  if (renaming) {
    const next = patch.name.trim()
    const a = await supabase.from('sessions').update({ session_type: next }).eq('session_type', split.name)
    if (a.error) return { error: a.error }
    const b = await supabase.from('divisions').update({ session_type: next }).eq('session_type', split.name)
    if (b.error) return { error: b.error }
  }

  const { data, error } = await supabase
    .from('splits')
    .update({ ...patch, ...(renaming ? { name: patch.name.trim() } : {}) })
    .eq('id', split.id)
    .select().single()

  return { data, error }
}

// Archive rather than delete — past sessions of this type stay readable.
export async function archiveSplit(id) {
  return supabase.from('splits').update({ is_archived: true }).eq('id', id)
}

export async function reorderSplits(splits) {
  const updates = splits.map((s, i) =>
    supabase.from('splits').update({ sort_order: i }).eq('id', s.id))
  await Promise.all(updates)
}

// ── App config (key → JSON) ─────────────────────────────────────────────────

export async function getConfig(key, fallback = null) {
  const { data, error } = await supabase
    .from('app_config').select('value').eq('key', key).maybeSingle()
  if (error || !data) return fallback
  return data.value ?? fallback
}

export async function setConfig(key, value) {
  return supabase
    .from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}
