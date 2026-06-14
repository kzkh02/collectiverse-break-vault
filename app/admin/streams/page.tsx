'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGuard from '../guard'
import { supabase } from '../../../lib/supabase'

type Tab = 'calendar' | 'entry' | 'purchased' | 'performance'
type StreamSet = { id: string; name: string; active: boolean }
type PackBatch = { id: string; set_id: string; purchase_date: string; packs_bought: number; packs_remaining: number; total_cost: number; cost_per_pack: number; stream_sets?: { name?: string } | null }
type StreamRow = { id: string; stream_date: string; stream_slot: number; sales: number; packs_used: number; total_cost: number; profit: number }
type ProductInput = { set_id: string; packs_used: string }

const PAYRUN_ANCHOR_FRIDAY = '2025-01-03'
// Change this to the first Friday of one real 2-week payrun.

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0))
}
function dateKey(date: Date) { return date.toISOString().slice(0, 10) }
function parseLocalDate(value: string) { return new Date(`${value}T00:00:00`) }
function todayKey() { return dateKey(new Date()) }
function monthLabel(year: number, monthIndex: number) { return new Date(year, monthIndex, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
function dayName(value: string) { return parseLocalDate(value).toLocaleDateString('en-GB', { weekday: 'short' }) }
function fullDate(value: string) { return parseLocalDate(value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
function getMonthDays(year: number, monthIndex: number) {
  const last = new Date(year, monthIndex + 1, 0)
  return Array.from({ length: last.getDate() }, (_, i) => dateKey(new Date(year, monthIndex, i + 1)))
}
function getCurrentPayrunRange() {
  const today = parseLocalDate(todayKey())
  const anchor = parseLocalDate(PAYRUN_ANCHOR_FRIDAY)
  const diffDays = Math.floor((today.getTime() - anchor.getTime()) / 86400000)
  const periods = Math.floor(diffDays / 14)
  const start = new Date(anchor); start.setDate(anchor.getDate() + periods * 14)
  const end = new Date(start); end.setDate(start.getDate() + 13)
  const previousStart = new Date(start); previousStart.setDate(start.getDate() - 14)
  const previousEnd = new Date(start); previousEnd.setDate(start.getDate() - 1)
  return { start: dateKey(start), end: dateKey(end), previousStart: dateKey(previousStart), previousEnd: dateKey(previousEnd) }
}
function sumStreams(streams: StreamRow[]) {
  return streams.reduce((t, s) => ({ sales: t.sales + Number(s.sales || 0), packs: t.packs + Number(s.packs_used || 0), cost: t.cost + Number(s.total_cost || 0), profit: t.profit + Number(s.profit || 0), count: t.count + 1 }), { sales: 0, packs: 0, cost: 0, profit: 0, count: 0 })
}

export default function StreamsPage() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('calendar')
  const [message, setMessage] = useState('')
  const [sets, setSets] = useState<StreamSet[]>([])
  const [batches, setBatches] = useState<PackBatch[]>([])
  const [streams, setStreams] = useState<StreamRow[]>([])
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [newSetName, setNewSetName] = useState('')
  const [purchaseSetId, setPurchaseSetId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayKey())
  const [purchasePacks, setPurchasePacks] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('')
  const [streamDate, setStreamDate] = useState(todayKey())
  const [streamSlot, setStreamSlot] = useState('1')
  const [streamSales, setStreamSales] = useState('')
  const [productRows, setProductRows] = useState<ProductInput[]>([{ set_id: '', packs_used: '' }])

  const monthDays = useMemo(() => getMonthDays(selectedYear, selectedMonth), [selectedYear, selectedMonth])
  const streamsByDate = useMemo(() => {
    const map = new Map<string, StreamRow[]>()
    streams.forEach((s) => map.set(s.stream_date, [...(map.get(s.stream_date) || []), s]))
    return map
  }, [streams])
  const selectedDayStreams = streamsByDate.get(selectedDate) || []
  const selectedDayTotals = sumStreams(selectedDayStreams)
  const currentMonthStreams = streams.filter((s) => { const d = parseLocalDate(s.stream_date); return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth })
  const monthTotals = sumStreams(currentMonthStreams)
  const payrun = getCurrentPayrunRange()
  const currentPayrun = sumStreams(streams.filter((s) => s.stream_date >= payrun.start && s.stream_date <= payrun.end))
  const previousPayrun = sumStreams(streams.filter((s) => s.stream_date >= payrun.previousStart && s.stream_date <= payrun.previousEnd))
  const allTime = sumStreams(streams)
  const payrunChange = previousPayrun.profit > 0 ? ((currentPayrun.profit - previousPayrun.profit) / previousPayrun.profit) * 100 : 0

  const profitByDay = useMemo(() => {
    const groups = new Map<string, { profit: number; count: number }>()
    streams.forEach((s) => {
      const day = parseLocalDate(s.stream_date).toLocaleDateString('en-GB', { weekday: 'long' })
      const g = groups.get(day) || { profit: 0, count: 0 }
      g.profit += Number(s.profit || 0); g.count += 1; groups.set(day, g)
    })
    return ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
      .filter((d) => groups.has(d))
      .map((day) => ({ day, average: groups.get(day)!.profit / groups.get(day)!.count, total: groups.get(day)!.profit, count: groups.get(day)!.count }))
  }, [streams])

  const bestDays = useMemo(() => Array.from(streamsByDate.entries()).map(([date, rows]) => ({ date, ...sumStreams(rows) })).sort((a, b) => b.profit - a.profit).slice(0, 10), [streamsByDate])

  async function loadData() {
    setMessage('Loading...')
    const [setsResult, batchesResult, streamsResult] = await Promise.all([
      supabase.from('stream_sets').select('*').order('name'),
      supabase.from('pack_batches').select('*, stream_sets(name)').order('purchase_date', { ascending: false }),
      supabase.from('streams').select('*').order('stream_date', { ascending: false }),
    ])
    if (setsResult.error || batchesResult.error || streamsResult.error) { setMessage(setsResult.error?.message || batchesResult.error?.message || streamsResult.error?.message || 'Load failed'); return }
    setSets((setsResult.data || []) as StreamSet[])
    setBatches((batchesResult.data || []) as PackBatch[])
    setStreams((streamsResult.data || []) as StreamRow[])
    setMessage('')
  }
  useEffect(() => { loadData() }, [])

  async function addSet() {
    const name = newSetName.trim()
    if (!name) return setMessage('Enter a set name first.')
    const { error } = await supabase.from('stream_sets').insert({ name })
    if (error) return setMessage(error.message)
    setNewSetName(''); setMessage('Set added'); loadData()
  }
  async function addPurchase() {
    const packs = Number(purchasePacks), totalCost = Number(purchaseCost)
    if (!purchaseSetId || !purchaseDate || packs <= 0 || totalCost <= 0) return setMessage('Choose a set, date, packs bought and total cost.')
    const { error } = await supabase.from('pack_batches').insert({ set_id: purchaseSetId, purchase_date: purchaseDate, packs_bought: packs, packs_remaining: packs, total_cost: totalCost, cost_per_pack: totalCost / packs })
    if (error) return setMessage(error.message)
    setPurchasePacks(''); setPurchaseCost(''); setMessage('Purchase added'); loadData()
  }
  function updateProductRow(i: number, field: keyof ProductInput, value: string) { setProductRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  function addProductRow() { setProductRows((rows) => [...rows, { set_id: '', packs_used: '' }]) }
  function removeProductRow(i: number) { setProductRows((rows) => rows.filter((_, idx) => idx !== i)) }

  async function allocateCostForSet(setId: string, packsNeeded: number) {
    let remainingNeeded = packsNeeded, costUsed = 0
    const { data, error } = await supabase.from('pack_batches').select('*').eq('set_id', setId).gt('packs_remaining', 0).order('purchase_date', { ascending: true }).order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    const allocations: any[] = []
    for (const batch of data || []) {
      if (remainingNeeded <= 0) break
      const packsFromBatch = Math.min(Number(batch.packs_remaining || 0), remainingNeeded)
      const costPerPack = Number(batch.cost_per_pack || 0)
      allocations.push({ batch_id: String(batch.id), packs_used: packsFromBatch, cost_per_pack: costPerPack, cost_used: packsFromBatch * costPerPack })
      costUsed += packsFromBatch * costPerPack; remainingNeeded -= packsFromBatch
    }
    if (remainingNeeded > 0) throw new Error(`Not enough packs remaining for ${sets.find((s) => s.id === setId)?.name || 'selected set'}. Short by ${remainingNeeded} packs.`)
    return { costUsed, allocations }
  }

  async function saveStream() {
    const sales = Number(streamSales), slot = Number(streamSlot)
    const cleanRows = productRows.map((r) => ({ set_id: r.set_id, packs_used: Number(r.packs_used) })).filter((r) => r.set_id && r.packs_used > 0)
    if (!streamDate || sales < 0 || cleanRows.length === 0) return setMessage('Enter stream date, sales and at least one set with packs used.')
    try {
      setMessage('Saving stream...')
      const productCosts = []
      for (const row of cleanRows) productCosts.push({ ...row, ...(await allocateCostForSet(row.set_id, row.packs_used)) })
      const totalPacks = productCosts.reduce((s, r) => s + r.packs_used, 0)
      const totalCost = productCosts.reduce((s, r) => s + r.costUsed, 0)
      const { data: stream, error: streamError } = await supabase.from('streams').insert({ stream_date: streamDate, stream_slot: slot, sales, packs_used: totalPacks, total_cost: totalCost, profit: sales - totalCost }).select('id').single()
      if (streamError || !stream) throw new Error(streamError?.message || 'Stream could not be created')
      for (const row of productCosts) {
        const { data: product, error: productError } = await supabase.from('stream_products').insert({ stream_id: stream.id, set_id: row.set_id, packs_used: row.packs_used, cost_used: row.costUsed }).select('id').single()
        if (productError || !product) throw new Error(productError?.message || 'Stream product could not be created')
        for (const allocation of row.allocations) {
          const { error: allocationError } = await supabase.from('stream_allocations').insert({ stream_product_id: product.id, ...allocation })
          if (allocationError) throw new Error(allocationError.message)
          const { data: batch, error: batchError } = await supabase.from('pack_batches').select('packs_remaining').eq('id', allocation.batch_id).single()
          if (batchError || !batch) throw new Error(batchError?.message || 'Batch not found')
          const { error: updateError } = await supabase.from('pack_batches').update({ packs_remaining: Number(batch.packs_remaining || 0) - allocation.packs_used }).eq('id', allocation.batch_id)
          if (updateError) throw new Error(updateError.message)
        }
      }
      setStreamSales(''); setProductRows([{ set_id: '', packs_used: '' }]); setSelectedDate(streamDate); setTab('calendar'); setMessage('Stream saved'); loadData()
    } catch (error: any) { setMessage(error?.message || 'Stream save failed') }
  }

  async function deleteStream(streamId: string) {
    if (!window.confirm('Delete this stream and restore the packs back into their purchase batches?')) return
    try {
      const { data: products } = await supabase.from('stream_products').select('id').eq('stream_id', streamId)
      const productIds = (products || []).map((p: any) => p.id)
      if (productIds.length) {
        const { data: allocations } = await supabase.from('stream_allocations').select('*').in('stream_product_id', productIds)
        for (const allocation of allocations || []) {
          const { data: batch } = await supabase.from('pack_batches').select('packs_remaining').eq('id', allocation.batch_id).single()
          await supabase.from('pack_batches').update({ packs_remaining: Number(batch?.packs_remaining || 0) + Number(allocation.packs_used || 0) }).eq('id', allocation.batch_id)
        }
      }
      const { error } = await supabase.from('streams').delete().eq('id', streamId)
      if (error) throw new Error(error.message)
      setMessage('Stream deleted and packs restored'); loadData()
    } catch (error: any) { setMessage(error?.message || 'Delete failed') }
  }

  function changeMonth(amount: number) { const next = new Date(selectedYear, selectedMonth + amount, 1); setSelectedYear(next.getFullYear()); setSelectedMonth(next.getMonth()) }
  function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div> }

  return (
    <AdminGuard>
      <main className="page">
        <style jsx>{`
          .page{min-height:100vh;background:radial-gradient(circle at top,#15157a 0%,#06063d 45%,#02021f 100%);color:white;padding:24px}.wrap{max-width:1180px;margin:0 auto}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}h1{margin:0;font-size:clamp(2rem,5vw,3.4rem);font-weight:950;letter-spacing:-1px}.sub{color:rgba(255,255,255,.72);font-weight:750;margin-top:6px}.actions,.tabs,.row-actions{display:flex;flex-wrap:wrap;gap:10px}.button,.tab{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;text-decoration:none}.button.primary,.tab.active{background:linear-gradient(135deg,#7c3aed,#c084fc);box-shadow:0 10px 24px rgba(124,58,237,.32)}.button.danger{background:rgba(239,68,68,.16);border-color:rgba(248,113,113,.45);color:#fecaca}.tabs{margin-bottom:18px}.message{margin:0 0 16px;color:rgba(255,255,255,.82);font-weight:850}.panel{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);border-radius:22px;padding:18px;margin-bottom:16px;box-shadow:0 18px 56px rgba(0,0,0,.28)}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}.stat-card{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);border-radius:18px;padding:14px}.stat-label{color:rgba(255,255,255,.66);font-size:.72rem;font-weight:950;text-transform:uppercase;letter-spacing:1px}.stat-value{margin-top:6px;font-size:1.45rem;font-weight:950}.stat-sub{margin-top:4px;color:rgba(255,255,255,.65);font-size:.8rem;font-weight:800}.calendar-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.calendar-title{font-size:1.35rem;font-weight:950}.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}.day-card{min-height:146px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.055);border-radius:18px;padding:12px;cursor:pointer;text-align:left;color:white}.day-card:hover,.day-card.selected{border-color:rgba(192,132,252,.55);background:rgba(124,58,237,.13)}.day-date{font-weight:950;margin-bottom:9px}.day-stat{font-size:.82rem;color:rgba(255,255,255,.78);font-weight:800;margin-top:5px}.day-profit{color:#bbf7d0;font-weight:950}.form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field label{display:block;margin-bottom:7px;color:rgba(255,255,255,.68);font-size:.72rem;text-transform:uppercase;letter-spacing:1px;font-weight:950}.input,.select{width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:white;padding:12px 13px;font-weight:800;outline:none}.product-row{display:grid;grid-template-columns:1fr 160px auto;gap:10px;align-items:end;margin-top:10px}.table{display:flex;flex-direction:column;gap:8px}.table-row{display:grid;grid-template-columns:1fr repeat(4,130px) auto;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:16px;padding:12px}.table-title{font-weight:950}.muted{color:rgba(255,255,255,.66);font-size:.82rem;font-weight:750;margin-top:4px}.performance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}@media(max-width:860px){.page{padding:14px}.top,.calendar-head{flex-direction:column;align-items:flex-start}.calendar-grid{grid-template-columns:1fr}.form-grid,.product-row,.table-row{grid-template-columns:1fr}}
        `}</style>
        <div className="wrap">
          <header className="top"><div><h1>Stream Calendar</h1><div className="sub">Sales, packs and profit — with FIFO pack costing by set.</div></div><div className="actions"><Link href="/admin" className="button">← Admin</Link><button className="button" onClick={loadData}>Refresh</button></div></header>
          <nav className="tabs"><button className={`tab ${tab==='calendar'?'active':''}`} onClick={()=>setTab('calendar')}>📅 Calendar</button><button className={`tab ${tab==='entry'?'active':''}`} onClick={()=>setTab('entry')}>➕ Add Stream</button><button className={`tab ${tab==='purchased'?'active':''}`} onClick={()=>setTab('purchased')}>📦 Purchased</button><button className={`tab ${tab==='performance'?'active':''}`} onClick={()=>setTab('performance')}>📈 Performance</button></nav>
          {message && <div className="message">{message}</div>}
          {tab==='calendar' && <><section className="stats-grid"><StatCard label="Month Sales" value={money(monthTotals.sales)}/><StatCard label="Month Packs" value={String(monthTotals.packs)}/><StatCard label="Month Profit" value={money(monthTotals.profit)}/><StatCard label="Streams" value={String(monthTotals.count)}/></section><section className="panel"><div className="calendar-head"><div className="calendar-title">{monthLabel(selectedYear,selectedMonth)}</div><div className="row-actions"><button className="button" onClick={()=>changeMonth(-1)}>Previous</button><button className="button" onClick={()=>changeMonth(1)}>Next</button></div></div><div className="calendar-grid">{monthDays.map((day)=>{const totals=sumStreams(streamsByDate.get(day)||[]);return <button key={day} className={`day-card ${selectedDate===day?'selected':''}`} onClick={()=>setSelectedDate(day)}><div className="day-date">{dayName(day)} {parseLocalDate(day).getDate()}</div><div className="day-stat">Sales: {money(totals.sales)}</div><div className="day-stat">Packs: {totals.packs}</div><div className="day-stat day-profit">Profit: {money(totals.profit)}</div><div className="muted">{totals.count} stream(s)</div></button>})}</div></section><section className="panel"><h2>{fullDate(selectedDate)}</h2><div className="stats-grid"><StatCard label="Sales" value={money(selectedDayTotals.sales)}/><StatCard label="Packs" value={String(selectedDayTotals.packs)}/><StatCard label="Cost" value={money(selectedDayTotals.cost)}/><StatCard label="Profit" value={money(selectedDayTotals.profit)}/></div><div className="table">{selectedDayStreams.map((stream)=><div className="table-row" key={stream.id}><div><div className="table-title">Stream {stream.stream_slot}</div><div className="muted">{stream.stream_date}</div></div><div>Sales {money(stream.sales)}</div><div>Packs {stream.packs_used}</div><div>Cost {money(stream.total_cost)}</div><div>Profit {money(stream.profit)}</div><button className="button danger" onClick={()=>deleteStream(stream.id)}>Delete</button></div>)}{selectedDayStreams.length===0&&<div className="muted">No streams recorded for this day.</div>}</div></section></>}
          {tab==='entry' && <section className="panel"><h2>Add Stream</h2><div className="form-grid"><div className="field"><label>Stream Date</label><input className="input" type="date" value={streamDate} onChange={(e)=>setStreamDate(e.target.value)}/></div><div className="field"><label>Stream Slot</label><select className="select" value={streamSlot} onChange={(e)=>setStreamSlot(e.target.value)}><option value="1">Stream 1</option><option value="2">Stream 2</option></select></div><div className="field"><label>Sales</label><input className="input" type="number" value={streamSales} onChange={(e)=>setStreamSales(e.target.value)} placeholder="0.00"/></div></div><div style={{marginTop:18}}><h3>Products Used</h3>{productRows.map((row,index)=><div className="product-row" key={index}><div className="field"><label>Set</label><select className="select" value={row.set_id} onChange={(e)=>updateProductRow(index,'set_id',e.target.value)}><option value="">Choose set...</option>{sets.map((set)=><option key={set.id} value={set.id}>{set.name}</option>)}</select></div><div className="field"><label>Packs Used</label><input className="input" type="number" value={row.packs_used} onChange={(e)=>updateProductRow(index,'packs_used',e.target.value)}/></div><button className="button danger" onClick={()=>removeProductRow(index)}>Remove</button></div>)}<div className="row-actions" style={{marginTop:14}}><button className="button" onClick={addProductRow}>Add another set</button><button className="button primary" onClick={saveStream}>Save Stream</button></div></div></section>}
          {tab==='purchased' && <><section className="panel"><h2>Add Set</h2><div className="product-row"><div className="field"><label>Set Name</label><input className="input" value={newSetName} onChange={(e)=>setNewSetName(e.target.value)} placeholder="Prismatic Evolutions"/></div><button className="button primary" onClick={addSet}>Add Set</button></div></section><section className="panel"><h2>Add Purchase Batch</h2><div className="form-grid"><div className="field"><label>Set</label><select className="select" value={purchaseSetId} onChange={(e)=>setPurchaseSetId(e.target.value)}><option value="">Choose set...</option>{sets.map((set)=><option key={set.id} value={set.id}>{set.name}</option>)}</select></div><div className="field"><label>Purchase Date</label><input className="input" type="date" value={purchaseDate} onChange={(e)=>setPurchaseDate(e.target.value)}/></div><div className="field"><label>Packs Bought</label><input className="input" type="number" value={purchasePacks} onChange={(e)=>setPurchasePacks(e.target.value)}/></div><div className="field"><label>Total Cost</label><input className="input" type="number" value={purchaseCost} onChange={(e)=>setPurchaseCost(e.target.value)}/></div></div><div style={{marginTop:14}}><button className="button primary" onClick={addPurchase}>Save Purchase</button></div></section><section className="panel"><h2>Purchase Batches</h2><div className="table">{batches.map((batch)=><div className="table-row" key={batch.id}><div><div className="table-title">{batch.stream_sets?.name || 'Unknown Set'}</div><div className="muted">{batch.purchase_date}</div></div><div>{batch.packs_remaining}/{batch.packs_bought} packs</div><div>Total {money(batch.total_cost)}</div><div>{money(batch.cost_per_pack)} / pack</div><div></div></div>)}</div></section></>}
          {tab==='performance' && <><section className="stats-grid"><StatCard label="Current Payrun Profit" value={money(currentPayrun.profit)} sub={`${payrun.start} → ${payrun.end}`}/><StatCard label="Previous Payrun Profit" value={money(previousPayrun.profit)} sub={`${payrun.previousStart} → ${payrun.previousEnd}`}/><StatCard label="Payrun Change" value={`${payrunChange>=0?'+':''}${payrunChange.toFixed(1)}%`}/><StatCard label="All-Time Profit" value={money(allTime.profit)}/></section><section className="panel"><h2>Current Payrun</h2><div className="stats-grid"><StatCard label="Sales" value={money(currentPayrun.sales)}/><StatCard label="Packs" value={String(currentPayrun.packs)}/><StatCard label="Profit" value={money(currentPayrun.profit)}/><StatCard label="Streams" value={String(currentPayrun.count)}/></div></section><section className="panel"><h2>Profit By Day Of Week</h2><div className="performance-grid">{profitByDay.map((item)=><StatCard key={item.day} label={item.day} value={money(item.average)} sub={`${item.count} stream(s) · ${money(item.total)} total`}/>)}</div></section><section className="panel"><h2>Best Days Ever</h2><div className="table">{bestDays.map((item,index)=><div className="table-row" key={item.date}><div><div className="table-title">#{index+1} {fullDate(item.date)}</div></div><div>Sales {money(item.sales)}</div><div>Packs {item.packs}</div><div>Profit {money(item.profit)}</div><div></div></div>)}</div></section><section className="panel"><h2>All-Time Stats</h2><div className="stats-grid"><StatCard label="All-Time Sales" value={money(allTime.sales)}/><StatCard label="All-Time Packs" value={String(allTime.packs)}/><StatCard label="All-Time Profit" value={money(allTime.profit)}/><StatCard label="Average Stream Profit" value={money(allTime.count ? allTime.profit / allTime.count : 0)}/></div></section></>}
        </div>
      </main>
    </AdminGuard>
  )
}
