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
}

const hitTiers: HitTier[] = ['sir', 'gold', 'mar', 'ir', 'sr', 'ex']
const showcaseTiers = ['sir', 'gold', 'mar']

const DEMO_USERNAME = 'demo'

const MESSAGE_NO_COLLECTOR = 'NO_COLLECTOR'
const MESSAGE_NO_ENTRIES = 'NO_ENTRIES'
const MESSAGE_NO_HITS = 'NO_HITS'

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
  switch (String(tier || '').toLowerCase().trim()) {
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
  
  const isDemoVault = username.toLowerCase().trim() === DEMO_USERNAME

  const [tab, setTab] = useState<Tab>('latest')
  const [selectedDate, setSelectedDate] = useState(todayDate())
  const [collector, setCollector] = useState<any>(null)
  const [hits, setHits] = useState<any[]>([])
  const [enteredBreakDates, setEnteredBreakDates] = useState<string[]>([])
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
    try {
      const normalisedUsername = username.toLowerCase().trim()

      setMessage('Loading vault...')

      const { data: collectorData } = await supabase
        .from('collectors')
        .select('*')
        .eq('whatnot_name_normalized', normalisedUsername)
        .maybeSingle()

      if (!collectorData) {
        setCollector(null)
        setHits([])
        setEnteredBreakDates([])
        setHallOfFame([])
        setMessage(MESSAGE_NO_COLLECTOR)
        return
      }

      setCollector(collectorData)

      const { data: allEntries } = await supabase
        .from('entries')
        .select('*')
        .eq('collector_id', collectorData.id)

      if (!allEntries || allEntries.length === 0) {
        setMessage(MESSAGE_NO_ENTRIES)
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

      const allEnteredDates = [
        ...new Set(
          (allEntries || [])
            .map((entry) => dateValue(breakMap[entry.break_id]?.stream_datetime || null))
            .filter(Boolean)
        ),
      ]

      setEnteredBreakDates(allEnteredDates)

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

      if (hitsWithBreaks.length === 0) {
        setMessage(MESSAGE_NO_HITS)
        return
      }

      const { data: allHitEntries } = await supabase
        .from('entries')
        .select('collector_id, hit_tier')
        .eq('is_hit', true)
        .neq('hit_tier', 'reverse_holo')

      const rawTotals: Record<string, RankTotals> = {}

      ;(allHitEntries || []).forEach((entry) => {
        if (!rawTotals[entry.collector_id]) {
          rawTotals[entry.collector_id] = getEmptyRankTotals()
        }

        rawTotals[entry.collector_id].overall += 1

        if (hitTiers.includes(entry.hit_tier as HitTier)) {
          rawTotals[entry.collector_id][entry.hit_tier as HitTier] += 1
        }
      })

      const allCollectorIds = Object.keys(rawTotals)

      const { data: collectorNames } =
        allCollectorIds.length > 0
          ? await supabase
              .from('collectors')
              .select('id, whatnot_name, whatnot_name_normalized')
              .in('id', allCollectorIds)
          : { data: [] }

      const collectorNameMap: Record<string, string> = {}
      const demoCollectorIds = new Set<string>()

      ;(collectorNames || []).forEach((item) => {
        collectorNameMap[item.id] = item.whatnot_name

        const normalizedName = String(
          item.whatnot_name_normalized || item.whatnot_name || ''
        )
          .toLowerCase()
          .trim()

        if (normalizedName === DEMO_USERNAME) {
          demoCollectorIds.add(item.id)
        }
      })

      const rankingTotals: Record<string, RankTotals> = {}

      Object.entries(rawTotals).forEach(([collectorId, collectorTotals]) => {
        if (demoCollectorIds.has(collectorId)) return
        rankingTotals[collectorId] = collectorTotals
      })

      function getRank(type: RankKey) {
        if (isDemoVault) return null

        const currentCount = rankingTotals[collectorData.id]?.[type] || 0

        if (currentCount === 0) return null

        return (
          Object.values(rankingTotals).filter(
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
        Object.entries(rankingTotals)
          .map(([collectorId, collectorTotals]) => {
            const rank =
              Object.values(rankingTotals).filter(
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
    } catch (error) {
      console.error('Vault loading error:', error)
      setMessage('Something went wrong while loading this vault. Please try again.')
    }
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

  const selectedDateHits = hits.filter((hit) =>
    hit.stream_datetime?.startsWith(selectedDate)
  )

  const selectedDateEntered = enteredBreakDates.includes(selectedDate)

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
    const nextDate = new Date(year, month + amount, 1, 12)
    setSelectedDate(nextDate.toISOString().split('T')[0])
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

  function HitList({
    items,
    enteredBreak,
  }: {
    items: any[]
    enteredBreak: boolean
  }) {
    if (items.length === 0 && enteredBreak) {
      return (
        <div className="empty-state-card pack-gods-card">
          <div className="empty-state-icon">🎲</div>
          <h2>The Pack Gods Were Not With You... Yet</h2>
          <p>
            You entered a Collectiverse break on this date, but your first hit from this stream
            is still out there waiting. Every legend starts somewhere.
          </p>
          <div className="empty-state-pill">🍀 First Hit Incoming</div>
        </div>
      )
    }

    if (items.length === 0 && !enteredBreak) {
      return (
        <div className="empty-state-card">
          <div className="empty-state-icon">📭</div>
          <h2>No Break Entries</h2>
          <p>
            You did not enter any Collectiverse breaks on this date.
            Pick another highlighted date from your Break Archive.
          </p>
        </div>
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

function MessageCard() {
  if (!message) return null
  
  if (message === MESSAGE_NO_COLLECTOR) {
  return (
    <div className="empty-state-card">
      <div className="empty-state-icon">🚀</div>
      <h2>No Collectiverse Vault Found</h2>
      <p>
        Looks like this collector hasn't joined a Collectiverse break yet.
        Once they jump into their first break, their Vault will be waiting for them here.
      </p>
    </div>
  )
}

  if (message === MESSAGE_NO_ENTRIES) {
    return (
      <div className="empty-state-card">
        <div className="empty-state-icon">🚀</div>
        <h2>No Collectiverse Vault Found</h2>
        <p>
          Looks like this collector hasn&apos;t joined a Collectiverse break yet.
          Once they jump into their first break, their Vault will be waiting for them here.
        </p>
      </div>
    )
  }

  if (message === MESSAGE_NO_HITS) {
    return (
      <div className="empty-state-card pack-gods-card">
        <div className="empty-state-icon">🎲</div>
        <h2>The Pack Gods Were Not With You... Yet</h2>
        <p>
          You&apos;ve joined the Collectiverse journey, but your first hit is still out there waiting.
          Every legend starts somewhere. We&apos;ll be ready when that first big pull lands.
        </p>
        <div className="empty-state-pill">🍀 First Hit Incoming</div>
      </div>
    )
  }

  return null
}

  const isReady = message === ''

  return (
    <main className="page">
      <style jsx global>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
          color: white;
          padding: 18px;
          font-size: 0.9rem;
        }

        .wrap {
          max-width: 920px;
          margin: 0 auto;
        }

        .header {
          margin-bottom: 22px;
        }

        .header h1 {
          margin: 0 0 6px;
          font-size: clamp(1.8rem, 4.4vw, 2.8rem);
          font-weight: 950;
          letter-spacing: -1px;
        }

        .header p {
          opacity: 0.86;
          margin: 0;
          font-size: .95rem;
          line-height: 1.5;
          max-width: 650px;
          color: rgba(255,255,255,0.85);
        }

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }

        .tab-button {
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          color: white;
          padding: 10px 14px;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 850;
          font-size: .88rem;
        }

        .tab-button.active {
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 10px 24px rgba(124,58,237,0.35);
        }

        .section-title {
          font-size: 1.55rem;
          font-weight: 950;
          letter-spacing: 1px;
          margin-bottom: 16px;
          text-transform: uppercase;
          background: linear-gradient(90deg, #ffffff, #d8b4fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subsection-title {
          font-size: 1rem;
          font-weight: 850;
          letter-spacing: 0.5px;
          margin: 22px 0 14px;
          color: rgba(255,255,255,.92);
        }

        .section-divider {
          width: 100%;
          height: 1px;
          margin: 18px 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent);
        }

        .break-date-card {
          max-width: 640px;
          margin: 0 auto 24px;
          padding: 22px;
          text-align: center;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(124,58,237,.15), rgba(255,255,255,.04));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 18px 48px rgba(0,0,0,.32), 0 0 24px rgba(168,85,247,.12);
        }

        .calendar-header {
          display: grid;
          grid-template-columns: 40px 1fr 40px;
          align-items: center;
          gap: 10px;
          margin-bottom: 18px;
        }

        .calendar-month {
          text-align: center;
          font-size: clamp(1.15rem, 4.4vw, 1.55rem);
          font-weight: 950;
        }

        .calendar-nav {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          color: white;
          font-size: 1.55rem;
          font-weight: 950;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          padding: 0 0 3px;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }

        .calendar-day-label {
          text-align: center;
          opacity: 0.65;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .calendar-day {
          height: 44px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.05);
          color: white;
          font-weight: 950;
          cursor: pointer;
          font-size: .9rem;
        }

        .calendar-day.has-break {
          border: 1px solid rgba(250,204,21,.8);
          background: rgba(250,204,21,.16);
          box-shadow: 0 0 14px rgba(250,204,21,.24);
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
            radial-gradient(circle at top left, rgba(250,204,21,.16), transparent 30%),
            radial-gradient(circle at bottom right, rgba(56,189,248,.16), transparent 32%),
            linear-gradient(135deg, rgba(124,58,237,.24), rgba(255,255,255,.05));
          border-radius: 24px;
          padding: 18px;
          margin-bottom: 22px;
          box-shadow: 0 18px 56px rgba(0,0,0,.34), 0 0 28px rgba(168,85,247,.14);
        }

        .showcase-header {
          display: grid;
          grid-template-columns: 1fr 180px;
          gap: 12px;
          align-items: stretch;
          margin-bottom: 14px;
        }

        .showcase-topline {
          opacity: .78;
          font-size: .72rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 7px;
        }

        .showcase-title {
          font-size: clamp(1.55rem, 4.4vw, 2.55rem);
          font-weight: 950;
          line-height: 1;
        }

        .showcase-rank-card {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          border-radius: 18px;
          padding: 13px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .showcase-rank-value {
          font-size: 1.7rem;
          font-weight: 950;
          line-height: 1;
        }

        .showcase-best-pull {
          text-align: center;
        }

        .showcase-hit-card,
        .hit-card {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px;
          min-height: 150px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 18px 56px rgba(0,0,0,0.30);
        }

        .showcase-hit-card {
          min-height: 210px;
          margin-top: 8px;
        }

        .showcase-hit-card::before,
        .hit-card::before {
          content: '';
          position: absolute;
          inset: -3px;
          z-index: -2;
          opacity: 0.9;
        }

        .showcase-hit-card::after,
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
          font-size: 1rem;
          margin-bottom: 9px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .break-number {
          display: inline-block;
          margin-bottom: 14px;
          padding: 8px 20px;
          border-radius: 11px;
          background: rgba(20,20,80,0.45);
          border: 2px solid rgba(255,255,255,0.75);
          color: white;
          font-size: 1rem;
          font-weight: 950;
          letter-spacing: 1px;
          box-shadow: 0 0 16px rgba(255,255,255,0.16);
        }

        .hit-card h3,
        .showcase-hit-card h3 {
          text-align: center;
          margin: 0;
          font-size: clamp(1.35rem, 3.5vw, 2.05rem);
          line-height: 1.05;
          text-transform: uppercase;
          font-weight: 950;
          text-shadow: 0 7px 24px rgba(0,0,0,0.45);
        }

        .showcase-hit-card h3 {
          margin-top: 14px;
        }

        .showcase-hit-date {
          margin-top: 12px;
          opacity: .85;
          font-size: .9rem;
          font-weight: 900;
        }

        .showcase-hit-break {
          margin-top: 8px;
          opacity: .8;
          font-size: .86rem;
          font-weight: 950;
          text-transform: uppercase;
        }

        .hit-badge {
          display: inline-block;
          margin-top: 14px;
          padding: 10px 28px;
          border-radius: 999px;
          color: #050505;
          font-weight: 950;
          letter-spacing: 1.5px;
          font-size: .98rem;
          box-shadow: 0 8px 26px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.65);
        }

        .showcase-hit-card .hit-badge {
          margin-top: 0;
        }

        .best-hit-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          margin-top: 14px;
        }

        .best-hit-button {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          color: white;
          font-size: 1.1rem;
          font-weight: 950;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 0 2px;
        }

        .best-hit-count {
          opacity: .7;
          font-size: .76rem;
          font-weight: 900;
        }
		
		.demo-notice {
  margin-top: 14px;
  border: 1px solid rgba(250, 204, 21, .35);
  background: linear-gradient(135deg, rgba(250, 204, 21, .15), rgba(168, 85, 247, .12));
  border-radius: 16px;
  padding: 12px 14px;
  font-weight: 950;
  box-shadow: 0 14px 34px rgba(0,0,0,.22);
}

.demo-notice span {
  display: block;
  margin-top: 5px;
  opacity: .85;
  font-size: .82rem;
  font-weight: 700;
}

.vault-message {
  white-space: pre-line;
  text-align: center;
  padding: 28px;
  border-radius: 22px;
  margin: 20px 0;
  border: 1px solid rgba(255,255,255,.15);
  background: linear-gradient(
    135deg,
    rgba(124,58,237,.18),
    rgba(255,255,255,.05)
  );
  box-shadow:
    0 18px 48px rgba(0,0,0,.28),
    0 0 24px rgba(168,85,247,.12);
  font-weight: 800;
  line-height: 1.7;
}

        .empty-state-card {
          margin: 22px 0;
          border: 1px solid rgba(255,255,255,.16);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.14), transparent 28%),
            linear-gradient(135deg, rgba(124,58,237,.22), rgba(255,255,255,.06));
          border-radius: 22px;
          padding: 24px;
          max-width: 680px;
          box-shadow: 0 18px 56px rgba(0,0,0,.28), 0 0 28px rgba(168,85,247,.12);
        }

        .pack-gods-card {
          border-color: rgba(250,204,21,.32);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.18), transparent 30%),
            radial-gradient(circle at bottom right, rgba(168,85,247,.18), transparent 32%),
            linear-gradient(135deg, rgba(124,58,237,.24), rgba(255,255,255,.06));
        }

        .empty-state-icon {
          font-size: 2rem;
          margin-bottom: 10px;
        }

        .empty-state-card h2 {
          margin: 0 0 10px;
          font-size: clamp(1.3rem, 4vw, 2rem);
          font-weight: 950;
          letter-spacing: .4px;
        }

        .empty-state-card p {
          margin: 0;
          max-width: 560px;
          opacity: .86;
          line-height: 1.55;
          font-size: .95rem;
        }

        .empty-state-pill {
          display: inline-block;
          margin-top: 16px;
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.08);
          font-size: .82rem;
          font-weight: 900;
        }

        .milestone-card {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.06);
          border-radius: 20px;
          padding: 16px;
          margin-bottom: 22px;
          box-shadow: 0 14px 38px rgba(0,0,0,.22);
        }

        .milestone-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 11px;
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
          height: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          border: 1px solid rgba(255,255,255,.1);
        }

        .milestone-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #7c3aed, #c084fc, #facc15);
          box-shadow: 0 0 16px rgba(192,132,252,.45);
        }

        .showcase-stat-label {
          opacity: .66;
          font-size: .68rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .badge-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 9px;
          margin-bottom: 24px;
        }

        .collector-badge {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          border-radius: 16px;
          padding: 12px;
          text-align: center;
          font-weight: 900;
          box-shadow: 0 12px 34px rgba(0,0,0,.20);
        }

        .collector-badge.locked {
          opacity: .35;
          filter: grayscale(1);
        }

        .badge-icon {
          font-size: 1.3rem;
          margin-bottom: 5px;
        }

        .badge-label {
          font-size: .76rem;
        }

        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-bottom: 24px;
        }

        .stat-box {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          min-height: 72px;
          border-radius: 18px;
          padding: 10px 14px;
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
          font-size: 1.45rem;
          font-weight: 950;
          line-height: 1;
        }

        .rank-pill {
          display: inline-block;
          margin-top: 8px;
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(20,20,80,0.45);
          border: 1px solid rgba(255,255,255,0.65);
          color: white;
          font-size: 0.7rem;
          font-weight: 950;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          box-shadow: 0 0 16px rgba(255,255,255,0.12);
        }

        .stat-total {
          border: 2px solid rgba(255,255,255,.35);
          background: linear-gradient(135deg, rgba(124,58,237,.2), rgba(255,255,255,.07));
          box-shadow: 0 0 24px rgba(168,85,247,.2);
        }

        .hof-hero {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.18);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.24), transparent 30%),
            linear-gradient(135deg, rgba(124,58,237,.28), rgba(255,255,255,.06));
          border-radius: 24px;
          padding: 24px;
          margin-bottom: 24px;
          text-align: center;
          box-shadow: 0 18px 56px rgba(0,0,0,.34), 0 0 28px rgba(168,85,247,.16);
        }

        .hof-hero-label {
          opacity: .78;
          font-size: .75rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 9px;
        }

        .hof-hero-rank {
          display: inline-block;
          padding: 10px 28px;
          border-radius: 999px;
          background: rgba(20,20,80,.48);
          border: 2px solid rgba(255,255,255,.7);
          font-size: 1.75rem;
          font-weight: 950;
          box-shadow: 0 0 22px rgba(255,255,255,.16);
        }

        .hof-title {
          margin-top: 10px;
          font-size: .92rem;
          font-weight: 950;
          opacity: .9;
          letter-spacing: .4px;
        }

        .hof-podium {
          display: grid;
          grid-template-columns: 1fr 1.2fr 1fr;
          gap: 12px;
          align-items: start;
          margin-bottom: 36px;
        }

        .podium-card {
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          padding: 18px 12px;
          text-align: center;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.07);
          box-shadow: 0 16px 44px rgba(0,0,0,.28);
        }

        .podium-1 {
          min-height: 230px;
          border-color: rgba(250,204,21,.85);
          background: linear-gradient(135deg, rgba(250,204,21,.22), rgba(168,85,247,.16));
          box-shadow: 0 0 28px rgba(250,204,21,.28), 0 16px 44px rgba(0,0,0,.32);
        }

        .podium-2 {
          min-height: 200px;
          border-color: rgba(226,232,240,.75);
          background: linear-gradient(135deg, rgba(226,232,240,.18), rgba(96,165,250,.1));
        }

        .podium-3 {
          min-height: 185px;
          border-color: rgba(251,146,60,.75);
          background: linear-gradient(135deg, rgba(251,146,60,.18), rgba(168,85,247,.1));
        }

        .podium-medal {
          font-size: 1.75rem;
          margin-bottom: 7px;
        }

        .podium-rank {
          font-size: .76rem;
          font-weight: 950;
          opacity: .7;
          margin-bottom: 5px;
        }

        .podium-name {
          font-size: .98rem;
          font-weight: 950;
          word-break: break-word;
        }

        .podium-title {
          margin-top: 8px;
          opacity: .9;
          font-size: .76rem;
          font-weight: 900;
        }

        .podium-stat-label {
          margin-top: 12px;
          opacity: .6;
          font-size: .64rem;
          font-weight: 900;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .podium-stat {
          font-size: 1.7rem;
          font-weight: 950;
          line-height: 1;
          margin-top: 4px;
        }

        .hof-list {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .hof-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 16px;
          padding: 12px 14px;
          font-weight: 900;
        }

        .hof-name {
          opacity: .95;
        }

        .hof-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .hof-tier-name {
          padding: 4px 9px;
          border-radius: 999px;
          background: rgba(20,20,80,.45);
          border: 1px solid rgba(255,255,255,.24);
          font-size: .66rem;
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
          gap: 14px;
        }

        .badge-gold {
          background: linear-gradient(135deg, #fff7ad, #facc15, #b45309);
          color: #1f1300;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 0 22px rgba(250,204,21,.8), inset 0 1px 0 rgba(255,255,255,.75);
        }

        .badge-sir {
          background: linear-gradient(135deg, #ff004c, #ffb000, #fff700, #00f0ff, #8b5cf6);
          color: #160018;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 0 24px rgba(255,176,0,.75), 0 0 38px rgba(168,85,247,.4);
        }

        .badge-mar {
          background: linear-gradient(135deg, #e0f2fe, #38bdf8, #8b5cf6);
          color: #02111f;
          border: 1px solid rgba(255,255,255,.55);
          box-shadow: 0 0 20px rgba(56,189,248,.7), inset 0 1px 0 rgba(255,255,255,.75);
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
          box-shadow: 0 0 24px rgba(96,165,250,.34), 0 0 46px rgba(96,165,250,.14);
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
          box-shadow: 0 0 28px rgba(192,132,252,.38), 0 0 58px rgba(168,85,247,.18);
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
          box-shadow: 0 0 32px rgba(251,113,133,.43), 0 0 64px rgba(244,63,94,.20), inset 0 0 26px rgba(251,113,133,.08);
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
          box-shadow: 0 0 36px rgba(56,189,248,.46), 0 0 74px rgba(14,165,233,.22), inset 0 0 34px rgba(56,189,248,.10);
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
          box-shadow: 0 0 34px rgba(250,204,21,.38), 0 0 70px rgba(168,85,247,.22), inset 0 0 32px rgba(250,204,21,.10);
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
          box-shadow: 0 0 32px rgba(255,176,0,.38), 0 0 62px rgba(168,85,247,.26), 0 0 84px rgba(34,211,238,.18), inset 0 0 36px rgba(255,255,255,.07);
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
          font-size: 1.1rem;
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
          font-size: 1.15rem;
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
          50% { transform: scale(1.004); filter: brightness(1.12); }
        }

        @keyframes srPulse {
          0%, 100% { transform: scale(1); filter: saturate(1); }
          50% { transform: scale(1.006); filter: saturate(1.3); }
        }

        @keyframes irOrbit {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1); }
          50% { transform: translateY(-2px) scale(1.008); filter: brightness(1.12); }
        }

        @keyframes marCosmicFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-3px) scale(1.012); filter: brightness(1.17) saturate(1.2); }
        }

        @keyframes starTwinkle {
          0%, 100% { opacity: .55; filter: brightness(1); }
          50% { opacity: .95; filter: brightness(1.45); }
        }

        @keyframes goldPremiumFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.05); }
          50% { transform: translateY(-3px) scale(1.012); filter: brightness(1.22) saturate(1.24); }
        }

        @keyframes sirLegendaryFloat {
          0%, 100% { transform: translateY(0) scale(1); filter: brightness(1) saturate(1.12); }
          50% { transform: translateY(-4px) scale(1.016); filter: brightness(1.22) saturate(1.35); }
        }

        @keyframes rainbowBorder {
          0% { filter: hue-rotate(0deg) saturate(1.25); }
          100% { filter: hue-rotate(360deg) saturate(1.25); }
        }

        @keyframes starDrift {
          0%, 100% { transform: translateY(0) scale(.9); opacity: .35; }
          50% { transform: translateY(-8px) scale(1.2); opacity: 1; }
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
            padding: 12px;
            font-size: .84rem;
          }

          .header h1 {
            font-size: 1.85rem;
          }

          .tab-button {
            padding: 9px 11px;
            font-size: .8rem;
          }

          .break-date-card {
            padding: 14px;
            border-radius: 18px;
          }

          .calendar-grid {
            gap: 5px;
          }

          .calendar-day {
            height: 38px;
            border-radius: 11px;
            font-size: .8rem;
          }

          .calendar-day-label {
            font-size: .62rem;
          }

          .showcase-header {
            grid-template-columns: 1fr;
          }

          .showcase-rank-card {
            padding: 11px;
          }

          .showcase-hit-card {
            min-height: 195px;
            padding: 16px;
          }

          .hof-podium {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px;
          }

          .podium-card {
            padding: 14px 7px;
          }

          .podium-name {
            font-size: .82rem;
          }

          .podium-title {
            font-size: .66rem;
          }

          .podium-stat {
            font-size: 1.35rem;
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

  {isDemoVault && (
    <div className="demo-notice">
      🎭 Demo Account
      <span>
        This is a sample Vault showing how Collectiverse Vault works. Demo hits are not included in real collector rankings.
      </span>
    </div>
  )}
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
		

        {message && message !== 'Loading vault...' && <MessageCard />}

        {message === 'Loading vault...' && <p>Loading vault...</p>}

        {tab === 'latest' && isReady && (
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

            <HitList items={selectedDateHits} enteredBreak={selectedDateEntered} />
          </section>
        )}

        {tab === 'lifetime' && isReady && (
          <section>
            <h2 className="section-title">🏆 Lifetime Collection</h2>

            <div className="collector-showcase">
              <div className="showcase-header">
                <div>
                  <div className="showcase-topline">Collector Showcase</div>
                  <div className="showcase-title">{collectorTitle}</div>
                </div>

                <div className="showcase-rank-card">
                  <div className="showcase-stat-label">Collector Rank</div>
                  <div className="showcase-rank-value">
                    {ranks.overall ? `#${ranks.overall}` : '-'}
                  </div>
                </div>
              </div>

              <div className="showcase-best-pull">
                <div className="showcase-stat-label">Best Pulls</div>

                {currentBestHit ? (
                  <div className={`showcase-hit-card ${getTierClass(currentBestHit.hit_tier)}`}>
                    {['sir', 'gold', 'mar'].includes(currentBestHit.hit_tier) && (
                      <div className="cosmic-stars">
                        <span>✦</span>
                        <span>✧</span>
                        <span>✦</span>
                        <span>✧</span>
                      </div>
                    )}

                    {currentBestHit.hit_tier === 'gold' && (
                      <div className="planet-field">
                        <span>🪐</span>
                        <span>🌕</span>
                      </div>
                    )}

                    {currentBestHit.hit_tier === 'sir' && (
                      <div className="rocket-field">
                        <span>🚀</span>
                        <span>☄️</span>
                      </div>
                    )}

                    <div className="hit-content">
                      <div className={`hit-badge badge-${currentBestHit.hit_tier}`}>
                        {getTierEmoji(currentBestHit.hit_tier)}{' '}
                        {tierLabels[currentBestHit.hit_tier]}
                      </div>

                      <h3>{currentBestHit.spot_name}</h3>

                      <div className="showcase-hit-date">
                        Pulled{' '}
                        {formatDate(currentBestHit.revealed_at || currentBestHit.stream_datetime)}
                      </div>

                      <div className="showcase-hit-break">
                        {currentBestHit.break_name}
                      </div>

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
                  </div>
                ) : (
                  <div className="showcase-hit-card hit-default">
                    <div className="hit-content">
                      <h3>No MAR+ pulls yet</h3>
                      <div className="showcase-hit-date">
                        Your best pulls will appear here automatically.
                      </div>
                    </div>
                  </div>
                )}
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

        {tab === 'hall' && isReady && (
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