'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

type Tab = 'latest' | 'lifetime' | 'hall'
type HitTier = 'sir' | 'gold' | 'mar' | 'ir' | 'sr' | 'ex'
type RankKey = 'overall' | HitTier
type RankTotals = Record<RankKey, number>

type HallOfFameCollector = {
  collectorId: string
  name: string
  totalHits: number
  rank: number
  title: string
}

type CollectorBadge = {
  label: string
  icon: string
  unlocked: boolean
}

const tierLabels: Record<string, string> = {
  sir: 'SIR',
  gold: 'GOLD',
  mar: 'MAR',
  ir: 'IR',
  sr: 'SR',
  ex: 'EX',
  reverse_holo: 'REVERSE HOLO',
}

const hitTiers: HitTier[] = ['sir', 'gold', 'mar', 'ir', 'sr', 'ex']
const showcaseTiers = ['sir', 'gold', 'mar']

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

function dateValue(value: string | null) {
  if (!value) return todayDate()
  return value.split('T')[0]
}

function formatDate(value: string | null) {
  if (!value) return 'Unknown date'

  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getBreakInfo(name: string | null) {
  const cleaned = String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const breakMatch = cleaned.match(/Break\s+(\d+)/i)
  const setName = cleaned.replace(/Break\s+\d+/i, '').trim()

  return {
    setName,
    breakNumber: breakMatch?.[1] || '',
  }
}

function getTierClass(tier: string | null) {
  const cleanTier = String(tier || '').toLowerCase().trim()

  switch (cleanTier) {
    case 'sir':
      return 'hit-sir'
    case 'gold':
      return 'hit-gold'
    case 'mar':
      return 'hit-mar'
    case 'ir':
      return 'hit-ir'
    case 'sr':
      return 'hit-sr'
    case 'ex':
      return 'hit-ex'
    default:
      return 'hit-default'
  }
}

function getTierEmoji(tier: string | null) {
  switch (tier) {
    case 'sir':
      return '👑'
    case 'gold':
      return '🥇'
    case 'mar':
      return '🌌'
    case 'ir':
      return '⭐'
    case 'sr':
      return '💎'
    case 'ex':
      return '✨'
    default:
      return '🎴'
  }
}

function getCollectorTitle(rank: number | null) {
  if (!rank) return 'Unranked Collector'
  if (rank === 1) return 'Collectiverse Champion 👑'
  if (rank <= 3) return 'Podium Legend 🏆'
  if (rank <= 10) return 'Hall of Fame Elite ⭐'
  if (rank <= 25) return 'Master Collector 💎'
  if (rank <= 50) return 'Vault Veteran 🚀'
  if (rank <= 100) return 'Elite Breaker 🔥'
  if (rank <= 250) return 'Rare Hunter 🌌'
  if (rank <= 500) return 'Hit Chaser ✨'
  if (rank <= 1000) return 'Rising Collector 📈'
  return 'Collector in the Making 🎴'
}

function getEmptyRankTotals(): RankTotals {
  return {
    overall: 0,
    sir: 0,
    gold: 0,
    mar: 0,
    ir: 0,
    sr: 0,
    ex: 0,
  }
}

function getNextHitMilestone(totalHits: number) {
  const milestones = [1, 10, 25, 50, 100, 250, 500, 1000]
  const nextTarget = milestones.find((milestone) => milestone > totalHits)

  if (!nextTarget) {
    return {
      label: 'Legendary Vault Status',
      target: totalHits || 1,
      remaining: 0,
      complete: true,
    }
  }

  return {
    label: `${nextTarget} Lifetime Hits`,
    target: nextTarget,
    remaining: nextTarget - totalHits,
    complete: false,
  }
}

function getPermanentBadges(counts: RankTotals): CollectorBadge[] {
  return [
    { icon: '🎯', label: 'First Hit', unlocked: counts.overall >= 1 },
    { icon: '🔥', label: '10 Hits Club', unlocked: counts.overall >= 10 },
    { icon: '🏆', label: '25 Hits Club', unlocked: counts.overall >= 25 },
    { icon: '💎', label: '50 Hits Club', unlocked: counts.overall >= 50 },
    { icon: '🚀', label: '100 Hits Club', unlocked: counts.overall >= 100 },
    { icon: '🌌', label: '250 Hits Club', unlocked: counts.overall >= 250 },
    { icon: '👑', label: '500 Hits Club', unlocked: counts.overall >= 500 },

    { icon: '👑', label: 'SIR Hunter', unlocked: counts.sir >= 1 },
    { icon: '🌈', label: 'SIR Master', unlocked: counts.sir >= 5 },
    { icon: '🥇', label: 'Gold Hunter', unlocked: counts.gold >= 3 },
    { icon: '🏅', label: 'Gold Master', unlocked: counts.gold >= 10 },
    { icon: '🌌', label: 'MAR Hunter', unlocked: counts.mar >= 5 },
    { icon: '✨', label: 'MAR Master', unlocked: counts.mar >= 15 },
    { icon: '⭐', label: 'IR Specialist', unlocked: counts.ir >= 10 },
    { icon: '💫', label: 'SR Specialist', unlocked: counts.sr >= 10 },
    { icon: '⚡', label: 'EX Veteran', unlocked: counts.ex >= 25 },
  ]
}

function getStatusBadges(rank: number | null): CollectorBadge[] {
  return [
    { icon: '🏛️', label: 'Top 100 Collector', unlocked: !!rank && rank <= 100 },
    { icon: '🔥', label: 'Top 50 Collector', unlocked: !!rank && rank <= 50 },
    { icon: '💎', label: 'Top 25 Collector', unlocked: !!rank && rank <= 25 },
    { icon: '⭐', label: 'Top 10 Collector', unlocked: !!rank && rank <= 10 },
    { icon: '🥉', label: 'Podium Collector', unlocked: !!rank && rank <= 3 },
    { icon: '👑', label: 'Collectiverse Champion', unlocked: rank === 1 },
  ]
}

export default function VaultPage() {
  const params = useParams()
  const username = params.username as string

  const [tab, setTab] = useState<Tab>('latest')
  const [selectedDate, setSelectedDate] = useState(todayDate())
  const [collector, setCollector] = useState<any>(null)
  const [hits, setHits] = useState<any[]>([])
  const [hallOfFame, setHallOfFame] = useState<HallOfFameCollector[]>([])
  const [bestHitIndex, setBestHitIndex] = useState(0)
  const [message, setMessage] = useState('Loading vault...')

  const [ranks, setRanks] = useState<Record<RankKey, number | null>>({
    overall: null,
    sir: null,
    gold: null,
    mar: null,
    ir: null,
    sr: null,
    ex: null,
  })

  async function loadVault() {
    const normalisedUsername = username.toLowerCase().trim()

    const { data: collectorData } = await supabase
      .from('collectors')
      .select('*')
      .eq('whatnot_name_normalized', normalisedUsername)
      .maybeSingle()

    if (!collectorData) {
      setMessage('No vault found for this Whatnot username yet.')
      return
    }

    setCollector(collectorData)

    const { data: allEntries } = await supabase
      .from('entries')
      .select('*')
      .eq('collector_id', collectorData.id)

    if (!allEntries || allEntries.length === 0) {
      setMessage('No break entries found yet.')
      return
    }

    const breakIds = [
      ...new Set(allEntries.map((entry) => entry.break_id).filter(Boolean)),
    ]

    const { data: breaks } =
      breakIds.length > 0
        ? await supabase
            .from('breaks')
            .select('*')
            .in('id', breakIds)
            .order('stream_datetime', { ascending: false })
        : { data: [] }

    const breakMap: Record<string, any> = {}

    ;(breaks || []).forEach((breakItem) => {
      breakMap[breakItem.id] = breakItem
    })

    const { data: allHits } = await supabase
      .from('entries')
      .select('*')
      .eq('collector_id', collectorData.id)
      .eq('is_hit', true)
      .neq('hit_tier', 'reverse_holo')
      .order('revealed_at', { ascending: false })

    const hitsWithBreaks = (allHits || []).map((hit) => ({
      ...hit,
      break_name: breakMap[hit.break_id]?.break_name || 'Unknown Break',
      stream_datetime: breakMap[hit.break_id]?.stream_datetime || null,
    }))

    setHits(hitsWithBreaks)

    const { data: allHitEntries } = await supabase
      .from('entries')
      .select('collector_id, hit_tier')
      .eq('is_hit', true)
      .neq('hit_tier', 'reverse_holo')

    const totals: Record<string, RankTotals> = {}

    ;(allHitEntries || []).forEach((entry) => {
      if (!totals[entry.collector_id]) {
        totals[entry.collector_id] = getEmptyRankTotals()
      }

      totals[entry.collector_id].overall += 1

      if (hitTiers.includes(entry.hit_tier as HitTier)) {
        totals[entry.collector_id][entry.hit_tier as HitTier] += 1
      }
    })

    const collectorIds = Object.keys(totals)

    const { data: collectorNames } =
      collectorIds.length > 0
        ? await supabase
            .from('collectors')
            .select('id, whatnot_name')
            .in('id', collectorIds)
        : { data: [] }

    const collectorNameMap: Record<string, string> = {}

    ;(collectorNames || []).forEach((item) => {
      collectorNameMap[item.id] = item.whatnot_name
    })

    function getRank(type: RankKey) {
      const currentCount = totals[collectorData.id]?.[type] || 0

      if (currentCount === 0) return null

      return (
        Object.values(totals).filter(
          (collectorTotals) => collectorTotals[type] > currentCount
        ).length + 1
      )
    }

    const currentRanks = {
      overall: getRank('overall'),
      sir: getRank('sir'),
      gold: getRank('gold'),
      mar: getRank('mar'),
      ir: getRank('ir'),
      sr: getRank('sr'),
      ex: getRank('ex'),
    }

    setRanks(currentRanks)

    setHallOfFame(
      Object.entries(totals)
        .map(([collectorId, collectorTotals]) => {
          const rank =
            Object.values(totals).filter(
              (otherTotals) => otherTotals.overall > collectorTotals.overall
            ).length + 1

          return {
            collectorId,
            name: collectorNameMap[collectorId] || 'Unknown Collector',
            totalHits: collectorTotals.overall,
            rank,
            title: getCollectorTitle(rank),
          }
        })
        .sort((a, b) => {
          if (b.totalHits !== a.totalHits) return b.totalHits - a.totalHits
          return a.name.localeCompare(b.name)
        })
        .slice(0, 10)
    )

    const newestBreak = breaks?.[0]

    if (newestBreak) {
      setSelectedDate(dateValue(newestBreak.stream_datetime))
    }

    setMessage('')
  }

  useEffect(() => {
    loadVault()
  }, [])

  const counts: RankTotals = {
    overall: hits.length,
    sir: hits.filter((h) => h.hit_tier === 'sir').length,
    gold: hits.filter((h) => h.hit_tier === 'gold').length,
    mar: hits.filter((h) => h.hit_tier === 'mar').length,
    ir: hits.filter((h) => h.hit_tier === 'ir').length,
    sr: hits.filter((h) => h.hit_tier === 'sr').length,
    ex: hits.filter((h) => h.hit_tier === 'ex').length,
  }

  const collectorTitle = getCollectorTitle(ranks.overall)
  const nextMilestone = getNextHitMilestone(counts.overall)
  const permanentBadges = getPermanentBadges(counts)
  const statusBadges = getStatusBadges(ranks.overall)

  const bestHits = hits
    .filter((hit) => showcaseTiers.includes(hit.hit_tier))
    .sort((a, b) => {
      const order: Record<string, number> = { sir: 1, gold: 2, mar: 3 }
      const tierSort = order[a.hit_tier] - order[b.hit_tier]

      if (tierSort !== 0) return tierSort

      return (
        new Date(b.revealed_at || b.stream_datetime || 0).getTime() -
        new Date(a.revealed_at || a.stream_datetime || 0).getTime()
      )
    })

  const currentBestHit = bestHits[bestHitIndex] || null

  useEffect(() => {
    if (bestHits.length <= 1) return

    const timer = window.setInterval(() => {
      setBestHitIndex((currentIndex) => (currentIndex + 1) % bestHits.length)
    }, 4000)

    return () => window.clearInterval(timer)
  }, [bestHits.length])

  useEffect(() => {
    if (bestHitIndex > bestHits.length - 1) {
      setBestHitIndex(0)
    }
  }, [bestHitIndex, bestHits.length])

  const enteredBreakDates = [
    ...new Set(hits.map((hit) => dateValue(hit.stream_datetime))),
  ]

  const selectedDateHits = hits.filter((hit) =>
    hit.stream_datetime?.startsWith(selectedDate)
  )

  const selectedMonth = new Date(selectedDate)
  const year = selectedMonth.getFullYear()
  const month = selectedMonth.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const calendarDays = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const calendarItems = calendarDays.map((day, index) => {
    if (!day) {
      return {
        key: `empty-${index}`,
        day: null,
        date: '',
        hasBreak: false,
        isSelected: false,
      }
    }

    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(
      day
    ).padStart(2, '0')}`

    return {
      key: date,
      day,
      date,
      hasBreak: enteredBreakDates.includes(date),
      isSelected: selectedDate === date,
    }
  })

  function changeMonth(amount: number) {
    const nextDate = new Date(year, month + amount, 1)
    setSelectedDate(dateValue(nextDate.toISOString()))
  }

  function changeBestHit(amount: number) {
    if (bestHits.length === 0) return

    setBestHitIndex((currentIndex) => {
      const nextIndex = currentIndex + amount

      if (nextIndex < 0) return bestHits.length - 1
      if (nextIndex >= bestHits.length) return 0

      return nextIndex
    })
  }

  function RankPill({ rank }: { rank: number | null }) {
    return <div className="rank-pill">{rank ? `Rank #${rank}` : 'Unranked'}</div>
  }

  function HitCard({ hit }: { hit: any }) {
    const tierClass = getTierClass(hit.hit_tier)
    const showCosmic = ['ir', 'mar', 'gold', 'sir'].includes(hit.hit_tier)
    const breakInfo = getBreakInfo(hit.break_name)

    return (
      <div className={`hit-card ${tierClass}`}>
        {showCosmic && (
          <div className="cosmic-stars">
            <span>✦</span>
            <span>✧</span>
            <span>✦</span>
            <span>✧</span>
          </div>
        )}

        {hit.hit_tier === 'gold' && (
          <div className="planet-field">
            <span>🪐</span>
            <span>🌕</span>
          </div>
        )}

        {hit.hit_tier === 'sir' && (
          <div className="rocket-field">
            <span>🚀</span>
            <span>☄️</span>
          </div>
        )}

        <div className="hit-content">
          <div className="hit-break">{breakInfo.setName}</div>

          {breakInfo.breakNumber && (
            <div className="break-number">BREAK {breakInfo.breakNumber}</div>
          )}

          <h3>{hit.spot_name}</h3>

          <div className={`hit-badge badge-${hit.hit_tier}`}>
            {tierLabels[hit.hit_tier] || hit.hit_tier}
          </div>
        </div>
      </div>
    )
  }

  function HitList({ items }: { items: any[] }) {
    if (items.length === 0) {
      return (
        <p style={{ opacity: 0.75 }}>
          No hits recorded here yet. Check back after the stream.
        </p>
      )
    }

    return (
      <div className="hit-grid">
        {items.map((hit) => (
          <HitCard key={hit.id} hit={hit} />
        ))}
      </div>
    )
  }

  return (
    <main className="page">
      <style jsx global>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
          color: white;
          padding: 24px;
        }

        .wrap {
          max-width: 980px;
          margin: 0 auto;
        }

        .header {
          margin-bottom: 28px;
        }

        .header h1 {
          margin: 0 0 6px;
          font-size: clamp(2rem, 5vw, 3.2rem);
          font-weight: 950;
          letter-spacing: -1px;
        }

        .header p {
          opacity: 0.9;
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.6;
          max-width: 700px;
          color: rgba(255,255,255,0.85);
        }

        .tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }

        .tab-button {
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          color: white;
          padding: 12px 16px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 800;
        }

        .tab-button.active {
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 12px 30px rgba(124,58,237,0.35);
        }

        .section-title {
          font-size: 1.8rem;
          font-weight: 900;
          letter-spacing: 1px;
          margin-bottom: 18px;
          text-transform: uppercase;
          background: linear-gradient(90deg, #ffffff, #d8b4fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subsection-title {
          font-size: 1.15rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          margin: 26px 0 16px;
          color: rgba(255,255,255,.92);
        }

        .section-divider {
          width: 100%;
          height: 1px;
          margin: 22px 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent);
        }

        .break-date-card {
          max-width: 700px;
          margin: 0 auto 30px;
          padding: 28px;
          text-align: center;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(124,58,237,.15), rgba(255,255,255,.04));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 20px 60px rgba(0,0,0,.35), 0 0 30px rgba(168,85,247,.15);
        }

        .calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 22px;
        }

        .calendar-month {
          text-align: center;
          font-size: clamp(1.2rem, 5vw, 1.8rem);
          font-weight: 950;
        }

        .calendar-nav {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          color: white;
          font-size: 1.8rem;
          font-weight: 950;
          cursor: pointer;
          line-height: 1;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 10px;
        }

        .calendar-day-label {
          text-align: center;
          opacity: 0.65;
          font-size: 0.8rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .calendar-day {
          height: 52px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.05);
          color: white;
          font-weight: 950;
          cursor: pointer;
        }

        .calendar-day.has-break {
          border: 1px solid rgba(250,204,21,.8);
          background: rgba(250,204,21,.16);
          box-shadow: 0 0 18px rgba(250,204,21,.28);
        }

        .calendar-day.selected {
          border: 2px solid #c084fc;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
        }

        .collector-showcase {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.2), transparent 30%),
            radial-gradient(circle at bottom right, rgba(56,189,248,.18), transparent 30%),
            linear-gradient(135deg, rgba(124,58,237,.28), rgba(255,255,255,.06));
          border-radius: 28px;
          padding: 26px;
          margin-bottom: 24px;
          box-shadow: 0 22px 70px rgba(0,0,0,.36), 0 0 34px rgba(168,85,247,.18);
        }

        .showcase-topline {
          opacity: .78;
          font-size: .82rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 8px;
        }

        .showcase-title {
          font-size: clamp(1.6rem, 4vw, 2.5rem);
          font-weight: 950;
          line-height: 1.05;
          margin-bottom: 14px;
        }

        .showcase-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 18px;
        }

        .showcase-stat {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.07);
          border-radius: 18px;
          padding: 14px;
          text-align: center;
        }

        .showcase-stat.featured-pulls {
          grid-column: span 2;
          position: relative;
          overflow: hidden;
          min-height: 160px;
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.2), transparent 35%),
            rgba(255,255,255,.07);
        }

        .showcase-stat-label {
          opacity: .66;
          font-size: .72rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .showcase-stat-value {
          font-size: 1.35rem;
          font-weight: 950;
        }

        .best-hit-card {
          margin-top: 10px;
        }

        .best-hit-tier {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(20,20,80,.45);
          border: 1px solid rgba(255,255,255,.25);
          font-size: .78rem;
          font-weight: 950;
          margin-bottom: 10px;
        }

        .best-hit-name {
          font-size: 1.25rem;
          font-weight: 950;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .best-hit-meta {
          margin-top: 8px;
          opacity: .75;
          font-size: .82rem;
          font-weight: 800;
        }

        .best-hit-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
        }

        .best-hit-button {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          color: white;
          font-size: 1.2rem;
          font-weight: 950;
          cursor: pointer;
        }

        .best-hit-count {
          opacity: .7;
          font-size: .78rem;
          font-weight: 900;
        }

        .milestone-card {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.06);
          border-radius: 22px;
          padding: 18px;
          margin-bottom: 24px;
          box-shadow: 0 16px 46px rgba(0,0,0,.24);
        }

        .milestone-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin-bottom: 12px;
        }

        .milestone-label {
          font-weight: 950;
        }

        .milestone-remaining {
          opacity: .75;
          font-weight: 900;
          white-space: nowrap;
        }

        .milestone-bar {
          overflow: hidden;
          height: 12px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          border: 1px solid rgba(255,255,255,.1);
        }

        .milestone-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #7c3aed, #c084fc, #facc15);
          box-shadow: 0 0 18px rgba(192,132,252,.45);
        }

        .badge-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
          gap: 10px;
          margin-bottom: 28px;
        }

        .collector-badge {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          border-radius: 18px;
          padding: 14px;
          text-align: center;
          font-weight: 900;
          box-shadow: 0 14px 40px rgba(0,0,0,.22);
        }

        .collector-badge.locked {
          opacity: .38;
          filter: grayscale(1);
        }

        .badge-icon {
          font-size: 1.5rem;
          margin-bottom: 6px;
        }

        .badge-label {
          font-size: .82rem;
        }

        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 28px;
        }

        .stat-box {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          min-height: 82px;
          border-radius: 20px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          font-weight: 900;
        }

        .stat-box::before {
          content: '';
          position: absolute;
          inset: -3px;
          z-index: -2;
          opacity: 0.9;
        }

        .stat-box::after {
          content: '';
          position: absolute;
          top: -10%;
          left: -85%;
          width: 65%;
          height: 120%;
          transform: skewX(-18deg);
          z-index: -1;
          opacity: 0.42;
        }

        .stat-label,
        .stat-number,
        .rank-pill {
          position: relative;
          z-index: 2;
        }

        .stat-number {
          font-size: 1.7rem;
          font-weight: 950;
          line-height: 1;
        }

        .rank-pill {
          display: inline-block;
          margin-top: 10px;
          padding: 7px 16px;
          border-radius: 999px;
          background: rgba(20,20,80,0.45);
          border: 1px solid rgba(255,255,255,0.65);
          color: white;
          font-size: 0.78rem;
          font-weight: 950;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          box-shadow: 0 0 18px rgba(255,255,255,0.14);
        }

        .stat-total {
          border: 2px solid rgba(255,255,255,.35);
          background: linear-gradient(135deg, rgba(124,58,237,.2), rgba(255,255,255,.07));
          box-shadow: 0 0 30px rgba(168,85,247,.2);
        }

        .hof-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.24), transparent 30%),
            linear-gradient(135deg, rgba(124,58,237,.28), rgba(255,255,255,.06));
          border-radius: 28px;
          padding: 28px;
          margin-bottom: 28px;
          text-align: center;
          box-shadow: 0 22px 70px rgba(0,0,0,.36), 0 0 34px rgba(168,85,247,.18);
        }

        .hof-hero-label {
          opacity: .78;
          font-size: .85rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 10px;
        }

        .hof-hero-rank {
          display: inline-block;
          padding: 12px 34px;
          border-radius: 999px;
          background: rgba(20,20,80,.48);
          border: 2px solid rgba(255,255,255,.7);
          font-size: 2rem;
          font-weight: 950;
          box-shadow: 0 0 24px rgba(255,255,255,.18);
        }

        .hof-title {
          margin-top: 12px;
          font-size: 1rem;
          font-weight: 950;
          opacity: .9;
          letter-spacing: .4px;
        }

        .hof-podium {
          display: grid;
          grid-template-columns: 1fr 1.2fr 1fr;
          gap: 14px;
          align-items: start;
          margin-bottom: 44px;
        }

        .podium-card {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          padding: 22px 14px;
          text-align: center;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.07);
          box-shadow: 0 18px 55px rgba(0,0,0,.3);
        }

        .podium-1 {
          min-height: 260px;
          border-color: rgba(250,204,21,.85);
          background: linear-gradient(135deg, rgba(250,204,21,.22), rgba(168,85,247,.16));
          box-shadow: 0 0 34px rgba(250,204,21,.3), 0 18px 55px rgba(0,0,0,.35);
        }

        .podium-2 {
          min-height: 220px;
          border-color: rgba(226,232,240,.75);
          background: linear-gradient(135deg, rgba(226,232,240,.18), rgba(96,165,250,.1));
        }

        .podium-3 {
          min-height: 200px;
          border-color: rgba(251,146,60,.75);
          background: linear-gradient(135deg, rgba(251,146,60,.18), rgba(168,85,247,.1));
        }

        .podium-medal {
          font-size: 2rem;
          margin-bottom: 8px;
        }

        .podium-rank {
          font-size: .85rem;
          font-weight: 950;
          opacity: .7;
          margin-bottom: 6px;
        }

        .podium-name {
          font-size: 1.1rem;
          font-weight: 950;
          word-break: break-word;
        }

        .podium-title {
          margin-top: 10px;
          opacity: .9;
          font-size: .85rem;
          font-weight: 900;
        }

        .podium-stat-label {
          margin-top: 14px;
          opacity: .6;
          font-size: .7rem;
          font-weight: 900;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .podium-stat {
          font-size: 2rem;
          font-weight: 950;
          line-height: 1;
          margin-top: 4px;
        }

        .hof-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .hof-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 18px;
          padding: 14px 16px;
          font-weight: 900;
        }

        .hof-name {
          opacity: .95;
        }

        .hof-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .hof-tier-name {
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(20,20,80,.45);
          border: 1px solid rgba(255,255,255,.24);
          font-size: .72rem;
          font-weight: 950;
          opacity: .9;
        }

        .hof-hits {
          opacity: .78;
          white-space: nowrap;
        }

        .hit-grid {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .hit-card {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 24px;
          padding: 20px;
          min-height: 170px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
        }

        .hit-card::before {
          content: '';
          position: absolute;
          inset: -3px;
          z-index: -2;
          opacity: 0.9;
        }

        .hit-card::after {
          content: '';
          position: absolute;
          top: -10%;
          left: -85%;
          width: 65%;
          height: 120%;
          transform: skewX(-18deg);
          z-index: -1;
          opacity: 0.42;
        }

        .hit-content {
          position: relative;
          z-index: 2;
          text-align: center;
        }

        .hit-break {
          opacity: 0.9;
          font-size: 1.15rem;
          margin-bottom: 10px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .break-number {
          display: inline-block;
          margin-bottom: 18px;
          padding: 10px 26px;
          border-radius: 12px;
          background: rgba(20,20,80,0.45);
          border: 2px solid rgba(255,255,255,0.75);
          color: white;
          font-size: 1.2rem;
          font-weight: 950;
          letter-spacing: 1px;
          box-shadow: 0 0 20px rgba(255,255,255,0.18);
        }

        .hit-card h3 {
          text-align: center;
          margin: 0;
          font-size: clamp(1.6rem, 4vw, 2.4rem);
          line-height: 1.05;
          text-transform: uppercase;
          font-weight: 950;
          text-shadow: 0 8px 28px rgba(0,0,0,0.45);
        }

        .hit-badge {
          display: inline-block;
          margin-top: 18px;
          padding: 12px 34px;
          border-radius: 999px;
          color: #050505;
          font-weight: 950;
          letter-spacing: 2px;
          font-size: 1.1rem;
          box-shadow: 0 8px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.65);
        }

        .badge-gold {
          background: linear-gradient(135deg, #fff7ad, #facc15, #b45309);
          color: #1f1300;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 0 24px rgba(250,204,21,.85), inset 0 1px 0 rgba(255,255,255,.75);
        }

        .badge-sir {
          background: linear-gradient(135deg, #ff004c, #ffb000, #fff700, #00f0ff, #8b5cf6);
          color: #160018;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 0 26px rgba(255,176,0,.8), 0 0 45px rgba(168,85,247,.45);
        }

        .badge-mar {
          background: linear-gradient(135deg, #e0f2fe, #38bdf8, #8b5cf6);
          color: #02111f;
          border: 1px solid rgba(255,255,255,.55);
          box-shadow: 0 0 22px rgba(56,189,248,.75), inset 0 1px 0 rgba(255,255,255,.75);
        }

        .badge-ir {
          background: linear-gradient(135deg, #fecdd3, #fb7185, #be123c);
          color: #210006;
        }

        .badge-sr {
          background: linear-gradient(135deg, #f3e8ff, #c084fc, #7e22ce);
          color: #190026;
        }

        .badge-ex {
          background: linear-gradient(135deg, #dbeafe, #60a5fa, #1d4ed8);
          color: #061327;
        }

        .hit-ex {
          border: 1px solid rgba(96,165,250,.5);
          box-shadow: 0 0 26px rgba(96,165,250,.38), 0 0 52px rgba(96,165,250,.16);
          animation: exPulse 2.8s ease-in-out infinite;
        }

        .hit-ex::before {
          background: linear-gradient(135deg, rgba(96,165,250,.34), rgba(255,255,255,.07));
        }

        .hit-ex::after {
          background: linear-gradient(90deg, transparent, rgba(147,197,253,.45), transparent);
          animation: slowSweep 4.2s infinite;
        }

        .hit-sr {
          border: 1px solid rgba(192,132,252,.55);
          box-shadow: 0 0 32px rgba(192,132,252,.42), 0 0 70px rgba(168,85,247,.2);
          animation: srPulse 2.5s ease-in-out infinite;
        }

        .hit-sr::before {
          background: linear-gradient(135deg, rgba(192,132,252,.38), rgba(59,130,246,.12));
        }

        .hit-sr::after {
          background: linear-gradient(90deg, transparent, rgba(216,180,254,.55), transparent);
          animation: slowSweep 3.8s infinite;
        }

        .hit-ir {
          border: 1px solid rgba(251,113,133,.68);
          box-shadow: 0 0 36px rgba(251,113,133,.48), 0 0 75px rgba(244,63,94,.24), inset 0 0 30px rgba(251,113,133,.08);
          animation: irOrbit 2.8s ease-in-out infinite;
        }

        .hit-ir::before {
          background: radial-gradient(circle at 20% 20%, rgba(255,255,255,.14), transparent 22%), linear-gradient(135deg, rgba(251,113,133,.45), rgba(168,85,247,.16));
        }

        .hit-ir::after {
          background: linear-gradient(90deg, transparent, rgba(251,113,133,.68), rgba(255,255,255,.4), transparent);
          animation: fastSweep 2.9s infinite;
        }

        .hit-mar {
          border: 2px solid rgba(56,189,248,.78);
          background: radial-gradient(circle at 18% 28%, rgba(255,255,255,.18), transparent 24%), radial-gradient(circle at 82% 72%, rgba(56,189,248,.16), transparent 28%), rgba(255,255,255,.08);
          box-shadow: 0 0 42px rgba(56,189,248,.52), 0 0 90px rgba(14,165,233,.27), inset 0 0 42px rgba(56,189,248,.12);
          animation: marCosmicFloat 2.4s ease-in-out infinite;
        }

        .hit-mar::before {
          background: radial-gradient(circle at 25% 35%, rgba(255,255,255,.8) 0 1px, transparent 2px), radial-gradient(circle at 70% 25%, rgba(255,255,255,.7) 0 1px, transparent 2px), radial-gradient(circle at 82% 78%, rgba(255,255,255,.65) 0 1px, transparent 2px), linear-gradient(135deg, rgba(56,189,248,.45), rgba(168,85,247,.18));
          animation: starTwinkle 2.1s ease-in-out infinite;
        }

        .hit-mar::after {
          background: linear-gradient(90deg, transparent, rgba(125,211,252,.78), rgba(255,255,255,.5), transparent);
          animation: fastSweep 2.5s infinite;
        }

        .hit-gold {
          border: 2px solid rgba(250,204,21,.86);
          background: radial-gradient(circle at top left, rgba(255,255,255,.14), transparent 30%), linear-gradient(135deg, rgba(250,204,21,.16), rgba(168,85,247,.14), rgba(255,255,255,.06));
          box-shadow: 0 0 38px rgba(250,204,21,.42), 0 0 82px rgba(168,85,247,.25), inset 0 0 38px rgba(250,204,21,.12);
          animation: goldPremiumFloat 2.2s ease-in-out infinite;
        }

        .hit-gold::before {
          background: radial-gradient(circle at 18% 24%, rgba(255,255,255,.2), transparent 20%), linear-gradient(135deg, rgba(250,204,21,.36), rgba(168,85,247,.22), rgba(255,255,255,.08));
        }

        .hit-gold::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), rgba(250,204,21,.66), transparent);
          animation: goldSweep 2.3s infinite;
        }

        .hit-sir {
          border: 2px solid rgba(255,255,255,.42);
          background: radial-gradient(circle at top left, rgba(255,255,255,.18), transparent 28%), linear-gradient(135deg, rgba(255,0,76,.15), rgba(255,176,0,.12), rgba(0,240,255,.1), rgba(139,92,246,.16));
          box-shadow: 0 0 35px rgba(255,176,0,.42), 0 0 70px rgba(168,85,247,.3), 0 0 100px rgba(34,211,238,.2), inset 0 0 44px rgba(255,255,255,.08);
          animation: sirLegendaryFloat 1.8s ease-in-out infinite;
        }

        .hit-sir::before {
          background: linear-gradient(120deg, rgba(255,0,76,.48), rgba(255,176,0,.48), rgba(255,247,0,.36), rgba(0,240,255,.36), rgba(139,92,246,.48), rgba(255,0,76,.48));
          animation: rainbowBorder 3.2s linear infinite;
        }

        .hit-sir::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), rgba(255,176,0,.48), transparent);
          animation: sirSweep 2.4s infinite;
        }

        .cosmic-stars,
        .planet-field,
        .rocket-field {
          pointer-events: none;
          position: absolute;
          inset: 0;
          overflow: hidden;
          z-index: 1;
        }

        .cosmic-stars span {
          position: absolute;
          color: rgba(255,255,255,.9);
          text-shadow: 0 0 14px rgba(125,211,252,.95);
          animation: starDrift 4s infinite ease-in-out;
        }

        .cosmic-stars span:nth-child(1) { top: 15%; left: 10%; animation-delay: 0s; }
        .cosmic-stars span:nth-child(2) { top: 72%; left: 18%; animation-delay: .7s; }
        .cosmic-stars span:nth-child(3) { top: 20%; right: 14%; animation-delay: 1.2s; }
        .cosmic-stars span:nth-child(4) { bottom: 16%; right: 18%; animation-delay: 1.8s; }

        .planet-field span {
          position: absolute;
          font-size: 1.25rem;
          filter: drop-shadow(0 0 12px rgba(250,204,21,.75));
          opacity: .82;
        }

        .planet-field span:nth-child(1) {
          top: 18%;
          left: -10%;
          animation: planetFlyOne 6s infinite linear;
        }

        .planet-field span:nth-child(2) {
          bottom: 18%;
          left: -12%;
          animation: planetFlyThree 8s infinite linear;
        }

        .rocket-field span {
          position: absolute;
          font-size: 1.35rem;
          filter: drop-shadow(0 0 12px rgba(255,255,255,.75));
        }

        .rocket-field span:nth-child(1) {
          top: 22%;
          left: -15%;
          animation: rocketFlyOne 3.2s infinite ease-in-out;
        }

        .rocket-field span:nth-child(2) {
          top: 58%;
          left: -15%;
          animation: cometFly 4.5s infinite ease-in-out;
        }

        @keyframes slowSweep {
          0% { left: -85%; }
          60% { left: 130%; }
          100% { left: 130%; }
        }

        @keyframes fastSweep {
          0% { left: -85%; opacity: 0; }
          18% { opacity: .75; }
          50% { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }

        @keyframes goldSweep {
          0% { left: -90%; opacity: 0; }
          18% { opacity: .9; }
          54% { left: 135%; opacity: 0; }
          100% { left: 135%; opacity: 0; }
        }

        @keyframes sirSweep {
          0% { left: -95%; opacity: 0; }
          16% { opacity: .8; }
          52% { left: 135%; opacity: 0; }
          100% { left: 135%; opacity: 0; }
        }

        @keyframes exPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.005); filter: brightness(1.15); }
        }

        @keyframes srPulse {
          0%, 100% { transform: scale(1); filter: saturate(1); }
          50% { transform: scale(1.008); filter: saturate(1.35); }
        }

        @keyframes irOrbit {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
          50% { transform: translateY(-2px) scale(1.01); filter: brightness(1.15); }
        }

        @keyframes marCosmicFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-3px) scale(1.014); filter: brightness(1.2) saturate(1.25); }
        }

        @keyframes starTwinkle {
          0%, 100% { opacity: .55; filter: brightness(1); }
          50% { opacity: .95; filter: brightness(1.45); }
        }

        @keyframes goldPremiumFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-4px) scale(1.016); filter: brightness(1.28) saturate(1.3); }
        }

        @keyframes sirLegendaryFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.12); }
          50% { transform: translateY(-5px) scale(1.022); filter: brightness(1.25) saturate(1.45); }
        }

        @keyframes rainbowBorder {
          0% { filter: hue-rotate(0deg) saturate(1.25); }
          100% { filter: hue-rotate(360deg) saturate(1.25); }
        }

        @keyframes starDrift {
          0%, 100% { transform: translateY(0) scale(.9); opacity: .35; }
          50% { transform: translateY(-8px) scale(1.25); opacity: 1; }
        }

        @keyframes planetFlyOne {
          0% { left: -12%; transform: translateY(0) rotate(0deg) scale(.8); opacity: 0; }
          15% { opacity: .9; }
          100% { left: 110%; transform: translateY(26px) rotate(360deg) scale(1.1); opacity: 0; }
        }

        @keyframes planetFlyThree {
          0% { left: -14%; transform: translateY(0) rotate(0deg) scale(.7); opacity: 0; }
          20% { opacity: .75; }
          100% { left: 105%; transform: translateY(-20px) rotate(260deg) scale(1); opacity: 0; }
        }

        @keyframes rocketFlyOne {
          0% { left: -18%; transform: translateY(0) rotate(25deg) scale(.9); opacity: 0; }
          15% { opacity: 1; }
          100% { left: 115%; transform: translateY(-45px) rotate(25deg) scale(1.2); opacity: 0; }
        }

        @keyframes cometFly {
          0% { left: -18%; transform: translateY(0) rotate(-12deg) scale(.8); opacity: 0; }
          20% { opacity: .9; }
          100% { left: 115%; transform: translateY(22px) rotate(-12deg) scale(1.1); opacity: 0; }
        }

        @media (max-width: 700px) {
          .page {
            padding: 14px;
          }

          .header h1 {
            font-size: 2rem;
          }

          .tabs {
            gap: 8px;
          }

          .tab-button {
            padding: 10px 12px;
            font-size: .85rem;
          }

          .break-date-card {
            padding: 16px;
            border-radius: 20px;
          }

          .calendar-grid {
            gap: 6px;
          }

          .calendar-day {
            height: 42px;
            border-radius: 12px;
            font-size: .85rem;
          }

          .calendar-day-label {
            font-size: .68rem;
          }

          .showcase-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .showcase-stat.featured-pulls {
            grid-column: span 2;
          }

          .hof-podium {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .podium-card {
            padding: 16px 8px;
          }

          .podium-name {
            font-size: .9rem;
          }

          .podium-title {
            font-size: .72rem;
          }

          .podium-stat {
            font-size: 1.5rem;
          }
        }

        @media (max-width: 600px) {
          .hof-row {
            flex-direction: column;
            gap: 8px;
          }

          .hof-meta {
            justify-content: flex-start;
          }

          .milestone-row {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <div className="wrap">
        <header className="header">
          <h1>{collector?.whatnot_name || username}&apos;s Break Vault</h1>
          <p>Every hit. Every break. One place to relive your Collectiverse journey.</p>
        </header>

        <div className="tabs">
          <button
            className={`tab-button ${tab === 'latest' ? 'active' : ''}`}
            onClick={() => setTab('latest')}
          >
            Break Archive
          </button>

          <button
            className={`tab-button ${tab === 'lifetime' ? 'active' : ''}`}
            onClick={() => setTab('lifetime')}
          >
            Lifetime Hits
          </button>

          <button
            className={`tab-button ${tab === 'hall' ? 'active' : ''}`}
            onClick={() => setTab('hall')}
          >
            Hall of Fame
          </button>
        </div>

        {message && <p>{message}</p>}

        {tab === 'latest' && !message && (
          <section>
            <h2 className="section-title">🌌 Break Archive</h2>

            <div className="break-date-card">
              <div className="calendar-header">
                <button className="calendar-nav" onClick={() => changeMonth(-1)}>
                  ‹
                </button>

                <div className="calendar-month">
                  {new Date(selectedDate).toLocaleString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>

                <button className="calendar-nav" onClick={() => changeMonth(1)}>
                  ›
                </button>
              </div>

              <div className="calendar-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="calendar-day-label">
                    {day}
                  </div>
                ))}

                {calendarItems.map((item) =>
                  item.day ? (
                    <button
                      key={item.key}
                      onClick={() => setSelectedDate(item.date)}
                      className={`calendar-day ${item.hasBreak ? 'has-break' : ''} ${
                        item.isSelected ? 'selected' : ''
                      }`}
                    >
                      {item.day}
                    </button>
                  ) : (
                    <div key={item.key} />
                  )
                )}
              </div>
            </div>

            <h3 className="subsection-title">Your Hits From This Date</h3>

            <HitList items={selectedDateHits} />
          </section>
        )}

        {tab === 'lifetime' && !message && (
          <section>
            <h2 className="section-title">🏆 Lifetime Collection</h2>

            <div className="collector-showcase">
              <div className="showcase-topline">Collector Showcase</div>
              <div className="showcase-title">{collectorTitle}</div>

              <div className="showcase-grid">
                <div className="showcase-stat">
                  <div className="showcase-stat-label">Lifetime Hits</div>
                  <div className="showcase-stat-value">{counts.overall}</div>
                </div>

                <div className="showcase-stat">
                  <div className="showcase-stat-label">Collector Rank</div>
                  <div className="showcase-stat-value">
                    {ranks.overall ? `#${ranks.overall}` : '-'}
                  </div>
                </div>

                <div className="showcase-stat featured-pulls">
                  <div className="showcase-stat-label">Best Pulls</div>

                  {currentBestHit ? (
                    <div className="best-hit-card">
                      <div className="best-hit-tier">
                        {getTierEmoji(currentBestHit.hit_tier)}{' '}
                        {tierLabels[currentBestHit.hit_tier]}
                      </div>

                      <div className="best-hit-name">{currentBestHit.spot_name}</div>

                      <div className="best-hit-meta">
                        Pulled {formatDate(currentBestHit.revealed_at || currentBestHit.stream_datetime)}
                      </div>

                      <div className="best-hit-meta">{currentBestHit.break_name}</div>

                      {bestHits.length > 1 && (
                        <div className="best-hit-controls">
                          <button
                            className="best-hit-button"
                            onClick={() => changeBestHit(-1)}
                          >
                            ‹
                          </button>

                          <div className="best-hit-count">
                            {bestHitIndex + 1} / {bestHits.length}
                          </div>

                          <button
                            className="best-hit-button"
                            onClick={() => changeBestHit(1)}
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="best-hit-card">
                      <div className="best-hit-name">No MAR+ pulls yet</div>
                      <div className="best-hit-meta">
                        Your best hits will appear here automatically.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="milestone-card">
              <div className="milestone-row">
                <div>
                  <div className="showcase-stat-label">Next Milestone</div>
                  <div className="milestone-label">{nextMilestone.label}</div>
                </div>

                <div className="milestone-remaining">
                  {nextMilestone.complete
                    ? 'Complete'
                    : `${nextMilestone.remaining} more hits`}
                </div>
              </div>

              <div className="milestone-bar">
                <div
                  className="milestone-fill"
                  style={{
                    width: `${
                      nextMilestone.complete
                        ? 100
                        : Math.min(100, (counts.overall / nextMilestone.target) * 100)
                    }%`,
                  }}
                />
              </div>
            </div>

            <h3 className="subsection-title">Permanent Achievements</h3>

            <div className="badge-grid">
              {permanentBadges.map((badge) => (
                <div
                  key={badge.label}
                  className={`collector-badge ${badge.unlocked ? '' : 'locked'}`}
                >
                  <div className="badge-icon">{badge.icon}</div>
                  <div className="badge-label">{badge.label}</div>
                </div>
              ))}
            </div>

            <h3 className="subsection-title">Current Status</h3>

            <div className="badge-grid">
              {statusBadges.map((badge) => (
                <div
                  key={badge.label}
                  className={`collector-badge ${badge.unlocked ? '' : 'locked'}`}
                >
                  <div className="badge-icon">{badge.icon}</div>
                  <div className="badge-label">{badge.label}</div>
                </div>
              ))}
            </div>

            <div className="stats-grid">
              <div className="stat-box stat-total">
                <div className="stat-label">🏆 Total Hits</div>
                <div className="stat-number">{counts.overall}</div>
                <RankPill rank={ranks.overall} />
              </div>

              <div className="stat-box hit-sir">
                <div className="rocket-field">
                  <span>🚀</span>
                  <span>☄️</span>
                </div>

                <div className="stat-label">👑 SIR</div>
                <div className="stat-number">{counts.sir}</div>
                <RankPill rank={ranks.sir} />
              </div>

              <div className="stat-box hit-gold">
                <div className="planet-field">
                  <span>🪐</span>
                  <span>🌕</span>
                </div>

                <div className="stat-label">🥇 Gold</div>
                <div className="stat-number">{counts.gold}</div>
                <RankPill rank={ranks.gold} />
              </div>

              <div className="stat-box hit-mar">
                <div className="cosmic-stars">
                  <span>✦</span>
                  <span>✧</span>
                  <span>✦</span>
                  <span>✧</span>
                </div>

                <div className="stat-label">🌌 MAR</div>
                <div className="stat-number">{counts.mar}</div>
                <RankPill rank={ranks.mar} />
              </div>

              <div className="stat-box hit-ir">
                <div className="stat-label">⭐ IR</div>
                <div className="stat-number">{counts.ir}</div>
                <RankPill rank={ranks.ir} />
              </div>

              <div className="stat-box hit-sr">
                <div className="stat-label">💎 SR</div>
                <div className="stat-number">{counts.sr}</div>
                <RankPill rank={ranks.sr} />
              </div>

              <div className="stat-box hit-ex">
                <div className="stat-label">✨ EX</div>
                <div className="stat-number">{counts.ex}</div>
                <RankPill rank={ranks.ex} />
              </div>
            </div>
          </section>
        )}

        {tab === 'hall' && !message && (
          <section>
            <h2 className="section-title">🏛️ Hall of Fame</h2>

            <div className="hof-hero">
              <div className="hof-hero-label">Your Collector Rank</div>

              <div className="hof-hero-rank">
                {ranks.overall ? `#${ranks.overall}` : 'Unranked'}
              </div>

              <div className="hof-title">{collectorTitle}</div>
            </div>

            <h3 className="subsection-title">Top 10 Collectors</h3>

            <div className="hof-podium">
              {hallOfFame[1] && (
                <div className="podium-card podium-2">
                  <div className="podium-medal">🥈</div>
                  <div className="podium-rank">#{hallOfFame[1].rank}</div>
                  <div className="podium-name">{hallOfFame[1].name}</div>
                  <div className="podium-title">{hallOfFame[1].title}</div>
                  <div className="podium-stat-label">Lifetime Hits</div>
                  <div className="podium-stat">{hallOfFame[1].totalHits}</div>
                </div>
              )}

              {hallOfFame[0] && (
                <div className="podium-card podium-1">
                  <div className="podium-medal">🥇</div>
                  <div className="podium-rank">#{hallOfFame[0].rank}</div>
                  <div className="podium-name">{hallOfFame[0].name}</div>
                  <div className="podium-title">{hallOfFame[0].title}</div>
                  <div className="podium-stat-label">Lifetime Hits</div>
                  <div className="podium-stat">{hallOfFame[0].totalHits}</div>
                </div>
              )}

              {hallOfFame[2] && (
                <div className="podium-card podium-3">
                  <div className="podium-medal">🥉</div>
                  <div className="podium-rank">#{hallOfFame[2].rank}</div>
                  <div className="podium-name">{hallOfFame[2].name}</div>
                  <div className="podium-title">{hallOfFame[2].title}</div>
                  <div className="podium-stat-label">Lifetime Hits</div>
                  <div className="podium-stat">{hallOfFame[2].totalHits}</div>
                </div>
              )}
            </div>

            <div className="hof-list">
              {hallOfFame.slice(3).map((item) => (
                <div key={item.collectorId} className="hof-row">
                  <div className="hof-name">
                    #{item.rank} {item.name}
                  </div>

                  <div className="hof-meta">
                    <div className="hof-tier-name">{item.title}</div>
                    <div className="hof-hits">{item.totalHits} Lifetime Hits</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}