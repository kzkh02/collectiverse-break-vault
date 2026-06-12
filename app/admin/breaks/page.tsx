'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'

function formatStreamDateTime(value: string | null) {
  if (!value) return 'No stream time set'

  const date = new Date(value)

  return date.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function BreaksPage() {
  const [openBreaks, setOpenBreaks] = useState<any[]>([])
  const [completedBreaks, setCompletedBreaks] = useState<any[]>([])

  const [stats, setStats] = useState({
    totalBreaks: 0,
    openBreaks: 0,
    completedBreaks: 0,
    totalCollectors: 0,
    totalEntries: 0,
    totalHits: 0,
    reverseHolos: 0,
    ex: 0,
    sr: 0,
    mar: 0,
    sir: 0,
    gold: 0,
    chaseHits: 0,
  })

  async function countRows(table: string, filters?: { column: string; value: any }[]) {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })

    filters?.forEach((filter) => {
      query = query.eq(filter.column, filter.value)
    })

    const { count } = await query
    return count || 0
  }

  async function loadDashboard() {
    const { data: openData } = await supabase
  .from('breaks')
  .select('*')
  .eq('status', 'open')
  .order('stream_datetime', { ascending: false })
  .order('break_name', { ascending: true })

const { data: completedData } = await supabase
  .from('breaks')
  .select('*')
  .eq('status', 'completed')
  .order('stream_datetime', { ascending: false })
  .order('break_name', { ascending: true })

    setOpenBreaks(openData || [])
    setCompletedBreaks(completedData || [])

    const [
      totalBreaks,
      totalCollectors,
      totalEntries,
      totalHits,
      reverseHolos,
      ex,
      sr,
      mar,
      sir,
      gold,
      chaseHits,
    ] = await Promise.all([
      countRows('breaks'),
      countRows('collectors'),
      countRows('entries'),
      countRows('entries', [{ column: 'is_hit', value: true }]),
      countRows('entries', [{ column: 'hit_tier', value: 'reverse_holo' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'ex' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'sr' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'mar' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'sir' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'gold' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'chase_hit' }]),
    ])

    setStats({
      totalBreaks,
      openBreaks: openData?.length || 0,
      completedBreaks: completedData?.length || 0,
      totalCollectors,
      totalEntries,
      totalHits,
      reverseHolos,
      ex,
      sr,
      mar,
      sir,
      gold,
      chaseHits,
    })
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  function BreakCard({ item }: { item: any }) {
    return (
      <Link
        href={`/admin/breaks/${item.id}`}
        style={{
          display: 'block',
          border: '1px solid #ddd',
          padding: 16,
          marginTop: 10,
          borderRadius: 8,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <strong>{item.break_name}</strong>
        <div style={{ marginTop: 6 }}>
          Stream: {formatStreamDateTime(item.stream_datetime)}
        </div>
        <div>Status: {item.status || 'open'}</div>
      </Link>
    )
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Collectiverse Break Vault Admin</h1>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 20 }}>
        <h2>Lifetime Admin Statistics</h2>

        <p>Total Breaks: {stats.totalBreaks}</p>
        <p>Open Breaks: {stats.openBreaks}</p>
        <p>Completed Breaks: {stats.completedBreaks}</p>
        <p>Total Collectors: {stats.totalCollectors}</p>
        <p>Total Spots Imported: {stats.totalEntries}</p>
        <p>Total Hits Recorded: {stats.totalHits}</p>

        <h3>Hits by Tier</h3>
        <p>🔥 Chase Hits: {stats.chaseHits}</p>
        <p>🥇 Gold: {stats.gold}</p>
        <p>👑 SIR: {stats.sir}</p>
        <p>⭐ MAR: {stats.mar}</p>
        <p>💎 SR: {stats.sr}</p>
        <p>✨ EX: {stats.ex}</p>
        <p>🌈 Reverse Holos: {stats.reverseHolos}</p>
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>📦 Open Breaks ({stats.openBreaks})</h2>

        {openBreaks.map((item) => (
          <BreakCard key={item.id} item={item} />
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        <h2>✅ Completed Breaks ({stats.completedBreaks})</h2>

        {completedBreaks.map((item) => (
          <BreakCard key={item.id} item={item} />
        ))}
      </div>
    </main>
  )
}