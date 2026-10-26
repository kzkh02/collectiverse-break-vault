'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import AdminGuard from '../guard'

type ManualHit = { id: string; collector_id: string; set_name: string; hit_name: string; hit_tier: string; pulled_at: string; break_number?: number | null; collector_name?: string }
const tiers = ['sir','gold','future','mar','clc','ir','sr','ex']
const sets = ['30th Celebration','English 151','Ascended Heroes','Black Bolt White Flare','Chaos Rising','Pitch Black','Crown Zenith']
const blank = { username: '', set_name: sets[0], hit_name: '', hit_tier: 'sir', break_number: '', pulled_at: new Date().toISOString().slice(0,10) }
export default function ManualHitsPage() {
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const [rows, setRows] = useState<ManualHit[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() {
    const { data, error } = await supabase.from('manual_hits').select('*').order('pulled_at', { ascending: false }).limit(500)
    if (error) { setMessage(error.message); return }
    const ids = [...new Set((data || []).map(x => x.collector_id))]
    const { data: collectors } = ids.length ? await supabase.from('collectors').select('id, whatnot_name').in('id', ids) : { data: [] }
    const names = new Map((collectors || []).map(x => [x.id, x.whatnot_name]))
    setRows((data || []).map(x => ({ ...x, collector_name: String(names.get(x.collector_id) || 'Unknown').toLowerCase() })))
  }
  useEffect(() => { void load() }, [])
  function change(key: keyof typeof blank, value: string) { setForm(current => ({ ...current, [key]: key === 'username' ? value.toLowerCase() : value })) }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const normalized = form.username.trim().replace(/^@/, '').toLowerCase()
      if (form.break_number && (!Number.isSafeInteger(Number(form.break_number)) || Number(form.break_number) < 1)) throw new Error('Break number must be a positive whole number.')
      if (!normalized || !form.hit_name.trim() || !form.pulled_at) throw new Error('Enter a username, card and date.')
      let { data: collector, error } = await supabase.from('collectors').select('id').eq('whatnot_name_normalized', normalized).maybeSingle()
      if (error) throw error
      if (!collector) {
        const created = await supabase.from('collectors').insert({ whatnot_name: normalized, whatnot_name_normalized: normalized }).select('id').single()
        if (created.error) throw created.error
        collector = created.data
      }
      const payload = { collector_id: collector!.id, set_name: form.set_name.trim(), hit_name: form.hit_name.trim(), hit_tier: form.hit_tier, break_number: form.break_number ? Number(form.break_number) : null, pulled_at: `${form.pulled_at}T12:00:00Z` }
      const result = editing ? await supabase.from('manual_hits').update(payload).eq('id', editing) : await supabase.from('manual_hits').insert(payload)
      if (result.error) throw result.error
      setForm(blank); setEditing(null); setMessage(editing ? 'Hit updated.' : 'Hit added.'); await load()
    } catch (err: any) { setMessage(err?.message || 'Could not save hit.') }
    finally { setBusy(false) }
  }
  function edit(row: ManualHit) {
    setEditing(row.id); setForm({ username: String(row.collector_name || '').toLowerCase(), break_number: row.break_number ? String(row.break_number) : '', set_name: row.set_name, hit_name: row.hit_name, hit_tier: row.hit_tier, pulled_at: row.pulled_at.slice(0,10) }); window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function remove(row: ManualHit) {
    if (!window.confirm(`Delete ${row.hit_name} for ${row.collector_name}?`)) return
    const { error } = await supabase.from('manual_hits').delete().eq('id', row.id)
    setMessage(error ? error.message : 'Hit deleted.'); if (!error) await load()
  }
  const inputStyle: React.CSSProperties = { width: '100%', background: '#171743', border: '1px solid #555587', color: 'white', padding: 12, borderRadius: 10 }
  return <AdminGuard><main style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#10105d,#02021f)', color: 'white', padding: 24 }}>
    <div style={{ maxWidth: 1050, margin: 'auto' }}>
      <Link href="/admin" style={{ color: '#ddd' }}>← Admin</Link>
      <h1>🏆 Manual Hits</h1><p style={{ opacity: .8 }}>Record individual pulls without importing a break CSV. These count toward lifetime rankings.</p>
      <form onSubmit={save} style={{ display: 'grid', gap: 14, background: '#ffffff10', border: '1px solid #ffffff25', borderRadius: 18, padding: 22, marginBottom: 30 }}>
        <label>Whatnot username<input style={inputStyle} value={form.username} onChange={e => change('username',e.target.value)} required placeholder="Collector username" /></label>
        <label>Set<select style={inputStyle} value={form.set_name} onChange={e => change('set_name',e.target.value)}>{sets.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Break number (optional)<input style={inputStyle} type="number" min="1" step="1" value={form.break_number} onChange={e => change('break_number',e.target.value)} placeholder="e.g. 12" /></label>
        <label>Card name (match Sets & Hit Images)<input style={inputStyle} value={form.hit_name} onChange={e => change('hit_name',e.target.value)} required placeholder="e.g. Forest Pikachu" /></label>
        <label>Rarity<select style={inputStyle} value={form.hit_tier} onChange={e => change('hit_tier',e.target.value)}>{tiers.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></label>
        <label>Date pulled<input style={inputStyle} type="date" value={form.pulled_at} onChange={e => change('pulled_at',e.target.value)} required /></label>
        <div style={{ display: 'flex', gap: 12 }}><button disabled={busy} style={{ ...inputStyle, background: '#eab308', color: '#111', fontWeight: 900, cursor: 'pointer' }}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Add hit'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(blank) }} style={{ ...inputStyle, cursor: 'pointer' }}>Cancel</button>}</div>
      </form>
      {message && <p role="status">{message}</p>}
      <h2>Previously added hits</h2>
      <div style={{ display: 'grid', gap: 10 }}>{rows.map(row => <div key={row.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, background: '#ffffff10', borderRadius: 12 }}><div><strong>{row.hit_name} · {row.hit_tier.toUpperCase()}</strong><div style={{ opacity: .8, marginTop: 5 }}>{String(row.collector_name || '').toLowerCase()} · {row.set_name}{row.break_number ? ` · Break #${row.break_number}` : ''} · {new Date(row.pulled_at).toLocaleDateString('en-GB')}</div></div><div style={{ display: 'flex', gap: 10 }}><button onClick={() => edit(row)}>Edit</button><button onClick={() => remove(row)}>Delete</button></div></div>)}</div>
    </div>
  </main></AdminGuard>
}
