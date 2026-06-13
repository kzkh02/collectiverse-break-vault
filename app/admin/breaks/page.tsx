'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import AdminGuard from '../AdminGuard'

type BreakFilter = 'open' | 'completed' | 'all'

type BreakRow = {
  id: string
  break_name: string | null
  status: string | null
  stream_datetime: string | null
}

function formatStreamDateTime(value: string | null) {
  if (!value) return 'No stream time set'

  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function BreaksPage() {
  const [breaks, setBreaks] = useState<BreakRow[]>([])
  const [message, setMessage] = useState('Loading breaks...')
  const [filter, setFilter] = useState<BreakFilter>('open')
  const [search, setSearch] = useState('')
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
    ir: 0,
    mar: 0,
    sir: 0,
    gold: 0,
  })

  async function countRows(table: string, filters?: { column: string; value: any }[]) {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })

    filters?.forEach((item) => {
      query = query.eq(item.column, item.value)
    })

    const { count } = await query
    return count || 0
  }

  async function loadDashboard() {
    setMessage('Loading breaks...')

    const { data: breaksData, error } = await supabase
      .from('breaks')
      .select('*')
      .order('stream_datetime', { ascending: false })
      .order('break_name', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setBreaks((breaksData || []) as BreakRow[])

    const [
      totalBreaks,
      totalCollectors,
      totalEntries,
      totalHits,
      reverseHolos,
      ex,
      sr,
      ir,
      mar,
      sir,
      gold,
    ] = await Promise.all([
      countRows('breaks'),
      countRows('collectors'),
      countRows('entries'),
      countRows('entries', [{ column: 'is_hit', value: true }]),
      countRows('entries', [{ column: 'hit_tier', value: 'reverse_holo' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'ex' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'sr' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'ir' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'mar' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'sir' }]),
      countRows('entries', [{ column: 'hit_tier', value: 'gold' }]),
    ])

    const openBreaks = (breaksData || []).filter((item: any) => item.status !== 'completed').length
    const completedBreaks = (breaksData || []).filter((item: any) => item.status === 'completed').length

    setStats({
      totalBreaks,
      openBreaks,
      completedBreaks,
      totalCollectors,
      totalEntries,
      totalHits,
      reverseHolos,
      ex,
      sr,
      ir,
      mar,
      sir,
      gold,
    })

    setMessage('')
  }

  const filteredBreaks = useMemo(() => {
    const query = search.toLowerCase().trim()

    return breaks.filter((item) => {
      const status = item.status || 'open'
      const matchesFilter =
        filter === 'all' ||
        (filter === 'open' && status !== 'completed') ||
        (filter === 'completed' && status === 'completed')

      const matchesSearch =
        !query ||
        String(item.break_name || '').toLowerCase().includes(query) ||
        formatStreamDateTime(item.stream_datetime).toLowerCase().includes(query)

      return matchesFilter && matchesSearch
    })
  }, [breaks, filter, search])

  useEffect(() => {
    loadDashboard()
  }, [])

  function StatCard({ label, value, emoji }: { label: string; value: number; emoji: string }) {
    return (
      <div className="stat-card">
        <div className="stat-emoji">{emoji}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    )
  }

  function BreakCard({ item }: { item: BreakRow }) {
    const isCompleted = item.status === 'completed'

    return (
      <Link className="break-card" href={`/admin/breaks/${item.id}`}>
        <div>
          <div className="break-name">{item.break_name || 'Untitled Break'}</div>
          <div className="break-meta">{formatStreamDateTime(item.stream_datetime)}</div>
        </div>

        <div className={`status-pill ${isCompleted ? 'completed' : 'open'}`}>
          {isCompleted ? 'Completed' : 'Open'}
        </div>
      </Link>
    )
  }

  return (
    <AdminGuard>
      <main className="admin-page">
      <style jsx global>{`
        .admin-page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #15157a 0%, #07063f 45%, #02021f 100%);
          color: white;
          padding: 24px;
          font-size: 0.92rem;
        }

        .admin-wrap {
          max-width: 1120px;
          margin: 0 auto;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 22px;
        }

        .admin-header h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3.3rem);
          font-weight: 950;
          letter-spacing: -1px;
        }

        .admin-header p {
          margin: 8px 0 0;
          color: rgba(255,255,255,.72);
          font-weight: 750;
        }

        .admin-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .admin-button {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.08);
          color: white;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
        }

        .admin-button.primary {
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 10px 24px rgba(124,58,237,.32);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }

        .stat-card {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 16px 42px rgba(0,0,0,.24);
        }

        .stat-emoji { font-size: 1.25rem; }
        .stat-value { margin-top: 8px; font-size: 1.6rem; font-weight: 950; }
        .stat-label { color: rgba(255,255,255,.68); font-weight: 800; font-size: .78rem; }

        .panel {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 22px;
          padding: 18px;
          margin-bottom: 18px;
          box-shadow: 0 18px 52px rgba(0,0,0,.28);
        }

        .tools {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
        }

        .search-input {
          width: 100%;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.25);
          color: white;
          border-radius: 14px;
          padding: 12px 14px;
          font-weight: 800;
          outline: none;
        }

        .filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .filter-button {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          color: white;
          border-radius: 999px;
          padding: 9px 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .filter-button.active {
          background: linear-gradient(135deg, #7c3aed, #c084fc);
        }

        .message {
          margin: 10px 0 16px;
          color: rgba(255,255,255,.75);
          font-weight: 850;
        }

        .break-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .break-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.055);
          border-radius: 18px;
          padding: 16px;
          color: white;
          text-decoration: none;
          box-shadow: 0 14px 38px rgba(0,0,0,.20);
        }

        .break-card:hover {
          border-color: rgba(192,132,252,.55);
          background: rgba(124,58,237,.12);
        }

        .break-name {
          font-weight: 950;
          font-size: 1rem;
        }

        .break-meta {
          margin-top: 5px;
          color: rgba(255,255,255,.7);
          font-weight: 750;
          font-size: .84rem;
        }

        .status-pill {
          border-radius: 999px;
          padding: 7px 11px;
          font-size: .75rem;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,.18);
          white-space: nowrap;
        }

        .status-pill.open {
          color: #d8b4fe;
          background: rgba(168,85,247,.14);
        }

        .status-pill.completed {
          color: #bbf7d0;
          background: rgba(34,197,94,.14);
        }

        @media (max-width: 760px) {
          .admin-page { padding: 14px; }
          .admin-header { flex-direction: column; }
          .admin-actions { justify-content: flex-start; }
          .tools { grid-template-columns: 1fr; }
          .break-card { align-items: flex-start; flex-direction: column; }
        }
      `}</style>

      <div className="admin-wrap">
        <header className="admin-header">
          <div>
            <h1>Breaks Admin</h1>
            <p>Manage imports, hits, featured pulls and completed breaks.</p>
          </div>

          <div className="admin-actions">
            <Link className="admin-button primary" href="/admin/import">
              Import CSV
            </Link>
            <button className="admin-button" onClick={loadDashboard}>
              Refresh
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <StatCard emoji="📦" label="Total Breaks" value={stats.totalBreaks} />
          <StatCard emoji="🟣" label="Open Breaks" value={stats.openBreaks} />
          <StatCard emoji="✅" label="Completed" value={stats.completedBreaks} />
          <StatCard emoji="👥" label="Collectors" value={stats.totalCollectors} />
          <StatCard emoji="🎟️" label="Spots Imported" value={stats.totalEntries} />
          <StatCard emoji="🔥" label="Hits Recorded" value={stats.totalHits} />
          <StatCard emoji="👑" label="SIR" value={stats.sir} />
          <StatCard emoji="🥇" label="Gold" value={stats.gold} />
          <StatCard emoji="🌌" label="MAR" value={stats.mar} />
          <StatCard emoji="⭐" label="IR" value={stats.ir} />
          <StatCard emoji="💎" label="SR" value={stats.sr} />
          <StatCard emoji="✨" label="EX" value={stats.ex} />
          <StatCard emoji="🌈" label="Reverse Holos" value={stats.reverseHolos} />
        </section>

        <section className="panel">
          <div className="tools">
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search breaks..."
            />

            <div className="filter-row">
              <button className={`filter-button ${filter === 'open' ? 'active' : ''}`} onClick={() => setFilter('open')}>
                Open ({stats.openBreaks})
              </button>
              <button className={`filter-button ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>
                Completed ({stats.completedBreaks})
              </button>
              <button className={`filter-button ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All ({stats.totalBreaks})
              </button>
            </div>
          </div>
        </section>

        {message && <div className="message">{message}</div>}

        <section className="break-list">
          {filteredBreaks.map((item) => (
            <BreakCard key={item.id} item={item} />
          ))}

          {filteredBreaks.length === 0 && !message && (
            <div className="panel">No breaks found.</div>
          )}
        </section>
      </div>
      </main>
    </AdminGuard>
  )
}
