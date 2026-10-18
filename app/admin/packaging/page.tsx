'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import OwnerGuard from '../owner-guard'
import { supabase } from '../../../lib/supabase'

type Order = { placed_at?: string; order_id: string; buyer_username: string; product_name: string; product_quantity: string; original_item_price: string; cancelled_or_failed: string; gifted_to: string; shipment_id: string }
type BreakRow = { id: string; break_name: string | null; stream_datetime: string | null; status: string | null }
type Entry = { id: string; break_id: string; collector_id: string; spot_name: string; is_hit: boolean; hit_name: string | null; hit_tier: string | null }
type Collector = { id: string; whatnot_name: string }
type Item = { id: string; label: string; type: 'hit' | 'bulk' | 'giveaway'; detail?: string }
type Customer = { name: string; spend: number; items: Item[]; breakHits: Map<string, boolean>; entered: Set<string> }
type Issue = { label: string; detail: string }
type QueueTab = 'all' | 'giveaways' | 'bulk'
type SavedShow = { key: string; name: string; uploadedAt: string; orders: Order[]; assignments: Record<string, string> }
const SHOW_STORAGE = 'cv-packing-shows-v2'
function savedShows(): SavedShow[] {
  try { return JSON.parse(localStorage.getItem(SHOW_STORAGE) || '[]') as SavedShow[] } catch { return [] }
}
function storeShows(shows: SavedShow[]) { localStorage.setItem(SHOW_STORAGE, JSON.stringify(shows)) }
function suggestedName(orders: Order[]) {
  const first = orders.find(o => o.placed_at)?.placed_at || ''
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(first)
  if (!match) return 'Untitled stream'
  const [, y, m, d, h] = match
  const hour = Number(h)
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `${date.toLocaleDateString('en-GB', {day:'numeric',month:'long'})} ${hour % 12 || 12}${hour >= 12 ? 'pm' : 'am'}`
}

// Handles quoted fields, escaped double-quotes, CRLF and multiline cells.
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (c === ',' && !quoted) { row.push(cell); cell = '' }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++
      row.push(cell); if (row.some(v => v.trim())) rows.push(row)
      row = []; cell = ''
    } else cell += c
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.')
  row.push(cell); if (row.some(v => v.trim())) rows.push(row)
  const [header, ...data] = rows
  if (!header) throw new Error('CSV is empty.')
  return data.map(values => Object.fromEntries(header.map((key, index) => [key.trim(), values[index] || ''])))
}

function clean(value: string) {
  // Remove emoji and their variation/ZWJ sequences before comparing labels.
  // The original cleaner converted emoji into spaces but left some modifiers behind.
  return String(value || '').normalize('NFKC').replace(/[’]/g, "'")
    .replace(/\s*·\s*Extra Hit \d+$/i, '')
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\uFE0E\uFE0F\u200D]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').toLowerCase().trim().replace(/\s+/g, ' ')
}
function baseSpot(value: string) { return String(value || '').replace(/\s*·\s*Extra Hit \d+$/i, '').trim() }
function breakNumber(value: string) { return /\bbreak\s*#?\s*(\d+)\b/i.exec(value)?.[1] || '' }
function isFailed(value: string) { return /^(true|yes|1|failed|cancelled|canceled)$/i.test(value.trim()) }
function isGiveaway(value: string) { return /giveaway|free\s*slab|free\s*pack|free\s*single|\bbuyers\b|\bfollowers\b/i.test(value) }
function money(value: number) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value) }
function price(value: string) { return Number(value.replace(/[£,]/g, '')) || 0 }
function giveawayLabel(name: string) { return /\bbuyers\b/i.test(name) ? 'Buyers Giveaway' : /followers/i.test(name) ? 'Followers Giveaway' : 'Followers Giveaway' }
function stripEmoji(value: string) { return value.replace(/^[^\p{L}\p{N}]+/u, '').trim() }
function splitProduct(value: string) {
  const parts = value.split(/\s+-\s+/)
  return { title: parts[0] || '', spot: stripEmoji(parts.slice(1).join(' - ')) }
}
function makeId(order: Order, index: number) { return `${order.order_id || 'row'}:${index}` }

export default function PackagingPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [shows, setShows] = useState<SavedShow[]>([])
  const [showKey, setShowKey] = useState('')
  const [showName, setShowName] = useState('')
  const [queueTab, setQueueTab] = useState<QueueTab>('all')
  const [fileName, setFileName] = useState('')
  const [breaks, setBreaks] = useState<BreakRow[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [collectors, setCollectors] = useState<Collector[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState('')
  const [showPacked, setShowPacked] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importKey, setImportKey] = useState('')
  const [bulkCards, setBulkCards] = useState('')
  const [minimumBulk, setMinimumBulk] = useState('10')

  useEffect(() => { setShows(savedShows()) }, [])
  useEffect(() => {
    if (!showKey) return
    setShows(previous => {
      const next = previous.map(show => show.key === showKey ? {...show, name: showName, assignments} : show)
      try { storeShows(next) } catch { /* local storage quota */ }
      return next
    })
  }, [assignments, showName, showKey])
  useEffect(() => {
    if (!importKey) return
    try {
      const settings = JSON.parse(localStorage.getItem(`cv-packing-bulk:${importKey}`) || '{}')
      setBulkCards(settings.total === undefined ? '' : String(settings.total))
      setMinimumBulk(settings.minimum === undefined ? '10' : String(settings.minimum))
    } catch { setBulkCards(''); setMinimumBulk('10') }
    try { setDone(JSON.parse(localStorage.getItem(`cv-packing:${importKey}`) || '{}')) } catch { setDone({}) }
  }, [importKey])
  function toggle(id: string) {
    setDone(previous => {
      const next = { ...previous, [id]: !previous[id] }
      try { localStorage.setItem(`cv-packing:${importKey}`, JSON.stringify(next)) } catch {}
      return next
    })
  }
  async function loadDatabase() {
    // Supabase/PostgREST commonly caps each request at 1,000 rows, even when
    // .range(0, 9999) is requested. Paginate so recent breaks are not omitted.
    async function allRows(table: 'entries' | 'collectors' | 'breaks', columns: string) {
      const rows: any[] = []
      const pageSize = 500
      for (let start = 0; start < 50000; start += pageSize) {
        const query = supabase.from(table).select(columns).range(start, start + pageSize - 1)
        const { data, error } = await query
        if (error) throw new Error(`${table}: ${error.message}`)
        rows.push(...(data || []))
        if ((data || []).length < pageSize) return rows
      }
      throw new Error(`${table}: more than 50,000 rows; refusing incomplete results.`)
    }
    const [b, e, c] = await Promise.all([
      allRows('breaks', 'id,break_name,stream_datetime,status'),
      allRows('entries', 'id,break_id,collector_id,spot_name,is_hit,hit_name,hit_tier'),
      allRows('collectors', 'id,whatnot_name'),
    ])
    setBreaks(b as BreakRow[]); setEntries(e as Entry[]); setCollectors(c as Collector[])
  }
  async function openShow(key: string) {
    const show = savedShows().find(s => s.key === key)
    if (!show) return
    setLoading(true); setError('')
    try {
      await loadDatabase()
      setOrders(show.orders); setShowKey(show.key); setImportKey(show.key)
      setShowName(show.name); setAssignments(show.assignments || {}); setFileName(show.name)
      setQueueTab('all'); setFilter('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open stream') }
    finally { setLoading(false) }
  }
  function deleteShow() {
    if (!showKey || !window.confirm('Remove this saved stream from this browser?')) return
    const next = savedShows().filter(show => show.key !== showKey)
    storeShows(next); setShows(next); setOrders([]); setShowKey(''); setImportKey(''); setFileName(''); setShowName(''); setAssignments({})
  }
  async function upload(file?: File) {
    if (!file) return
    setLoading(true); setError(''); setOrders([]); setAssignments({}); setDone({})
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      for (const field of ['order_id', 'buyer_username', 'product_name', 'cancelled_or_failed', 'original_item_price']) {
        if (!(field in (rows[0] || {}))) throw new Error(`Missing CSV column: ${field}`)
      }
      await loadDatabase()
      const minimal = (rows as unknown as Order[]).map(o => ({
        order_id: o.order_id, buyer_username: o.buyer_username, product_name: o.product_name,
        product_quantity: o.product_quantity, original_item_price: o.original_item_price,
        cancelled_or_failed: o.cancelled_or_failed, gifted_to: o.gifted_to,
        shipment_id: o.shipment_id, placed_at: o.placed_at,
      }))
      setOrders(minimal); setFileName(file.name)
      // Fingerprint includes the file's content so importing the same show restores its checkboxes.
      let hash = 2166136261
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
      const key = `${file.name}:${(hash >>> 0).toString(16)}`
      const name = suggestedName(minimal)
      const existing = savedShows().find(s => s.key === key)
      const nextShow: SavedShow = existing || { key, name, uploadedAt: new Date().toISOString(), orders: minimal, assignments: {} }
      const next = [nextShow, ...savedShows().filter(s => s.key !== key)]
      try { storeShows(next) } catch { throw new Error('Browser storage is full. Remove an old saved stream before importing.') }
      setShows(next); setShowKey(key); setShowName(nextShow.name); setAssignments(nextShow.assignments)
      setQueueTab('all'); setImportKey(key)
    } catch (err) { setError(err instanceof Error ? err.message : 'Import failed') }
    finally { setLoading(false) }
  }

  const groups = useMemo(() => {
    const map = new Map<string, string>()
    orders.filter(o => !isFailed(o.cancelled_or_failed)).forEach(o => {
      const p = splitProduct(o.product_name)
      if (breakNumber(p.title) && p.spot) map.set(p.title, breakNumber(p.title))
    })
    return Array.from(map.entries()).map(([title, number]) => ({ title, number }))
  }, [orders])

  const result = useMemo(() => {
    const people = new Map<string, Customer>()
    const issues: Issue[] = []
    const collectorById = new Map(collectors.map(c => [c.id, clean(c.whatnot_name)]))
    const entriesByBreak = new Map<string, Entry[]>()
    entries.forEach(e => entriesByBreak.set(e.break_id, [...(entriesByBreak.get(e.break_id) || []), e]))
    const used = new Set<string>()
    const validOrders = orders.filter(o => !isFailed(o.cancelled_or_failed))
    validOrders.forEach((order, index) => {
      const recipient = (order.gifted_to || '').trim() || order.buyer_username.trim()
      const username = recipient.toLowerCase()
      if (!username) { issues.push({ label: 'Missing recipient', detail: order.product_name }); return }
      let customer = people.get(username)
      if (!customer) {
        customer = { name: recipient, spend: 0, items: [], entered: new Set(), breakHits: new Map() }
        people.set(username, customer)
      }
      const { title, spot } = splitProduct(order.product_name)
      const id = makeId(order, index)
      const quantity = Math.max(1, Math.floor(Number(order.product_quantity) || 1))
      if (isGiveaway(order.product_name) && !breakNumber(title)) {
        customer.items.push({ id, type: 'giveaway', label: giveawayLabel(order.product_name), detail: order.product_name })
        return
      }
      if (!breakNumber(title) || !spot) {
        issues.push({ label: `${recipient}: Unrecognised product`, detail: order.product_name })
        return
      }
      customer.spend += price(order.original_item_price) * quantity
      const breakId = assignments[title]
      if (breakId && breaks.find(b => b.id === breakId)?.status !== 'completed') {
        issues.push({ label: `${recipient}: Break not completed`, detail: `${title} — verify all hits have been revealed before deciding bulk` })
      }
      if (!breakId) {
        issues.push({ label: `${recipient}: Break not selected`, detail: `${title} — ${spot}` })
        return
      }
      customer.entered.add(breakId)
      const candidates = (entriesByBreak.get(breakId) || []).filter(e => clean(baseSpot(e.spot_name)) === clean(spot) && !/·\s*Extra Hit \d+/i.test(e.spot_name))
      const exact = candidates.filter(e => collectorById.get(e.collector_id) === clean(username))
      const available = exact.filter(e => !used.has(e.id))
      if (available.length === 0) {
        issues.push({ label: `${recipient}: Spot/owner mismatch`, detail: `${title} — ${spot} (${(entriesByBreak.get(breakId) || []).length} website entries loaded for this break, ${candidates.length} matching spot(s), ${exact.length} owned by this collector)` })
        return
      }
      for (let count = 0; count < quantity; count++) {
        const entry = available[count]
        if (!entry) { issues.push({ label: `${recipient}: Quantity mismatch`, detail: `${title} — ${spot} × ${quantity}` }); break }
        used.add(entry.id)
        if (entry.is_hit) {
          customer.breakHits.set(breakId, true)
          customer.items.push({ id: `hit:${entry.id}`, type: 'hit', label: entry.hit_name || baseSpot(entry.spot_name), detail: title })
        } else if (entry.hit_name || entry.hit_tier) {
          issues.push({ label: `${recipient}: Inconsistent reveal`, detail: `${title} — ${spot}` })
        }
        const extraPrefix = `${baseSpot(entry.spot_name)} · Extra Hit `
        const extras = (entriesByBreak.get(breakId) || []).filter(e => e.collector_id === entry.collector_id && e.spot_name.startsWith(extraPrefix) && e.is_hit)
        for (const extra of extras) {
          if (used.has(extra.id)) continue
          used.add(extra.id)
          customer.breakHits.set(breakId, true)
          customer.items.push({ id: `hit:${extra.id}`, type: 'hit', label: extra.hit_name || extra.spot_name, detail: `${title} · Extra hit` })
        }
      }
    })
    people.forEach((person, username) => {
      // Never decide bulk when a buyer has unresolved purchased spots.
      const unresolved = issues.some(issue => issue.label.toLowerCase().startsWith(`${username}:`))
      if (!unresolved && [...person.entered].some(b => !person.breakHits.get(b))) {
        person.items.push({ id: `bulk:${username}`, type: 'bulk', label: `Bulk — ${money(person.spend)} spent` })
      }
    })
    return { customers: Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name)), issues, valid: validOrders.length, failed: orders.length - validOrders.length }
  }, [orders, entries, collectors, assignments, breaks])

  // Fair bulk allocation: equal minimum first, then distribute the remainder by spend.
  // Largest-remainder rounding makes allocations whole numbers and uses every card.
  const bulkAllocation = useMemo(() => {
    const eligible = result.customers.filter(c => c.items.some(i => i.type === 'bulk'))
    const total = bulkCards.trim() === '' ? null : Number(bulkCards)
    const minimum = Number(minimumBulk)
    const valid = total !== null && Number.isSafeInteger(total) && total >= 0 &&
      Number.isSafeInteger(minimum) && minimum >= 1
    const needed = eligible.length * (Number.isSafeInteger(minimum) && minimum >= 1 ? minimum : 0)
    const allocations = new Map<string, number>()
    if (!valid || total === null || total < needed || eligible.length === 0) {
      return { eligible: eligible.length, total, minimum, needed, allocations, ready: false }
    }
    const remainder = total - needed
    const weights = eligible.map(c => Math.max(0, c.spend))
    const sum = weights.reduce((a, b) => a + b, 0)
    const shares = eligible.map((c, i) => remainder * (sum > 0 ? weights[i] / sum : 1 / eligible.length))
    const floors = shares.map(Math.floor)
    let leftovers = remainder - floors.reduce((a, b) => a + b, 0)
    const order = eligible.map((c, i) => i).sort((a, b) =>
      (shares[b] - floors[b]) - (shares[a] - floors[a]) ||
      eligible[a].name.localeCompare(eligible[b].name)
    )
    for (const index of order) {
      if (leftovers <= 0) break
      floors[index]++
      leftovers--
    }
    eligible.forEach((c, i) => allocations.set(c.name.toLowerCase(), minimum + floors[i]))
    return { eligible: eligible.length, total, minimum, needed, allocations, ready: true }
  }, [result.customers, bulkCards, minimumBulk])
  function updateBulkSettings(total: string, minimum: string) {
    setBulkCards(total); setMinimumBulk(minimum)
    if (importKey) {
      try { localStorage.setItem(`cv-packing-bulk:${importKey}`, JSON.stringify({ total, minimum })) } catch {}
    }
  }

  const giveawayOnly = result.customers.filter(c => c.items.length > 0 && c.items.every(i => i.type === 'giveaway') && c.spend === 0)
  const bulkOnly = result.customers.filter(c => c.items.length > 0 && c.items.every(i => i.type === 'bulk'))
  const queue = queueTab === 'giveaways' ? giveawayOnly : queueTab === 'bulk' ? bulkOnly : result.customers
  const filtered = queue.filter(c => {
    if (!c.name.toLowerCase().includes(filter.toLowerCase())) return false
    return showPacked || !c.items.length || !c.items.every(i => done[i.id])
  })
  const totalItems = result.customers.reduce((sum, c) => sum + c.items.length, 0)
  const checkedItems = result.customers.reduce((sum, c) => sum + c.items.filter(i => done[i.id]).length, 0)
  const allAssigned = groups.length > 0 && groups.every(g => assignments[g.title])

  return <OwnerGuard><main className="pack-page">
    <style jsx global>{`
      .pack-page{min-height:100vh;background:radial-gradient(circle at top,#17177d,#07073e 46%,#02021e);color:#fff;padding:24px;font-family:inherit}
      .pack-wrap{max-width:1250px;margin:auto}.pack-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
      .pack-top h1{font-size:clamp(2rem,4vw,3rem);margin:4px 0}.pack-muted{color:#b9b8d7}.pack-eyebrow{font-size:.75rem;letter-spacing:1.4px;color:#fde68a;text-transform:uppercase;font-weight:900}
      .pack-panel,.pack-customer{border:1px solid #ffffff25;background:#ffffff0b;border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 14px 35px #0003}
      .pack-panel h2{font-size:1.1rem;margin:0 0 12px}.pack-button,.pack-input,.pack-select{border:1px solid #ffffff35;border-radius:12px;padding:11px 14px;background:#ffffff14;color:#fff;font-weight:750}
      .pack-button{cursor:pointer}.pack-button:hover{background:#7c3aed55}.pack-select option{color:#111}.pack-input{width:100%;max-width:370px}.pack-upload{display:inline-flex;gap:10px;align-items:center;cursor:pointer;border:1px dashed #c084fc;border-radius:14px;padding:14px;background:#7c3aed20;font-weight:850}
      .pack-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pack-stats{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.pack-stat{border:1px solid #ffffff25;border-radius:12px;padding:12px 16px;background:#ffffff0a}.pack-stat strong{display:block;font-size:1.3rem}
      .pack-tabs{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0}.pack-tab{border:1px solid #ffffff35;background:#ffffff14;color:white;border-radius:999px;padding:10px 16px;font-weight:850;cursor:pointer}.pack-tab.active{background:#7c3aed;border-color:#c084fc}
      .pack-match{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:12px;margin:10px 0}.pack-customer h3{margin:0;font-size:1.15rem}.pack-customer-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.pack-item{display:flex;align-items:flex-start;gap:12px;padding:10px;border-radius:10px;background:#ffffff0a;margin:6px 0;cursor:pointer}.pack-item input{width:18px;height:18px;accent-color:#a78bfa}.pack-item small{display:block;color:#b9b8d7;margin-top:3px}.pack-checked{text-decoration:line-through;opacity:.55}.pack-warning{color:#fde68a}.pack-issues{max-height:340px;overflow:auto}.pack-issue{padding:10px;border-bottom:1px solid #ffffff20}.pack-issue small{display:block;color:#c9c8df;margin-top:3px;overflow-wrap:anywhere}
      @media(max-width:850px){.pack-page{padding:12px}.pack-grid,.pack-match{grid-template-columns:1fr}}
      @media print{.pack-page{background:#fff!important;color:#000!important}.pack-top a,.pack-upload,.pack-button,.pack-input,.pack-select,.pack-settings,.pack-issues-panel,.pack-tabs{display:none!important}.pack-panel,.pack-customer{background:#fff;color:#000;border:1px solid #bbb;box-shadow:none;break-inside:avoid}.pack-muted,.pack-item small{color:#555}.pack-item{background:#fff;color:#000}.pack-grid{grid-template-columns:1fr 1fr}}
    `}</style>
    <div className="pack-wrap">
      <header className="pack-top"><div><div className="pack-eyebrow">Collectiverse Operations</div><h1>Packaging Assistant</h1><div className="pack-muted">Whatnot orders + verified Breaks Centre hits + giveaways + bulk</div></div><Link href="/admin" className="pack-button" style={{textDecoration:'none'}}>← Admin</Link></header>
      <section className="pack-panel pack-settings"><h2>Choose a stream</h2>
        <div className="pack-match"><select className="pack-select" value={showKey} onChange={e => openShow(e.target.value)}><option value="">Select saved stream…</option>{shows.map(show => <option value={show.key} key={show.key}>{show.name}</option>)}</select>
        {showKey && <button className="pack-button" onClick={deleteShow}>Remove saved stream</button>}</div>
        {showKey && <label className="pack-muted">Stream name <input className="pack-input" style={{marginLeft:12}} value={showName} onChange={e => setShowName(e.target.value)} placeholder="17th October 4pm" /></label>}
        <h2 style={{marginTop:18}}>Import another stream CSV</h2><label className="pack-upload">📄 Choose Whatnot CSV<input type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={e => upload(e.target.files?.[0])}/></label>{loading && <p>Reading CSV and website records…</p>}{fileName && <p className="pack-muted">{fileName} · {orders.length} rows</p>}{error && <p className="pack-warning">{error}</p>}</section>
      {orders.length > 0 && <>
        <section className="pack-panel pack-settings"><h2>2. Match show breaks to website breaks</h2><p className="pack-muted">Select the correct website break for each CSV break. This prevents hits being pulled from the wrong livestream.</p>
          {groups.map(group => <div className="pack-match" key={group.title}><strong>{group.title}</strong><select className="pack-select" value={assignments[group.title] || ''} onChange={e => setAssignments(a => ({...a,[group.title]:e.target.value}))}><option value="">Select website break…</option>{breaks.map(b => <option key={b.id} value={b.id}>{b.break_name || 'Unnamed break'} {b.stream_datetime ? `· ${new Date(b.stream_datetime).toLocaleDateString('en-GB')}` : ''}</option>)}</select></div>)}
        </section>
        <section className="pack-panel pack-settings">
          <h2>3. Bulk distribution calculator</h2>
          <p className="pack-muted">Enter the number of bulk cards available for this stream. Every eligible buyer gets a minimum, then the remaining cards are shared by spend. Customers with hits in every break do not receive bulk.</p>
          <div className="pack-stats" style={{alignItems:'end'}}>
            <label>Bulk cards available<br/><input className="pack-input" style={{maxWidth:190,marginTop:6}} type="number" min="0" step="1" placeholder="e.g. 1200" value={bulkCards} onChange={e => updateBulkSettings(e.target.value, minimumBulk)}/></label>
            <label>Minimum per customer<br/><input className="pack-input" style={{maxWidth:190,marginTop:6}} type="number" min="1" step="1" value={minimumBulk} onChange={e => updateBulkSettings(bulkCards, e.target.value)}/></label>
            <div className="pack-stat"><strong>{bulkAllocation.eligible}</strong>Bulk recipients</div>
            <div className="pack-stat"><strong>{bulkAllocation.needed}</strong>Cards for minimums</div>
          </div>
          {bulkAllocation.eligible === 0 ? <p className="pack-muted">No confirmed bulk recipients yet.</p> :
           bulkCards.trim() === '' ? <p className="pack-muted">Enter your bulk stock to calculate exact quantities.</p> :
           !bulkAllocation.ready ? <p className="pack-warning">{bulkAllocation.total !== null && Number.isSafeInteger(bulkAllocation.total) && bulkAllocation.total >= 0 && Number.isSafeInteger(bulkAllocation.minimum) && bulkAllocation.minimum >= 1 && bulkAllocation.total < bulkAllocation.needed
             ? `Not enough cards for your minimum: ${bulkAllocation.needed} required, ${bulkAllocation.total} available. Lower the minimum or increase the stock. No quantities assigned.`
             : 'Enter valid whole numbers (minimum at least 1). No quantities assigned.'}</p> :
           <p style={{color:'#bbf7d0',fontWeight:800}}>✓ All {bulkAllocation.total?.toLocaleString('en-GB')} bulk cards allocated across {bulkAllocation.eligible} customers. Exact quantities appear next to Bulk in the checklist.</p>}
        </section>
        <section className="pack-panel"><h2>4. Packing queue — {showName}</h2>
          <div className="pack-tabs">
            <button className={`pack-tab ${queueTab === 'all' ? 'active' : ''}`} onClick={() => setQueueTab('all')}>Main List ({result.customers.length})</button>
            <button className={`pack-tab ${queueTab === 'giveaways' ? 'active' : ''}`} onClick={() => setQueueTab('giveaways')}>Giveaway Only ({giveawayOnly.length})</button>
            <button className={`pack-tab ${queueTab === 'bulk' ? 'active' : ''}`} onClick={() => setQueueTab('bulk')}>Bulk Only ({bulkOnly.length})</button>
          </div><div className="pack-stats"><div className="pack-stat"><strong>{result.customers.length}</strong>Recipients</div><div className="pack-stat"><strong>{result.valid}</strong>Valid orders</div><div className="pack-stat"><strong>{result.failed}</strong>Failed/cancelled</div><div className="pack-stat"><strong>{checkedItems}/{totalItems}</strong>Items packed</div><div className="pack-stat"><strong>{result.issues.length}</strong>Needs review</div></div>
          {!allAssigned && <p className="pack-warning">Choose every website break above before trusting the packing list. Unmatched orders are flagged below.</p>}
          <div className="pack-top pack-settings"><input className="pack-input" placeholder="Search username…" value={filter} onChange={e => setFilter(e.target.value)}/><label><input type="checkbox" checked={showPacked} onChange={e => setShowPacked(e.target.checked)}/> Show completed customers</label><button className="pack-button" onClick={() => window.print()}>🖨️ Print checklist</button></div>
          <div className="pack-grid">{filtered.length === 0 && <p className="pack-muted">No customers in this tab.</p>}{filtered.map(customer => <article className="pack-customer" key={customer.name.toLowerCase()}><div className="pack-customer-head"><h3>{customer.name}</h3><span className="pack-muted">{money(customer.spend)} spent</span></div>
            {customer.items.map(item => <label className={`pack-item ${done[item.id] ? 'pack-checked' : ''}`} key={item.id}><input type="checkbox" checked={!!done[item.id]} onChange={() => toggle(item.id)}/><span><strong>{item.type === 'bulk' && bulkAllocation.ready
              ? `Bulk — ${bulkAllocation.allocations.get(customer.name.toLowerCase()) ?? 0} cards · ${money(customer.spend)} spent`
              : item.label}</strong>{item.detail && <small>{item.detail}</small>}</span></label>)}
            {!customer.items.length && <p className="pack-warning">No confirmed packing items — check Needs Review or break results.</p>}
          </article>)}</div>
        </section>
        <section className="pack-panel pack-issues-panel"><h2>Needs Review ({result.issues.length})</h2><p className="pack-muted">Unmatched spots are not treated as misses. Resolve these before packing, especially when bulk is involved.</p><div className="pack-issues">{result.issues.length ? result.issues.map((issue,i) => <div className="pack-issue" key={i}><strong>{issue.label}</strong><small>{issue.detail}</small></div>) : <p>✓ No unmatched orders.</p>}</div></section>
        <p className="pack-muted">Saved streams, break selections and packing progress are stored in this browser, not Supabase. Reopen a saved stream here to resume. No break, collector or sales data is modified.</p>
      </>}
    </div>
  </main></OwnerGuard>
}
