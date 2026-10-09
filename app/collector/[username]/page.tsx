'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

type Tab = 'latest' | 'lifetime' | 'hall'
type HitTier = 'sir' | 'gold' | 'future' | 'mar' | 'ir' | 'sr' | 'ex' | 'clc'
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
  future: 'FUTURE',
  mar: 'MAR',
  ir: 'IR',
  sr: 'SR',
  ex: 'EX',
  clc: 'CLC',
}

const hitTiers: HitTier[] = ['sir', 'gold', 'future', 'mar', 'clc', 'ir', 'sr', 'ex']
const showcaseTiers = ['sir', 'gold', 'future', 'mar', 'clc']

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

const CANONICAL_SET_NAMES = [
  '30th Celebration',
  'English 151',
  'Ascended Heroes',
  'Chaos Rising',
  'Pitch Black',
  'Crown Zenith',
] as const

function canonicalSetName(name: string | null) {
  const cleaned = String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Break\s+\d+/i, '')
    .trim()

  const lower = cleaned.toLowerCase()
  const match = [...CANONICAL_SET_NAMES]
    .sort((a, b) => b.length - a.length)
    .find((setName) => lower.includes(setName.toLowerCase()))

  return match || cleaned
}

function getBreakInfo(name: string | null) {
  const cleaned = String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const breakMatch = cleaned.match(/Break\s+(\d+)/i)

  return {
    setName: canonicalSetName(cleaned),
    breakNumber: breakMatch?.[1] || '',
  }
}

function normaliseImageKey(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, ' ')
}

function canonicalImageName(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, '')
    .replace(/\s*·?\s*Extra Hit\s*\d*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function resolveCollectorHitImage(
  hitImages: Record<string, string>,
  setName: string,
  rawName: string,
  tier: string | null
) {
  const setKey = normaliseImageKey(setName)
  const tierLabel = tierLabels[String(tier || '').toLowerCase()] || String(tier || '').replace(/_/g, ' ').toUpperCase()
  const cleanBase = canonicalImageName(rawName)
    .replace(/\s+(sir|gold|future|mar|ir|sr|ex|clc)$/i, '')
    .trim()
  let cleanTier = canonicalImageName(tierLabel)

  // 30th compatibility: legacy Umbreon / Espeon rows may still carry IR,
  // but their actual cards/images are EX.
  if (
    cleanTier === 'ir' &&
    (cleanBase === 'umbreon' || cleanBase === 'espeon')
  ) {
    cleanTier = 'ex'
  }

  const wanted = cleanTier ? `${cleanBase} ${cleanTier}`.trim() : cleanBase

  for (const [key, url] of Object.entries(hitImages)) {
    const separator = key.indexOf('::')
    if (separator === -1) continue

    const rowSet = key.slice(0, separator)
    const rowCard = key.slice(separator + 2)
    if (normaliseImageKey(rowSet) !== setKey) continue

    const canonicalRow = canonicalImageName(rowCard)
    const canonicalRowVariant = canonicalRow
      .replace(/\s+ex\s+(sir|gold|mar|ir|sr|clc)$/i, ' $1')
      .trim()

    if (canonicalRow === wanted || canonicalRowVariant === wanted) return url

    // Legacy split-card images were uploaded as e.g. "Salazzle (IR)".
    // Only use that legacy row when its bracketed tier matches this hit.
    const legacyBracketTier = String(rowCard).match(/\((SIR|GOLD|FUTURE|MAR|IR|SR|EX|CLC)\)\s*$/i)?.[1] || ''
    if (
      cleanTier &&
      canonicalImageName(legacyBracketTier) === cleanTier &&
      canonicalRow === cleanBase
    ) return url

    if (!cleanTier && canonicalRow === cleanBase) return url
  }

  return ''
}

function cleanDisplayCardName(value: string) {
  return String(value || '')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/gu, '')
    .trim()
}

function baseCardName(value: string) {
  return String(value || '')
    .replace(/ · Extra Hit \d+$/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

function cardVariantName(value: string, tier: string | null) {
  const base = baseCardName(value)
  const label = tierLabels[String(tier || '').toLowerCase()] || String(tier || '').replace(/_/g, ' ').toUpperCase()
  return tier ? `${base} ${label}`.trim() : base
}

function imageVariantName(value: string, tier: string | null) {
  const base = baseCardName(value).replace(/\s+(SIR|GOLD|FUTURE|MAR|IR|SR|EX|CLC)$/i, '').trim()
  const label = tierLabels[String(tier || '').toLowerCase()] || String(tier || '').replace(/_/g, ' ').toUpperCase()
  return tier ? `${base} ${label}`.trim() : base
}

function visibleCardName(value: string, tier?: string | null) {
  const cleaned = baseCardName(value)
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s*·\s*Extra Hit\s*\d*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()

  // The rarity is already shown in the tier badge.
  // Keep stored hit_name unchanged; only remove the redundant visible EX suffix.
  return cleaned.replace(/\s+EX$/i, '').trim()
}

function getTierClass(tier: string | null) {
  switch (String(tier || '').toLowerCase().trim()) {
    case 'clc':
      return 'hit-clc'
    case 'sir':
      return 'hit-sir'
    case 'gold':
      return 'hit-gold'
    case 'future':
      return 'hit-future'
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
    case 'clc':
      return '📽️'
    case 'sir':
      return '👑'
    case 'gold':
      return '🥇'
    case 'future':
      return '⚡'
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
    future: 0,
    mar: 0,
    ir: 0,
    sr: 0,
    ex: 0,
    clc: 0,
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
  const [hitImages, setHitImages] = useState<Record<string, string>>({})
  const [enteredBreakDates, setEnteredBreakDates] = useState<string[]>([])
  const [hallOfFame, setHallOfFame] = useState<HallOfFameCollector[]>([])
  const [bestHitIndex, setBestHitIndex] = useState(0)
  const [message, setMessage] = useState('Loading vault...')
  

  const [ranks, setRanks] = useState<Record<RankKey, number | null>>({
    overall: null,
    sir: null,
    gold: null,
    future: null,
    mar: null,
    ir: null,
    sr: null,
    ex: null,
    clc: null,
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

      const setKeys = [
        ...new Set(
          hitsWithBreaks
            .map((hit) => normaliseImageKey(getBreakInfo(hit.break_name).setName))
            .filter(Boolean)
        ),
      ]

      if (setKeys.length > 0) {
        const { data: imageRows } = await supabase
          .from('hit_images')
          .select('set_name_normalized, hit_name_normalized, image_url')
          .in('set_name_normalized', setKeys)

        const imageMap: Record<string, string> = {}
        ;(imageRows || []).forEach((row: any) => {
          imageMap[`${row.set_name_normalized}::${row.hit_name_normalized}`] = String(row.image_url)
        })
        setHitImages(imageMap)
      } else {
        setHitImages({})
      }

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
        future: getRank('future'),
        mar: getRank('mar'),
        ir: getRank('ir'),
        sr: getRank('sr'),
        ex: getRank('ex'),
        clc: getRank('clc'),
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
    future: hits.filter((h) => h.hit_tier === 'future').length,
    mar: hits.filter((h) => h.hit_tier === 'mar').length,
    ir: hits.filter((h) => h.hit_tier === 'ir').length,
    sr: hits.filter((h) => h.hit_tier === 'sr').length,
    ex: hits.filter((h) => h.hit_tier === 'ex').length,
    clc: hits.filter((h) => h.hit_tier === 'clc').length,
  }

  const collectorTitle = getCollectorTitle(ranks.overall)
  const nextMilestone = getNextHitMilestone(counts.overall)
  const permanentBadges = getPermanentBadges(counts)
  const statusBadges = getStatusBadges(ranks.overall)

  const bestHits = hits
    .filter((hit) => showcaseTiers.includes(hit.hit_tier))
    .sort((a, b) => {
      const order: Record<string, number> = { sir: 1, gold: 2, future: 3, mar: 4, clc: 5 }
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

  const selectedDateObject = new Date(`${selectedDate}T12:00:00`)
  const selectedDayIndex = selectedDateObject.getDay()
  const mondayOffset = selectedDayIndex === 0 ? -6 : 1 - selectedDayIndex
  const weekStart = new Date(selectedDateObject)
  weekStart.setDate(selectedDateObject.getDate() + mondayOffset)

  const weekItems = Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date(weekStart)
    dayDate.setDate(weekStart.getDate() + index)

    const date = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(
      dayDate.getDate()
    ).padStart(2, '0')}`

    return {
      key: date,
      date,
      dayName: dayDate.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayNumber: dayDate.getDate(),
      monthName: dayDate.toLocaleDateString('en-GB', { month: 'short' }),
      hasBreak: enteredBreakDates.includes(date),
      isSelected: selectedDate === date,
    }
  })

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()}–${weekEnd.getDate()} ${weekEnd.toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
        })}`
      : `${weekStart.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        })} – ${weekEnd.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`

  function changeWeek(amount: number) {
    const nextDate = new Date(selectedDateObject)
    nextDate.setDate(nextDate.getDate() + amount * 7)

    setSelectedDate(
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(
        nextDate.getDate()
      ).padStart(2, '0')}`
    )
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


  function RarityEffects({ tier }: { tier: string }) {
    return (
      <div className="rarity-fx rarity-fx-v4" aria-hidden="true">
        <span className="fx-ambient" />
        <span className="fx-primary" />
        <span className="fx-secondary" />
        <span className="fx-detail" />
        <span className="fx-extra" />
        <span className="fx-flare" />
      
        {tier === 'future' && (
          <div className="future-interface">
            <span className="future-grid" />
            <span className="future-scan" />
            <span className="future-corner future-corner-tl" />
            <span className="future-corner future-corner-tr" />
            <span className="future-corner future-corner-bl" />
            <span className="future-corner future-corner-br" />
            <span className="future-circuit future-circuit-a" />
            <span className="future-circuit future-circuit-b" />
            <span className="future-pulse" />
            <span className="future-orbit future-orbit-one" />
            <span className="future-orbit future-orbit-two" />
            <span className="future-data future-data-top" />
            <span className="future-data future-data-bottom" />
            <span className="future-node future-node-a" />
            <span className="future-node future-node-b" />
          </div>
        )}

        {tier === 'ir' && (
          <svg className="ir-spectral-field" viewBox="0 0 1000 260" preserveAspectRatio="none">
            <defs>
              <linearGradient id="irRibbonA" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fb7185" stopOpacity="0" />
                <stop offset="24%" stopColor="#f472b6" stopOpacity=".72" />
                <stop offset="48%" stopColor="#c4b5fd" stopOpacity=".95" />
                <stop offset="72%" stopColor="#67e8f9" stopOpacity=".78" />
                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="irRibbonB" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="30%" stopColor="#67e8f9" stopOpacity=".68" />
                <stop offset="58%" stopColor="#f0abfc" stopOpacity=".90" />
                <stop offset="82%" stopColor="#fb7185" stopOpacity=".62" />
                <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
              </linearGradient>
              <filter id="irSpectralGlow" x="-30%" y="-80%" width="160%" height="260%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#irSpectralGlow)">
              <path className="ir-ribbon ir-ribbon-a" stroke="url(#irRibbonA)" d="M-80 185 C70 50 180 238 330 105 S590 34 720 145 S910 230 1080 75" />
              <path className="ir-ribbon ir-ribbon-b" stroke="url(#irRibbonB)" d="M-70 70 C90 205 220 8 375 145 S630 238 765 102 S935 20 1070 175" />
              <path className="ir-ribbon ir-ribbon-c" stroke="url(#irRibbonA)" d="M-90 132 C80 18 240 210 410 82 S680 45 820 164 S960 212 1090 118" />
            </g>
          </svg>
        )}
      
        {tier === 'gold' && (
          <div className="gold-molten-system">
            <span className="gold-top-pool" />
            <span className="gold-drip gold-drip-1" />
            <span className="gold-drip gold-drip-2" />
            <span className="gold-drip gold-drip-3" />
            <span className="gold-drip gold-drip-4" />
            <span className="gold-drip gold-drip-5" />
            <span className="gold-drip gold-drip-6" />
            <span className="gold-drip gold-drip-7" />
            <span className="gold-drip gold-drip-8" />
            <span className="gold-drop gold-drop-1" />
            <span className="gold-drop gold-drop-2" />
            <span className="gold-drop gold-drop-3" />
          </div>
        )}
      
        {tier === 'sir' && (
          <div className="sir-prismatic-system">
            <div className="sir-prism-aura" />
            <div className="sir-prism-ribbon sir-prism-ribbon-one" />
            <div className="sir-prism-ribbon sir-prism-ribbon-two" />
            <div className="sir-prism-shimmer" />
            <svg className="sir-prism-stars" viewBox="0 0 1000 260" preserveAspectRatio="none">
              <defs>
                <radialGradient id="sirPrismStar"><stop stopColor="#fff"/><stop offset=".24" stopColor="#fff" stopOpacity=".95"/><stop offset="1" stopColor="#c4b5fd" stopOpacity="0"/></radialGradient>
              </defs>
              {[[75,42,11],[220,206,7],[364,35,9],[535,219,12],[700,48,8],[890,192,11],[956,37,7]].map(([x,y,r],i)=>(
                <g key={i} className={`sir-prism-star sir-prism-star-${i}`}>
                  <circle cx={x} cy={y} r={r*2.5} fill="url(#sirPrismStar)" />
                  <path d={`M${x-r*2} ${y} H${x+r*2} M${x} ${y-r*2} V${y+r*2}`} stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                </g>
              ))}
            </svg>
          </div>
        )}

        {tier === 'mar' && (
          <div className="mar-storm-system">
            <div className="mar-storm-glow" />
            <svg className="mar-storm-lightning mar-constrictor" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <filter id="marConstrictorBloom" x="-35%" y="-100%" width="170%" height="300%">
                  <feGaussianBlur stdDeviation="4.5" />
                </filter>
              </defs>
              {[
                { d: 'M-45 30 L18 17 48 37 78 22 113 45 147 27 184 51 221 36 258 60 295 43 333 66 370 50 409 74 447 56 486 78 523 61 563 82 602 66 644 90 683 72 723 97 763 79 805 103 846 85 886 109 927 91 966 115 1045 93', branch: 'M154 115 L142 84 160 64 M477 173 L489 204 512 217 M803 175 L819 146 841 137' },
                { d: 'M1045 152 L988 168 955 145 919 173 885 153 849 182 815 161 781 190 747 170 712 198 678 178 644 208 608 185 572 217 536 195 501 224 466 202 430 231 395 208 358 238 321 216 285 245 250 223 214 251 178 228 142 253 108 228 73 246 37 221 -45 245', branch: 'M285 245 L275 212 293 190 M644 208 L659 236 683 252' },
                { d: 'M-36 120 L19 100 51 129 86 107 119 138 154 115 189 145 225 122 259 152 294 130 331 160 368 136 404 167 442 142 477 173 515 149 550 179 587 155 624 187 660 163 696 192 731 169 768 197 803 175 838 201 875 180 910 204 946 184 981 208 1040 189', branch: 'M225 122 L207 95 215 71 M696 192 L708 222 731 233' },
                { d: 'M70 -35 L54 17 83 41 64 74 96 102 77 135 109 166 92 199 123 233 104 291', branch: 'M96 102 L128 108 149 125 M92 199 L61 212 45 239' },
                { d: 'M335 -35 L315 8 343 34 321 64 350 91 328 119 360 148 336 177 367 205 345 235 373 291', branch: 'M350 91 L382 83 405 60 M367 205 L397 218 417 241' },
                { d: 'M681 -35 L659 10 688 37 667 67 697 94 674 122 704 150 682 180 712 208 690 237 718 291', branch: 'M697 94 L729 87 749 64 M682 180 L650 189 634 216' },
                { d: 'M963 -35 L943 16 973 45 949 77 979 108 952 139 981 171 957 201 987 231 966 291', branch: 'M979 108 L942 118 918 139 M957 201 L925 215 906 242' },
                { d: 'M-40 64 L12 78 39 63 69 88 100 70 131 96 163 79 194 105 226 88 259 114 290 98 324 123 355 106 388 132 420 115 453 141 487 125 520 151 553 135 587 160 620 144 653 171 687 155 721 181 755 165 790 192 824 176 858 202 892 185 927 212 961 194 1040 222', branch: 'M324 123 L338 94 361 82 M755 165 L743 136 761 112' },
              ].map((arc, index) => (
                <g key={index} className={`mar-coil mar-coil-${index + 1}`}>
                  <g className="mar-coil-bloom" filter="url(#marConstrictorBloom)">
                    <path d={arc.d} /><path d={arc.branch} />
                  </g>
                  <g className="mar-coil-electric">
                    <path d={arc.d} /><path d={arc.branch} />
                  </g>
                  <g className="mar-coil-white">
                    <path d={arc.d} /><path d={arc.branch} />
                  </g>
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>
    )
  }

  function HitCard({ hit }: { hit: any }) {
    const tierClass = getTierClass(hit.hit_tier)
    const breakInfo = getBreakInfo(hit.break_name)
    const resolvedCardName = imageVariantName(hit.hit_name || hit.spot_name, hit.hit_tier)
    const displayCardName = visibleCardName(hit.hit_name || hit.spot_name, hit.hit_tier)
    const imageUrl = resolveCollectorHitImage(
      hitImages,
      breakInfo.setName,
      hit.hit_name || hit.spot_name || '',
      hit.hit_tier
    )

    return (
      <div className={`hit-card ${tierClass}`}>
        <RarityEffects tier={hit.hit_tier} />

        <div className={`hit-layout ${imageUrl ? 'has-image' : ''}`}>
          {imageUrl && (
            <div className="hit-card-art-wrap">
              <img className="hit-card-art" src={imageUrl} alt={resolvedCardName} />
            </div>
          )}

          <div className="hit-content">
          <div className="hit-break">{breakInfo.setName}</div>

          {breakInfo.breakNumber && (
            <div className="break-number">BREAK {breakInfo.breakNumber}</div>
          )}

          <h3>{displayCardName}</h3>

          <div className={`hit-badge badge-${hit.hit_tier}`}>
            {tierLabels[hit.hit_tier] || hit.hit_tier}
          </div>
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
          <h2>The Pack Gods Were Not With You Today</h2>
          <p>
            You entered this break, but nothing found its way into your Vault this time.
          </p>
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
        <h2>The Pack Gods Were Not With You Today</h2>
        <p>
          You&apos;ve entered Collectiverse breaks, but nothing has found its way into your Vault yet.
        </p>
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

        .hit-layout {
          position: relative;
          z-index: 2;
          min-height: 114px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
        }

        .hit-layout.has-image {
          display: grid;
          grid-template-columns: 122px minmax(0, 1fr);
        }

        .hit-card-art-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }

        .hit-card-art {
          display: block;
          width: 112px;
          max-height: 156px;
          object-fit: contain;
          border-radius: 7px;
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.48));
          transform-origin: 50% 50%;
          backface-visibility: hidden;
          will-change: transform;
          animation: cardFaceFloat3D 7.5s ease-in-out infinite;
        }

        @keyframes cardFaceFloat3D {
          0%, 100% { transform: perspective(900px) translate3d(0,-1px,0) rotateX(1deg) rotateY(-1deg) scale(1.004); }
          20% { transform: perspective(900px) translate3d(-2px,-3px,0) rotateX(3.2deg) rotateY(-4.5deg) scale(1.008); }
          45% { transform: perspective(900px) translate3d(2px,-2px,0) rotateX(-2.8deg) rotateY(4deg) scale(1.01); }
          70% { transform: perspective(900px) translate3d(1px,-4px,0) rotateX(4deg) rotateY(2.8deg) scale(1.008); }
          88% { transform: perspective(900px) translate3d(-1px,-2px,0) rotateX(-2deg) rotateY(-3deg) scale(1.006); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hit-card-art { animation: none !important; }
        }

        .hit-layout.has-image .hit-content {
          width: 100%;
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

        .hit-future { border-color: rgba(34,211,238,.75); background: linear-gradient(145deg,rgba(8,47,73,.7),rgba(76,29,149,.38)); box-shadow: 0 0 24px rgba(34,211,238,.22); }
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

          .hit-layout.has-image {
            grid-template-columns: 88px minmax(0, 1fr);
            gap: 12px;
          }

          .hit-card-art {
            width: 82px;
            max-height: 116px;
          }

          .hit-layout.has-image .hit-break { font-size: .82rem; }
          .hit-layout.has-image .break-number { padding: 6px 12px; font-size: .78rem; margin-bottom: 9px; }
          .hit-layout.has-image h3 { font-size: 1.08rem; }
          .hit-layout.has-image .hit-badge { padding: 7px 18px; font-size: .8rem; margin-top: 10px; }

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

        /* Keep the original design; only trim a little vertical space from hit cards. */
        .hit-card {
          padding-top: 10px !important;
          padding-bottom: 10px !important;
        }


        .week-archive {
          max-width: 100%;
          padding: 14px 16px;
          margin-bottom: 16px;
        }

        .week-header {
          margin-bottom: 10px;
        }

        .week-range {
          margin-top: 3px;
          opacity: .68;
          font-size: .76rem;
          font-weight: 850;
        }

        .week-strip {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 7px;
        }

        .week-day {
          min-width: 0;
          height: 62px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.05);
          color: white;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
        }

        .week-day-name {
          opacity: .68;
          font-size: .64rem;
          font-weight: 950;
          text-transform: uppercase;
        }

        .week-day-number {
          font-size: 1.02rem;
          line-height: 1.05;
          font-weight: 950;
        }

        .week-day-month {
          opacity: .55;
          font-size: .58rem;
          font-weight: 850;
          text-transform: uppercase;
        }

        .week-day.has-break {
          border-color: rgba(250,204,21,.8);
          background: rgba(250,204,21,.16);
          box-shadow: 0 0 14px rgba(250,204,21,.24);
        }

        .week-day.selected {
          border: 2px solid #c084fc;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 0 18px rgba(192,132,252,.28);
        }

        @media (max-width: 620px) {
          .week-archive {
            padding: 12px 10px;
          }

          .week-strip {
            gap: 4px;
          }

          .week-day {
            height: 56px;
            border-radius: 11px;
          }

          .week-day-name {
            font-size: .56rem;
          }

          .week-day-number {
            font-size: .92rem;
          }

          .week-day-month {
            display: none;
          }
        }


        /* ===== Premium hit-card visual system =====
           Restrained dark surfaces; rarity is communicated through motion and light. */

        .hit-card,
        .showcase-hit-card {
          --tier-accent: 148, 163, 184;
          --tier-accent-2: 71, 85, 105;
          border: 1px solid rgba(var(--tier-accent), .34) !important;
          background:
            radial-gradient(circle at 16% 18%, rgba(var(--tier-accent), .075), transparent 34%),
            linear-gradient(135deg, rgba(8, 13, 28, .985), rgba(13, 20, 39, .97)) !important;
          box-shadow:
            0 14px 34px rgba(0,0,0,.28),
            inset 0 1px 0 rgba(255,255,255,.045) !important;
          animation: none !important;
        }

        .hit-card::before,
        .showcase-hit-card::before {
          inset: 0 !important;
          z-index: 0 !important;
          opacity: 1 !important;
          background:
            linear-gradient(115deg, transparent 0 34%, rgba(var(--tier-accent), .06) 45%, transparent 56%),
            radial-gradient(circle at 78% 30%, rgba(var(--tier-accent), .06), transparent 24%) !important;
          animation: premiumAmbient 8s ease-in-out infinite !important;
        }

        .hit-card::after,
        .showcase-hit-card::after {
          top: 0 !important;
          bottom: 0 !important;
          left: -42% !important;
          width: 28% !important;
          height: auto !important;
          transform: skewX(-18deg) !important;
          z-index: 1 !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(var(--tier-accent), .05),
            rgba(255,255,255,.22),
            rgba(var(--tier-accent), .08),
            transparent
          ) !important;
          animation: premiumSweep 7s ease-in-out infinite !important;
          pointer-events: none;
        }

        .hit-ex { --tier-accent: 59, 130, 246; --tier-accent-2: 96, 165, 250; }
        .hit-sr { --tier-accent: 139, 92, 246; --tier-accent-2: 192, 132, 252; }
        .hit-ir { --tier-accent: 244, 114, 182; --tier-accent-2: 251, 146, 60; }
        .hit-mar { --tier-accent: 34, 211, 238; --tier-accent-2: 96, 165, 250; }
        .hit-gold { --tier-accent: 212, 175, 55; --tier-accent-2: 250, 204, 21; }
        .hit-sir { --tier-accent: 167, 139, 250; --tier-accent-2: 34, 211, 238; }

        /* EX: controlled electric edge */
        .hit-ex {
          box-shadow:
            0 14px 34px rgba(0,0,0,.28),
            inset 0 0 0 1px rgba(59,130,246,.04) !important;
          animation: exEdge 4.8s ease-in-out infinite !important;
        }

        /* SR: low, slow violet pulse */
        .hit-sr::before {
          background:
            radial-gradient(circle at 72% 50%, rgba(139,92,246,.14), transparent 27%),
            radial-gradient(circle at 28% 50%, rgba(192,132,252,.06), transparent 22%) !important;
          animation: srBreath 5.4s ease-in-out infinite !important;
        }

        /* IR: foil catching a moving warm light */
        .hit-ir::after {
          opacity: .32 !important;
          background: linear-gradient(
            100deg,
            transparent 0 34%,
            rgba(251,146,60,.08) 41%,
            rgba(244,114,182,.20) 48%,
            rgba(255,255,255,.20) 51%,
            rgba(96,165,250,.08) 57%,
            transparent 66%
          ) !important;
          animation: irFoil 6.2s ease-in-out infinite !important;
        }

        /* MAR: dark storm surface with intermittent lightning */
        .hit-mar::before {
          background:
            linear-gradient(116deg,
              transparent 0 43%,
              rgba(125,211,252,0) 44%,
              rgba(224,242,254,.92) 44.6%,
              rgba(34,211,238,.58) 45.1%,
              transparent 45.8% 49%,
              rgba(186,230,253,.70) 49.4%,
              transparent 50.1%),
            radial-gradient(circle at 68% 48%, rgba(34,211,238,.10), transparent 27%) !important;
          background-size: 220% 100%, 100% 100% !important;
          animation: marLightning 5.6s steps(1,end) infinite !important;
        }

        .hit-mar::after {
          opacity: .18 !important;
          background: linear-gradient(90deg, transparent, rgba(34,211,238,.22), transparent) !important;
          animation: marCharge 5.6s ease-in-out infinite !important;
        }

        /* Gold: black metal with a travelling specular highlight */
        .hit-gold {
          background:
            radial-gradient(circle at 18% 18%, rgba(212,175,55,.07), transparent 32%),
            linear-gradient(135deg, #090a0d, #15140f 52%, #090a0d) !important;
        }

        .hit-gold::after {
          opacity: .36 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.08),
            rgba(255,244,190,.42),
            rgba(212,175,55,.10),
            transparent
          ) !important;
          animation: goldSpecular 5.8s ease-in-out infinite !important;
        }

        /* SIR: restrained holographic refraction, not a rainbow background */
        .hit-sir::before {
          background:
            linear-gradient(
              118deg,
              transparent 15%,
              rgba(244,114,182,.08) 28%,
              rgba(250,204,21,.07) 38%,
              rgba(34,211,238,.10) 50%,
              rgba(167,139,250,.11) 61%,
              transparent 76%
            ),
            radial-gradient(circle at 70% 35%, rgba(255,255,255,.07), transparent 25%) !important;
          background-size: 190% 100%, 100% 100% !important;
          animation: sirPrism 7.2s ease-in-out infinite !important;
        }

        .hit-sir::after {
          opacity: .30 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.06),
            rgba(34,211,238,.18),
            rgba(244,114,182,.16),
            rgba(255,255,255,.22),
            transparent
          ) !important;
          animation: sirGlint 6.4s ease-in-out infinite !important;
        }

        /* Keep content and artwork crisp above the effects. */
        .hit-layout,
        .hit-content,
        .hit-card-art-wrap,
        .showcase-hit-card > * {
          position: relative;
          z-index: 3;
        }

        .hit-card-art {
          filter: drop-shadow(0 12px 18px rgba(0,0,0,.52)) !important;
        }

        .hit-break {
          opacity: .68 !important;
          letter-spacing: 1.4px !important;
        }

        .break-number {
          background: rgba(255,255,255,.045) !important;
          border: 1px solid rgba(255,255,255,.20) !important;
          box-shadow: none !important;
          padding: 6px 14px !important;
        }

        .hit-card h3,
        .showcase-hit-card h3 {
          text-shadow: 0 3px 16px rgba(0,0,0,.52) !important;
        }

        .hit-badge {
          padding: 7px 18px !important;
          border: 1px solid rgba(var(--tier-accent), .46) !important;
          background: rgba(var(--tier-accent), .12) !important;
          color: rgb(var(--tier-accent)) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06) !important;
        }

        .cosmic-stars,
        .planet-field,
        .rocket-field {
          display: none !important;
        }

        @keyframes premiumAmbient {
          0%, 100% { opacity: .62; transform: translate3d(0,0,0); }
          50% { opacity: 1; transform: translate3d(-1%,0,0); }
        }

        @keyframes premiumSweep {
          0%, 62% { left: -42%; opacity: 0; }
          68% { opacity: .26; }
          82% { left: 118%; opacity: .18; }
          88%, 100% { left: 118%; opacity: 0; }
        }

        @keyframes exEdge {
          0%,100% { border-color: rgba(59,130,246,.28); }
          50% { border-color: rgba(96,165,250,.58); }
        }

        @keyframes srBreath {
          0%,100% { opacity: .52; transform: scale(1); }
          50% { opacity: .92; transform: scale(1.018); }
        }

        @keyframes irFoil {
          0%,18% { left: -42%; opacity: 0; }
          28% { opacity: .32; }
          62% { left: 118%; opacity: .28; }
          72%,100% { left: 118%; opacity: 0; }
        }

        @keyframes marLightning {
          0%, 69%, 73%, 77%, 100% { background-position: -120% 0, 0 0; opacity: .10; }
          70% { background-position: 12% 0, 0 0; opacity: .95; }
          71% { background-position: 24% 0, 0 0; opacity: .22; }
          72% { background-position: 36% 0, 0 0; opacity: .78; }
          74% { background-position: 55% 0, 0 0; opacity: .14; }
          75% { background-position: 70% 0, 0 0; opacity: .62; }
          76% { background-position: 84% 0, 0 0; opacity: .16; }
        }

        @keyframes marCharge {
          0%,66%,80%,100% { opacity: .04; }
          71%,75% { opacity: .24; }
        }

        @keyframes goldSpecular {
          0%,24% { left: -42%; opacity: 0; }
          35% { opacity: .36; }
          68% { left: 118%; opacity: .28; }
          78%,100% { left: 118%; opacity: 0; }
        }

        @keyframes sirPrism {
          0%,100% { background-position: 0% 50%, 0 0; opacity: .48; }
          50% { background-position: 100% 50%, 0 0; opacity: .82; }
        }

        @keyframes sirGlint {
          0%,30% { left: -42%; opacity: 0; }
          42% { opacity: .30; }
          72% { left: 118%; opacity: .24; }
          82%,100% { left: 118%; opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hit-card,
          .showcase-hit-card,
          .hit-card::before,
          .hit-card::after,
          .showcase-hit-card::before,
          .showcase-hit-card::after {
            animation: none !important;
          }
        }


        /* ===== Motion pass v2: effects are deliberately visible, but still contained ===== */

        .hit-card,
        .showcase-hit-card {
          isolation: isolate;
          overflow: hidden !important;
        }

        /* EX — a cool-blue charge travels around the card edge. */
        .hit-ex {
          animation: exCharge 3.6s ease-in-out infinite !important;
        }

        .hit-ex::before {
          background:
            radial-gradient(circle at 12% 50%, rgba(96,165,250,.20), transparent 26%),
            linear-gradient(90deg, transparent, rgba(59,130,246,.08), transparent) !important;
          animation: exEnergy 3.6s ease-in-out infinite !important;
        }

        /* SR — a restrained violet energy bloom. */
        .hit-sr::before {
          background:
            radial-gradient(circle at 50% 120%, rgba(168,85,247,.28), transparent 42%),
            radial-gradient(circle at 82% 28%, rgba(192,132,252,.12), transparent 24%) !important;
          animation: srEnergy 3.8s ease-in-out infinite !important;
        }

        /* IR — obvious foil sweep, but only for a moment each cycle. */
        .hit-ir::after {
          left: -35% !important;
          width: 22% !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(251,146,60,.10),
            rgba(244,114,182,.38),
            rgba(255,255,255,.48),
            rgba(96,165,250,.14),
            transparent
          ) !important;
          filter: blur(1px);
          animation: irFoilVisible 4.8s ease-in-out infinite !important;
        }

        /* MAR — actual lightning bolt flash rather than a generic light sweep. */
        .hit-mar::before {
          top: -18% !important;
          left: 58% !important;
          right: auto !important;
          bottom: auto !important;
          width: 18% !important;
          height: 145% !important;
          opacity: 0 !important;
          background: linear-gradient(
            180deg,
            rgba(255,255,255,.98),
            rgba(125,211,252,.96) 38%,
            rgba(34,211,238,.82) 70%,
            rgba(255,255,255,.94)
          ) !important;
          clip-path: polygon(
            48% 0,
            70% 0,
            57% 30%,
            78% 30%,
            43% 60%,
            62% 60%,
            20% 100%,
            35% 66%,
            14% 66%,
            43% 36%,
            27% 36%
          );
          filter:
            drop-shadow(0 0 4px rgba(255,255,255,.95))
            drop-shadow(0 0 12px rgba(34,211,238,.95))
            drop-shadow(0 0 22px rgba(14,165,233,.62));
          transform: rotate(9deg) scale(.82);
          animation: marBolt 4.6s steps(1,end) infinite !important;
        }

        .hit-mar::after {
          inset: 0 !important;
          width: auto !important;
          height: auto !important;
          left: 0 !important;
          opacity: 0 !important;
          transform: none !important;
          background:
            radial-gradient(circle at 68% 48%, rgba(224,242,254,.30), transparent 16%),
            linear-gradient(90deg, transparent, rgba(34,211,238,.10), transparent) !important;
          animation: marFlash 4.6s steps(1,end) infinite !important;
        }

        /* Gold — polished black metal with a strong but infrequent gold reflection. */
        .hit-gold::after {
          left: -32% !important;
          width: 18% !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.16),
            rgba(255,246,196,.70),
            rgba(250,204,21,.22),
            transparent
          ) !important;
          animation: goldGlintVisible 5s ease-in-out infinite !important;
        }

        /* SIR — moving holographic film. The card stays dark underneath. */
        .hit-sir::before {
          inset: -55% !important;
          width: auto !important;
          height: auto !important;
          left: -55% !important;
          opacity: .34 !important;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.28) 52deg,
            rgba(167,139,250,.32) 108deg,
            rgba(244,114,182,.26) 162deg,
            rgba(250,204,21,.18) 214deg,
            rgba(34,211,238,.24) 278deg,
            transparent 335deg
          ) !important;
          filter: blur(22px);
          transform: rotate(0deg);
          animation: sirHoloRotate 8s linear infinite !important;
        }

        .hit-sir::after {
          left: -30% !important;
          width: 16% !important;
          opacity: 0 !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.10),
            rgba(255,255,255,.55),
            rgba(34,211,238,.18),
            rgba(244,114,182,.18),
            transparent
          ) !important;
          animation: sirHoloSweep 4.9s ease-in-out infinite !important;
        }

        @keyframes exCharge {
          0%,100% {
            border-color: rgba(59,130,246,.28);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), inset 0 0 0 1px rgba(59,130,246,.02);
          }
          45%,55% {
            border-color: rgba(96,165,250,.72);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 16px rgba(59,130,246,.18), inset 0 0 20px rgba(59,130,246,.06);
          }
        }

        @keyframes exEnergy {
          0%,100% { transform: translateX(-18%); opacity: .35; }
          50% { transform: translateX(18%); opacity: .9; }
        }

        @keyframes srEnergy {
          0%,100% { opacity: .30; transform: scale(.96); }
          50% { opacity: .95; transform: scale(1.08); }
        }

        @keyframes irFoilVisible {
          0%,22% { left: -35%; opacity: 0; }
          30% { opacity: .60; }
          58% { left: 118%; opacity: .48; }
          66%,100% { left: 118%; opacity: 0; }
        }

        @keyframes marBolt {
          0%,68%,72%,76%,100% { opacity: 0; transform: rotate(9deg) scale(.82); }
          69% { opacity: 1; transform: rotate(9deg) scale(1); }
          70% { opacity: .12; }
          71% { opacity: .88; transform: rotate(7deg) scale(.96); }
          73% { opacity: .18; }
          74% { opacity: .72; transform: rotate(10deg) scale(1.02); }
          75% { opacity: .08; }
        }

        @keyframes marFlash {
          0%,68%,72%,76%,100% { opacity: 0; }
          69%,71%,74% { opacity: 1; }
          70%,73%,75% { opacity: .10; }
        }

        @keyframes goldGlintVisible {
          0%,28% { left: -32%; opacity: 0; }
          38% { opacity: .72; }
          66% { left: 116%; opacity: .48; }
          74%,100% { left: 116%; opacity: 0; }
        }

        @keyframes sirHoloRotate {
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          to { transform: rotate(360deg) scale(1); }
        }

        @keyframes sirHoloSweep {
          0%,18% { left: -30%; opacity: 0; }
          28% { opacity: .58; }
          60% { left: 118%; opacity: .40; }
          70%,100% { left: 118%; opacity: 0; }
        }

        /* FIX: animation layers were sitting behind the card background. */
        .hit-card::before,
        .showcase-hit-card::before {
          z-index: 0 !important;
          pointer-events: none !important;
        }

        .hit-card::after,
        .showcase-hit-card::after {
          z-index: 1 !important;
          pointer-events: none !important;
        }

        .hit-layout,
        .hit-content,
        .hit-card-art-wrap,
        .showcase-hit-card > * {
          position: relative;
          z-index: 3 !important;
        }


        /* =====================================================
           RARITY FX — real DOM layers (not pseudo-elements)
           ===================================================== */

        .hit-card {
          isolation: isolate;
          overflow: hidden !important;
        }

        .rarity-fx {
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }

        .rarity-fx > span {
          position: absolute;
          display: block;
          pointer-events: none;
        }

        .hit-card > .hit-layout {
          position: relative;
          z-index: 5 !important;
        }

        /* Disable the old pseudo-element animation layers on actual hit cards.
           The new DOM layers below are now the sole animation system. */
        .hit-card::before,
        .hit-card::after {
          display: none !important;
          animation: none !important;
        }

        /* EX — electric blue energy moving across a dark card */
        .hit-ex .fx-ambient {
          inset: 0;
          background:
            radial-gradient(circle at 10% 50%, rgba(59,130,246,.30), transparent 25%),
            radial-gradient(circle at 90% 50%, rgba(96,165,250,.14), transparent 22%);
          animation: fxExAmbient 3.2s ease-in-out infinite;
        }

        .hit-ex .fx-primary {
          top: 0;
          bottom: 0;
          left: -22%;
          width: 20%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(96,165,250,.38), transparent);
          filter: blur(8px);
          animation: fxTravel 3.2s ease-in-out infinite;
        }

        /* SR — violet energy breathing from underneath */
        .hit-sr .fx-ambient {
          left: 18%;
          right: 18%;
          bottom: -80%;
          height: 150%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(168,85,247,.38), rgba(126,34,206,.12) 42%, transparent 68%);
          filter: blur(12px);
          animation: fxSrPulse 3.4s ease-in-out infinite;
        }

        .hit-sr .fx-secondary {
          inset: 0;
          background: radial-gradient(circle at 78% 28%, rgba(216,180,254,.12), transparent 20%);
          animation: fxSrDrift 5s ease-in-out infinite;
        }

        /* IR — iridescent foil reflection */
        .hit-ir .fx-primary {
          top: -20%;
          bottom: -20%;
          left: -28%;
          width: 24%;
          transform: rotate(12deg);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(251,146,60,.16),
            rgba(244,114,182,.52),
            rgba(255,255,255,.72),
            rgba(96,165,250,.22),
            transparent
          );
          filter: blur(2px);
          animation: fxIrFoil 4.3s ease-in-out infinite;
        }

        .hit-ir .fx-ambient {
          inset: 0;
          background: radial-gradient(circle at 75% 50%, rgba(244,114,182,.12), transparent 30%);
        }

        /* MAR — unmistakable lightning bolt + storm flash */
        .hit-mar .fx-ambient {
          inset: 0;
          opacity: 0;
          background:
            radial-gradient(circle at 70% 48%, rgba(224,242,254,.42), transparent 18%),
            radial-gradient(circle at 65% 48%, rgba(34,211,238,.20), transparent 35%);
          animation: fxMarFlash 4.2s steps(1,end) infinite;
        }

        .hit-mar .fx-primary {
          top: -16%;
          left: 65%;
          width: 14%;
          height: 140%;
          opacity: 0;
          background: linear-gradient(180deg, #fff, #bae6fd 34%, #22d3ee 72%, #fff);
          clip-path: polygon(
            46% 0, 68% 0, 56% 28%, 78% 28%,
            45% 57%, 64% 57%, 19% 100%,
            35% 65%, 14% 65%, 42% 35%, 27% 35%
          );
          filter:
            drop-shadow(0 0 4px #fff)
            drop-shadow(0 0 11px rgba(34,211,238,1))
            drop-shadow(0 0 25px rgba(14,165,233,.9));
          animation: fxMarBolt 4.2s steps(1,end) infinite;
        }

        .hit-mar .fx-secondary {
          top: 18%;
          left: 48%;
          width: 9%;
          height: 78%;
          opacity: 0;
          transform: rotate(-17deg);
          background: linear-gradient(180deg, #fff, #67e8f9, #fff);
          clip-path: polygon(45% 0, 68% 0, 55% 39%, 78% 39%, 23% 100%, 39% 55%, 18% 55%);
          filter: drop-shadow(0 0 9px rgba(34,211,238,.95));
          animation: fxMarBoltSmall 4.2s steps(1,end) infinite;
        }

        /* GOLD — polished black metal with a gold specular reflection */
        .hit-gold .fx-ambient {
          inset: 0;
          background:
            radial-gradient(circle at 18% 20%, rgba(212,175,55,.12), transparent 25%),
            radial-gradient(circle at 82% 70%, rgba(250,204,21,.08), transparent 26%);
        }

        .hit-gold .fx-primary {
          top: -20%;
          bottom: -20%;
          left: -28%;
          width: 19%;
          transform: rotate(12deg);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.20),
            rgba(255,248,203,.88),
            rgba(250,204,21,.34),
            transparent
          );
          filter: blur(1px);
          animation: fxGoldSweep 4.6s ease-in-out infinite;
        }

        /* SIR — rotating holographic film plus sharp foil glint */
        .hit-sir .fx-ambient {
          inset: -80%;
          opacity: .52;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.34) 50deg,
            rgba(167,139,250,.42) 105deg,
            rgba(244,114,182,.34) 165deg,
            rgba(250,204,21,.22) 220deg,
            rgba(34,211,238,.32) 285deg,
            transparent 340deg
          );
          filter: blur(26px);
          animation: fxSirRotate 7s linear infinite;
        }

        .hit-sir .fx-primary {
          top: -20%;
          bottom: -20%;
          left: -28%;
          width: 18%;
          transform: rotate(12deg);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.08),
            rgba(255,255,255,.72),
            rgba(34,211,238,.28),
            rgba(244,114,182,.24),
            transparent
          );
          animation: fxSirSweep 4.5s ease-in-out infinite;
        }

        .hit-sir .fx-secondary {
          inset: 0;
          background:
            linear-gradient(120deg,
              transparent 15%,
              rgba(34,211,238,.08) 35%,
              rgba(167,139,250,.10) 48%,
              rgba(244,114,182,.08) 62%,
              transparent 80%);
          background-size: 220% 100%;
          animation: fxSirFilm 5.5s ease-in-out infinite;
        }

        @keyframes fxTravel {
          0%,18% { left: -22%; opacity: 0; }
          30% { opacity: 1; }
          65% { left: 112%; opacity: .7; }
          76%,100% { left: 112%; opacity: 0; }
        }

        @keyframes fxExAmbient {
          0%,100% { opacity: .35; transform: translateX(-2%); }
          50% { opacity: .9; transform: translateX(2%); }
        }

        @keyframes fxSrPulse {
          0%,100% { opacity: .25; transform: scale(.88); }
          50% { opacity: .9; transform: scale(1.12); }
        }

        @keyframes fxSrDrift {
          0%,100% { transform: translateX(-4%); opacity: .35; }
          50% { transform: translateX(4%); opacity: .85; }
        }

        @keyframes fxIrFoil {
          0%,18% { left: -28%; opacity: 0; }
          28% { opacity: .85; }
          62% { left: 115%; opacity: .58; }
          72%,100% { left: 115%; opacity: 0; }
        }

        @keyframes fxMarBolt {
          0%,61%,65%,69%,100% { opacity: 0; transform: rotate(8deg) scale(.84); }
          62% { opacity: 1; transform: rotate(8deg) scale(1); }
          63% { opacity: .10; }
          64% { opacity: .94; transform: rotate(5deg) scale(.97); }
          66% { opacity: .12; }
          67% { opacity: .78; transform: rotate(10deg) scale(1.03); }
          68% { opacity: .06; }
        }

        @keyframes fxMarBoltSmall {
          0%,63%,67%,100% { opacity: 0; }
          64% { opacity: .82; }
          65% { opacity: .08; }
          66% { opacity: .62; }
        }

        @keyframes fxMarFlash {
          0%,61%,65%,69%,100% { opacity: 0; }
          62%,64%,67% { opacity: 1; }
          63%,66%,68% { opacity: .08; }
        }

        @keyframes fxGoldSweep {
          0%,20% { left: -28%; opacity: 0; }
          30% { opacity: .9; }
          62% { left: 114%; opacity: .65; }
          72%,100% { left: 114%; opacity: 0; }
        }

        @keyframes fxSirRotate {
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.08); }
          to { transform: rotate(360deg) scale(1); }
        }

        @keyframes fxSirSweep {
          0%,16% { left: -28%; opacity: 0; }
          28% { opacity: .85; }
          62% { left: 114%; opacity: .62; }
          72%,100% { left: 114%; opacity: 0; }
        }

        @keyframes fxSirFilm {
          0%,100% { background-position: 0% 50%; opacity: .45; }
          50% { background-position: 100% 50%; opacity: .9; }
        }

        @media (prefers-reduced-motion: reduce) {
          .rarity-fx > span {
            animation: none !important;
          }
        }


        /* =====================================================
           PREMIUM FX V2 — stronger high-tier spectacle
           ===================================================== */

        /* SR — faint drifting energy particles on top of the existing bloom */
        .hit-sr .fx-detail {
          inset: 0;
          opacity: .45;
          background-image:
            radial-gradient(circle, rgba(216,180,254,.72) 0 1px, transparent 1.6px),
            radial-gradient(circle, rgba(168,85,247,.55) 0 1.2px, transparent 1.8px);
          background-size: 42px 42px, 67px 67px;
          background-position: 8px 12px, 31px 4px;
          animation: fxSrParticles 7s linear infinite;
        }

        /* IR — add a slow full-surface iridescent film behind the foil sweep */
        .hit-ir .fx-secondary {
          inset: -20%;
          opacity: .28;
          background:
            linear-gradient(
              115deg,
              rgba(251,146,60,.14),
              rgba(244,114,182,.18),
              rgba(167,139,250,.13),
              rgba(34,211,238,.12),
              rgba(251,146,60,.12)
            );
          background-size: 220% 220%;
          filter: blur(18px);
          animation: fxIrFilm 7s ease-in-out infinite;
        }

        /* MAR — storm field, extra branching bolt and travelling electric border */
        .hit-mar {
          animation: fxMarBorder 3.4s ease-in-out infinite !important;
        }

        .hit-mar .fx-ambient {
          background:
            radial-gradient(circle at 70% 48%, rgba(224,242,254,.48), transparent 17%),
            radial-gradient(circle at 65% 48%, rgba(34,211,238,.22), transparent 34%),
            linear-gradient(115deg, transparent 0 42%, rgba(34,211,238,.06) 50%, transparent 58%);
          background-size: 100% 100%, 100% 100%, 180% 100%;
          animation: fxMarStorm 4.2s steps(1,end) infinite;
        }

        .hit-mar .fx-detail {
          top: -10%;
          left: 34%;
          width: 8%;
          height: 115%;
          opacity: 0;
          transform: rotate(18deg);
          background: linear-gradient(180deg, #fff, #67e8f9 50%, #fff);
          clip-path: polygon(
            43% 0, 66% 0, 54% 25%, 77% 25%,
            45% 51%, 66% 51%, 18% 100%,
            36% 59%, 15% 59%, 41% 32%, 25% 32%
          );
          filter:
            drop-shadow(0 0 4px rgba(255,255,255,1))
            drop-shadow(0 0 10px rgba(34,211,238,.95));
          animation: fxMarBranch 4.2s steps(1,end) infinite;
        }

        /* GOLD — animated metal surface, gold dust and a breathing edge */
        .hit-gold {
          animation: fxGoldBorder 4s ease-in-out infinite !important;
        }

        .hit-gold .fx-ambient {
          inset: 0;
          background:
            radial-gradient(circle at 18% 20%, rgba(212,175,55,.16), transparent 24%),
            radial-gradient(circle at 82% 70%, rgba(250,204,21,.11), transparent 25%),
            linear-gradient(120deg, rgba(255,255,255,.015), rgba(212,175,55,.07), rgba(255,255,255,.01));
          background-size: 100% 100%, 100% 100%, 210% 100%;
          animation: fxGoldMetal 6s ease-in-out infinite;
        }

        .hit-gold .fx-detail {
          inset: 0;
          opacity: .68;
          background-image:
            radial-gradient(circle, rgba(255,235,140,.90) 0 1px, transparent 1.7px),
            radial-gradient(circle, rgba(212,175,55,.72) 0 1.3px, transparent 2px),
            radial-gradient(circle, rgba(255,248,203,.56) 0 .8px, transparent 1.5px);
          background-size: 53px 53px, 79px 79px, 101px 101px;
          background-position: 4px 11px, 33px 7px, 16px 48px;
          animation: fxGoldDust 8s linear infinite;
        }

        /* SIR — showpiece: layered prism field, spectral rays, particles and animated edge */
        .hit-sir {
          animation: fxSirBorder 3.6s ease-in-out infinite !important;
        }

        .hit-sir .fx-ambient {
          inset: -65%;
          opacity: .68;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.40) 46deg,
            rgba(99,102,241,.34) 86deg,
            rgba(167,139,250,.46) 125deg,
            rgba(244,114,182,.40) 168deg,
            rgba(250,204,21,.26) 214deg,
            rgba(52,211,153,.20) 254deg,
            rgba(34,211,238,.38) 302deg,
            transparent 344deg
          );
          filter: blur(24px);
          animation: fxSirRotateV2 6.5s linear infinite;
        }

        .hit-sir .fx-secondary {
          inset: 0;
          opacity: .64;
          background:
            linear-gradient(
              112deg,
              transparent 8%,
              rgba(34,211,238,.13) 28%,
              transparent 39%,
              rgba(167,139,250,.16) 51%,
              transparent 62%,
              rgba(244,114,182,.13) 76%,
              transparent 91%
            );
          background-size: 240% 100%;
          animation: fxSirRays 4.8s ease-in-out infinite;
        }

        .hit-sir .fx-detail {
          inset: 0;
          opacity: .62;
          background-image:
            radial-gradient(circle, rgba(255,255,255,.88) 0 .9px, transparent 1.7px),
            radial-gradient(circle, rgba(103,232,249,.72) 0 1.1px, transparent 1.8px),
            radial-gradient(circle, rgba(244,114,182,.62) 0 .9px, transparent 1.6px);
          background-size: 49px 49px, 73px 73px, 97px 97px;
          background-position: 7px 13px, 38px 2px, 19px 39px;
          animation: fxSirParticles 7s linear infinite;
        }

        @keyframes fxSrParticles {
          from { background-position: 8px 12px, 31px 4px; }
          to { background-position: 8px -72px, 31px -130px; }
        }

        @keyframes fxIrFilm {
          0%,100% { background-position: 0% 50%; transform: scale(1); }
          50% { background-position: 100% 50%; transform: scale(1.05); }
        }

        @keyframes fxMarBorder {
          0%,58%,72%,100% {
            border-color: rgba(34,211,238,.28);
            box-shadow: 0 14px 34px rgba(0,0,0,.28);
          }
          62%,66%,69% {
            border-color: rgba(186,230,253,.92);
            box-shadow:
              0 14px 34px rgba(0,0,0,.28),
              0 0 14px rgba(34,211,238,.30),
              inset 0 0 16px rgba(34,211,238,.08);
          }
        }

        @keyframes fxMarStorm {
          0%,60%,64%,68%,72%,100% {
            opacity: .10;
            background-position: 0 0, 0 0, -60% 0;
          }
          61%,65%,69% {
            opacity: 1;
            background-position: 0 0, 0 0, 80% 0;
          }
          62%,66%,70% { opacity: .18; }
        }

        @keyframes fxMarBranch {
          0%,64%,68%,100% { opacity: 0; }
          65% { opacity: .92; transform: rotate(18deg) scale(1); }
          66% { opacity: .08; }
          67% { opacity: .72; transform: rotate(15deg) scale(.96); }
        }

        @keyframes fxGoldBorder {
          0%,100% {
            border-color: rgba(212,175,55,.34);
            box-shadow: 0 14px 34px rgba(0,0,0,.28);
          }
          50% {
            border-color: rgba(255,224,102,.78);
            box-shadow:
              0 14px 34px rgba(0,0,0,.28),
              0 0 14px rgba(212,175,55,.20),
              inset 0 0 14px rgba(212,175,55,.05);
          }
        }

        @keyframes fxGoldMetal {
          0%,100% { background-position: 0 0, 0 0, 0% 50%; }
          50% { background-position: 0 0, 0 0, 100% 50%; }
        }

        @keyframes fxGoldDust {
          from { background-position: 4px 11px, 33px 7px, 16px 48px; }
          to { background-position: 4px -95px, 33px -151px, 16px -154px; }
        }

        @keyframes fxSirBorder {
          0%,100% {
            border-color: rgba(167,139,250,.38);
            box-shadow: 0 14px 34px rgba(0,0,0,.28);
          }
          33% {
            border-color: rgba(34,211,238,.72);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 15px rgba(34,211,238,.17);
          }
          66% {
            border-color: rgba(244,114,182,.68);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 15px rgba(244,114,182,.15);
          }
        }

        @keyframes fxSirRotateV2 {
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.12); }
          to { transform: rotate(360deg) scale(1); }
        }

        @keyframes fxSirRays {
          0%,100% { background-position: 0% 50%; opacity: .38; }
          50% { background-position: 100% 50%; opacity: .78; }
        }

        @keyframes fxSirParticles {
          from { background-position: 7px 13px, 38px 2px, 19px 39px; }
          to { background-position: 7px -85px, 38px -144px, 19px -155px; }
        }


        /* =====================================================
           PREMIUM FX V3 — clear rarity hierarchy
           MAR = constant electrical storm
           GOLD = molten black/gold metal
           SIR = dimensional prismatic glass
           ===================================================== */

        /* ---------- MAR: CONSTANT ELECTRICAL STORM ---------- */

        .hit-mar {
          border-color: rgba(103,232,249,.48) !important;
          animation: marChargedEdge 2.1s ease-in-out infinite !important;
        }

        .hit-mar .fx-ambient {
          inset: 0;
          opacity: .72 !important;
          background:
            radial-gradient(circle at 18% 18%, rgba(34,211,238,.13), transparent 22%),
            radial-gradient(circle at 82% 78%, rgba(59,130,246,.12), transparent 25%),
            linear-gradient(115deg, transparent 0 40%, rgba(34,211,238,.045) 50%, transparent 60%);
          background-size: 100% 100%, 100% 100%, 190% 100%;
          animation: marStormDrift 4s linear infinite !important;
        }

        /* long branching arc running diagonally behind content */
        .hit-mar .fx-primary {
          top: -12% !important;
          left: 6% !important;
          width: 92% !important;
          height: 122% !important;
          opacity: .78 !important;
          transform: none !important;
          background: none !important;
          filter: none !important;
          animation: marArcFlickerA 1.35s steps(1,end) infinite !important;
        }

        .hit-mar .fx-primary::before,
        .hit-mar .fx-primary::after,
        .hit-mar .fx-secondary::before,
        .hit-mar .fx-secondary::after,
        .hit-mar .fx-extra::before,
        .hit-mar .fx-extra::after {
          content: "";
          position: absolute;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, #e0f2fe 12%, #67e8f9 50%, #ffffff 82%, transparent);
          height: 2px;
          border-radius: 999px;
          filter:
            drop-shadow(0 0 2px rgba(255,255,255,.95))
            drop-shadow(0 0 5px rgba(34,211,238,.95))
            drop-shadow(0 0 10px rgba(14,165,233,.65));
        }

        .hit-mar .fx-primary::before {
          width: 64%;
          top: 18%;
          left: 2%;
          transform: rotate(8deg);
          clip-path: polygon(0 40%, 14% 0, 25% 65%, 39% 18%, 52% 82%, 67% 24%, 82% 72%, 100% 30%, 100% 70%, 83% 100%, 67% 48%, 52% 100%, 39% 42%, 25% 90%, 14% 30%, 0 65%);
        }

        .hit-mar .fx-primary::after {
          width: 54%;
          right: 1%;
          bottom: 19%;
          transform: rotate(-10deg);
        }

        .hit-mar .fx-secondary {
          inset: 0 !important;
          width: auto !important;
          height: auto !important;
          left: 0 !important;
          opacity: .74 !important;
          transform: none !important;
          background: none !important;
          animation: marArcFlickerB 1.7s steps(1,end) infinite !important;
        }

        .hit-mar .fx-secondary::before {
          width: 48%;
          top: 48%;
          left: -3%;
          transform: rotate(-7deg);
        }

        .hit-mar .fx-secondary::after {
          width: 42%;
          top: 38%;
          right: -3%;
          transform: rotate(12deg);
        }

        /* electric perimeter lines */
        .hit-mar .fx-detail {
          inset: 4px !important;
          opacity: .78 !important;
          border-radius: inherit;
          border-top: 1px solid rgba(186,230,253,.78);
          border-right: 1px solid rgba(34,211,238,.48);
          border-bottom: 1px solid rgba(96,165,250,.58);
          border-left: 1px solid rgba(103,232,249,.42);
          box-shadow:
            inset 0 0 10px rgba(34,211,238,.08),
            0 0 8px rgba(34,211,238,.12);
          background: none !important;
          animation: marPerimeter 1.8s ease-in-out infinite !important;
        }

        .hit-mar .fx-extra {
          inset: 0;
          opacity: .8;
          animation: marArcFlickerC 1.1s steps(1,end) infinite;
        }

        .hit-mar .fx-extra::before {
          width: 36%;
          top: 8%;
          right: 8%;
          transform: rotate(-4deg);
        }

        .hit-mar .fx-extra::after {
          width: 31%;
          bottom: 8%;
          left: 12%;
          transform: rotate(5deg);
        }

        .hit-mar .fx-flare {
          inset: 0;
          opacity: .12;
          background: radial-gradient(circle at 60% 50%, rgba(224,242,254,.42), transparent 32%);
          animation: marChargeGlow 2.2s ease-in-out infinite;
        }

        /* ---------- GOLD: MOLTEN BLACK METAL ---------- */

        .hit-gold {
          border-color: rgba(212,175,55,.55) !important;
          background:
            radial-gradient(circle at 20% 15%, rgba(212,175,55,.07), transparent 30%),
            linear-gradient(135deg, #060606, #15130b 52%, #070707) !important;
          animation: goldLivingEdge 3.2s ease-in-out infinite !important;
        }

        /* slow molten veins */
        .hit-gold .fx-ambient {
          inset: -12% !important;
          opacity: .62 !important;
          background:
            repeating-linear-gradient(
              118deg,
              transparent 0 9%,
              rgba(212,175,55,.03) 10%,
              rgba(255,215,96,.24) 10.7%,
              rgba(212,175,55,.05) 11.4%,
              transparent 12.3% 22%
            );
          background-size: 180% 180%;
          filter: blur(.3px);
          animation: goldVeins 7s ease-in-out infinite !important;
        }

        .hit-gold .fx-primary {
          top: -22% !important;
          bottom: -22% !important;
          left: -26% !important;
          width: 17% !important;
          transform: rotate(12deg) !important;
          opacity: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.16),
            rgba(255,248,203,.96),
            rgba(250,204,21,.38),
            transparent
          ) !important;
          filter: blur(.4px);
          animation: goldLuxurySweep 4.7s ease-in-out infinite !important;
        }

        .hit-gold .fx-secondary {
          inset: 0 !important;
          opacity: .74 !important;
          background-image:
            radial-gradient(circle, rgba(255,238,155,.92) 0 1px, transparent 1.8px),
            radial-gradient(circle, rgba(212,175,55,.68) 0 1.2px, transparent 2px),
            radial-gradient(circle, rgba(255,248,203,.46) 0 .8px, transparent 1.5px) !important;
          background-size: 47px 47px, 73px 73px, 101px 101px !important;
          background-position: 5px 13px, 31px 4px, 18px 44px !important;
          animation: goldSparks 6.8s linear infinite !important;
        }

        .hit-gold .fx-detail {
          inset: 3px !important;
          border-radius: inherit;
          border: 1px solid rgba(255,222,112,.34);
          background: none !important;
          box-shadow:
            inset 0 0 16px rgba(212,175,55,.07),
            0 0 9px rgba(212,175,55,.08);
          animation: goldInnerEdge 2.8s ease-in-out infinite !important;
        }

        /* molten glow pockets moving beneath the surface */
        .hit-gold .fx-extra {
          inset: 0;
          opacity: .48;
          background:
            radial-gradient(ellipse at 22% 72%, rgba(250,204,21,.18), transparent 16%),
            radial-gradient(ellipse at 62% 28%, rgba(212,175,55,.16), transparent 18%),
            radial-gradient(ellipse at 84% 66%, rgba(255,230,128,.13), transparent 15%);
          filter: blur(8px);
          animation: goldMoltenGlow 5.2s ease-in-out infinite;
        }

        .hit-gold .fx-flare {
          inset: 0;
          opacity: 0;
          background: radial-gradient(circle at 50% 50%, rgba(255,238,160,.20), transparent 42%);
          animation: goldPowerPulse 6s ease-in-out infinite;
        }

        /* ---------- SIR: DIMENSIONAL PRISM / HOLOGRAPHIC GLASS ---------- */

        .hit-sir {
          border-color: rgba(196,181,253,.58) !important;
          background:
            radial-gradient(circle at 18% 15%, rgba(34,211,238,.055), transparent 28%),
            radial-gradient(circle at 85% 80%, rgba(244,114,182,.055), transparent 30%),
            linear-gradient(135deg, #060913, #101326 52%, #070912) !important;
          animation: sirLivingBorder 3.8s linear infinite !important;
        }

        /* deep rotating prism */
        .hit-sir .fx-ambient {
          inset: -68% !important;
          opacity: .72 !important;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(34,211,238,.42) 44deg,
            rgba(99,102,241,.38) 88deg,
            rgba(167,139,250,.50) 128deg,
            rgba(244,114,182,.44) 170deg,
            rgba(250,204,21,.28) 214deg,
            rgba(52,211,153,.24) 260deg,
            rgba(34,211,238,.40) 304deg,
            transparent 346deg
          ) !important;
          filter: blur(22px);
          animation: sirDimensionRotate 6s linear infinite !important;
        }

        /* sharp spectral flare */
        .hit-sir .fx-primary {
          top: -25% !important;
          bottom: -25% !important;
          left: -28% !important;
          width: 19% !important;
          opacity: 0;
          transform: rotate(12deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.10),
            rgba(255,255,255,.92),
            rgba(103,232,249,.34),
            rgba(196,181,253,.36),
            rgba(244,114,182,.30),
            transparent
          ) !important;
          filter: blur(.3px);
          animation: sirSpectralFlare 4.2s ease-in-out infinite !important;
        }

        /* moving refracted glass rays */
        .hit-sir .fx-secondary {
          inset: 0 !important;
          opacity: .72 !important;
          background:
            linear-gradient(
              112deg,
              transparent 4%,
              rgba(34,211,238,.13) 19%,
              transparent 31%,
              rgba(167,139,250,.17) 43%,
              transparent 56%,
              rgba(244,114,182,.15) 70%,
              transparent 84%,
              rgba(250,204,21,.08) 94%
            ) !important;
          background-size: 260% 100% !important;
          animation: sirGlassRays 4.5s ease-in-out infinite !important;
        }

        /* prism dust */
        .hit-sir .fx-detail {
          inset: 0 !important;
          opacity: .72 !important;
          border: 0 !important;
          box-shadow: none !important;
          background-image:
            radial-gradient(circle, rgba(255,255,255,.96) 0 .9px, transparent 1.8px),
            radial-gradient(circle, rgba(103,232,249,.78) 0 1.1px, transparent 1.9px),
            radial-gradient(circle, rgba(244,114,182,.70) 0 .9px, transparent 1.7px),
            radial-gradient(circle, rgba(196,181,253,.72) 0 1px, transparent 1.8px) !important;
          background-size: 43px 43px, 67px 67px, 89px 89px, 113px 113px !important;
          background-position: 7px 12px, 31px 3px, 18px 41px, 51px 22px !important;
          animation: sirPrismDust 6.5s linear infinite !important;
        }

        /* dimensional lens/refraction layer */
        .hit-sir .fx-extra {
          inset: -15%;
          opacity: .46;
          background:
            radial-gradient(ellipse at 28% 50%, transparent 0 15%, rgba(34,211,238,.13) 22%, transparent 34%),
            radial-gradient(ellipse at 68% 45%, transparent 0 13%, rgba(244,114,182,.13) 21%, transparent 35%),
            radial-gradient(ellipse at 50% 65%, transparent 0 12%, rgba(167,139,250,.14) 20%, transparent 34%);
          filter: blur(3px);
          animation: sirLensDrift 5.5s ease-in-out infinite;
        }

        /* occasional jackpot-wide holographic bloom */
        .hit-sir .fx-flare {
          inset: 0;
          opacity: 0;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.24), transparent 18%),
            radial-gradient(circle at 50% 50%, rgba(103,232,249,.18), transparent 38%),
            linear-gradient(90deg, transparent, rgba(196,181,253,.12), transparent);
          animation: sirJackpotBloom 6.4s ease-in-out infinite;
        }

        @keyframes marChargedEdge {
          0%,100% {
            border-color: rgba(103,232,249,.42);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 8px rgba(34,211,238,.08);
          }
          50% {
            border-color: rgba(224,242,254,.74);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 15px rgba(34,211,238,.18);
          }
        }

        @keyframes marStormDrift {
          from { background-position: 0 0, 0 0, -70% 0; }
          to { background-position: 0 0, 0 0, 120% 0; }
        }

        @keyframes marArcFlickerA {
          0%,100% { opacity: .72; transform: translate(0,0); }
          14% { opacity: .28; transform: translate(1px,-1px); }
          17% { opacity: .92; }
          43% { opacity: .56; transform: translate(-1px,1px); }
          47% { opacity: .96; }
          71% { opacity: .38; }
          75% { opacity: .86; }
        }

        @keyframes marArcFlickerB {
          0%,100% { opacity: .46; }
          20% { opacity: .88; }
          23% { opacity: .24; }
          52% { opacity: .72; }
          56% { opacity: .30; }
          82% { opacity: .94; }
        }

        @keyframes marArcFlickerC {
          0%,100% { opacity: .34; }
          11% { opacity: .92; }
          15% { opacity: .18; }
          38% { opacity: .70; }
          44% { opacity: .26; }
          67% { opacity: .88; }
          73% { opacity: .22; }
        }

        @keyframes marPerimeter {
          0%,100% { opacity: .55; filter: brightness(.9); }
          50% { opacity: 1; filter: brightness(1.35); }
        }

        @keyframes marChargeGlow {
          0%,100% { opacity: .08; transform: scale(.96); }
          50% { opacity: .24; transform: scale(1.04); }
        }

        @keyframes goldLivingEdge {
          0%,100% {
            border-color: rgba(212,175,55,.42);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 8px rgba(212,175,55,.07);
          }
          50% {
            border-color: rgba(255,224,112,.80);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 17px rgba(212,175,55,.19);
          }
        }

        @keyframes goldVeins {
          0%,100% { background-position: 0% 20%; opacity: .40; }
          50% { background-position: 100% 80%; opacity: .78; }
        }

        @keyframes goldLuxurySweep {
          0%,18% { left: -26%; opacity: 0; }
          28% { opacity: .94; }
          60% { left: 116%; opacity: .72; }
          70%,100% { left: 116%; opacity: 0; }
        }

        @keyframes goldSparks {
          from { background-position: 5px 13px, 31px 4px, 18px 44px; }
          to { background-position: 5px -81px, 31px -142px, 18px -158px; }
        }

        @keyframes goldInnerEdge {
          0%,100% { opacity: .46; }
          50% { opacity: .92; }
        }

        @keyframes goldMoltenGlow {
          0%,100% { transform: translateX(-2%) scale(.96); opacity: .30; }
          50% { transform: translateX(2%) scale(1.06); opacity: .62; }
        }

        @keyframes goldPowerPulse {
          0%,72%,100% { opacity: 0; }
          82% { opacity: .62; }
          90% { opacity: .10; }
        }

        @keyframes sirLivingBorder {
          0%,100% {
            border-color: rgba(103,232,249,.58);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 12px rgba(34,211,238,.12);
          }
          25% {
            border-color: rgba(167,139,250,.72);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 15px rgba(167,139,250,.14);
          }
          50% {
            border-color: rgba(244,114,182,.70);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 15px rgba(244,114,182,.13);
          }
          75% {
            border-color: rgba(250,204,21,.52);
            box-shadow: 0 14px 34px rgba(0,0,0,.30), 0 0 13px rgba(250,204,21,.10);
          }
        }

        @keyframes sirDimensionRotate {
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.13); }
          to { transform: rotate(360deg) scale(1); }
        }

        @keyframes sirSpectralFlare {
          0%,14% { left: -28%; opacity: 0; }
          25% { opacity: .96; }
          58% { left: 116%; opacity: .72; }
          68%,100% { left: 116%; opacity: 0; }
        }

        @keyframes sirGlassRays {
          0%,100% { background-position: 0% 50%; opacity: .48; }
          50% { background-position: 100% 50%; opacity: .86; }
        }

        @keyframes sirPrismDust {
          from { background-position: 7px 12px, 31px 3px, 18px 41px, 51px 22px; }
          to { background-position: 7px -74px, 31px -131px, 18px -137px, 51px -204px; }
        }

        @keyframes sirLensDrift {
          0%,100% { transform: translate(-2%,0) rotate(-2deg) scale(.96); }
          50% { transform: translate(2%,1%) rotate(2deg) scale(1.06); }
        }

        @keyframes sirJackpotBloom {
          0%,68%,100% { opacity: 0; transform: scale(.92); }
          78% { opacity: .78; transform: scale(1.02); }
          84% { opacity: .26; }
          89% { opacity: .58; transform: scale(1.06); }
          94% { opacity: .08; }
        }


        /* =====================================================
           RARITY FX V4 — professional escalating hierarchy
           EX -> SR -> IR -> MAR -> GOLD -> SIR
           ===================================================== */

        /* Kill the previous V3 cartoon bolt pieces for MAR. */
        .rarity-fx-v4 .fx-primary::before,
        .rarity-fx-v4 .fx-primary::after,
        .rarity-fx-v4 .fx-secondary::before,
        .rarity-fx-v4 .fx-secondary::after,
        .rarity-fx-v4 .fx-extra::before,
        .rarity-fx-v4 .fx-extra::after {
          content: none !important;
        }

        /* Shared restraint: effects live inside the card and content stays crisp. */
        .rarity-fx-v4 {
          mix-blend-mode: normal;
        }

        /* EX — cool electric current / premium entry tier */
        .hit-ex .fx-ambient {
          inset: 0 !important;
          opacity: .62 !important;
          background:
            radial-gradient(ellipse at 12% 50%, rgba(59,130,246,.22), transparent 26%),
            radial-gradient(ellipse at 88% 50%, rgba(96,165,250,.12), transparent 24%) !important;
          animation: v4ExBreath 2.8s ease-in-out infinite !important;
        }

        .hit-ex .fx-primary {
          top: auto !important;
          left: -15% !important;
          bottom: 4px !important;
          width: 28% !important;
          height: 1px !important;
          opacity: .9 !important;
          transform: none !important;
          background: linear-gradient(90deg, transparent, #93c5fd, transparent) !important;
          box-shadow: 0 0 8px rgba(59,130,246,.55);
          animation: v4EdgeRun 3s linear infinite !important;
        }

        /* SR — denser violet energy field + elegant drifting motes */
        .hit-sr .fx-ambient {
          inset: -12% !important;
          opacity: .56 !important;
          background:
            radial-gradient(circle at 28% 75%, rgba(126,34,206,.25), transparent 30%),
            radial-gradient(circle at 72% 30%, rgba(192,132,252,.18), transparent 28%) !important;
          filter: blur(10px);
          animation: v4SrField 3.2s ease-in-out infinite !important;
        }

        .hit-sr .fx-detail {
          inset: 0 !important;
          opacity: .52 !important;
          background-image:
            radial-gradient(circle, rgba(216,180,254,.78) 0 .8px, transparent 1.6px),
            radial-gradient(circle, rgba(167,139,250,.58) 0 1px, transparent 1.8px) !important;
          background-size: 46px 46px, 71px 71px !important;
          animation: v4Motes 7s linear infinite !important;
        }

        /* IR — continuously shifting premium foil, like a card under light */
        .hit-ir .fx-ambient {
          inset: -25% !important;
          opacity: .34 !important;
          background: conic-gradient(
            from 40deg,
            rgba(251,146,60,.13),
            rgba(244,114,182,.20),
            rgba(167,139,250,.14),
            rgba(34,211,238,.12),
            rgba(251,146,60,.13)
          ) !important;
          filter: blur(22px);
          animation: v4IrRotate 8s linear infinite !important;
        }

        .hit-ir .fx-primary {
          top: -20% !important;
          bottom: -20% !important;
          left: -22% !important;
          width: 14% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.52), rgba(244,114,182,.24), transparent) !important;
          animation: v4FoilSweep 4.4s ease-in-out infinite !important;
        }

        /* MAR — constant realistic electrical field.
           Thin SVG arcs wrap all four sides and pulse asynchronously. */
        .hit-mar {
          border-color: rgba(103,232,249,.46) !important;
          animation: v4MarCardPulse 1.9s ease-in-out infinite !important;
        }

        .hit-mar .fx-primary,
        .hit-mar .fx-secondary,
        .hit-mar .fx-detail,
        .hit-mar .fx-extra {
          display: none !important;
        }

        .hit-mar .fx-ambient {
          inset: 0 !important;
          opacity: .48 !important;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(34,211,238,.13), transparent 34%),
            radial-gradient(ellipse at 50% 100%, rgba(59,130,246,.11), transparent 35%) !important;
          animation: v4MarAtmosphere 2s ease-in-out infinite !important;
        }

        .mar-electric-field {
          position: absolute;
          inset: 2px;
          width: calc(100% - 4px);
          height: calc(100% - 4px);
          z-index: 4;
          overflow: visible;
          pointer-events: none;
        }

        .electric-arc,
        .electric-branch {
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .electric-arc {
          stroke: rgba(224,242,254,.96);
          stroke-width: 1.35;
          stroke-dasharray: 5 3 18 4 3 7;
          filter: drop-shadow(0 0 2px rgba(255,255,255,.95)) drop-shadow(0 0 5px rgba(34,211,238,.85));
        }

        .electric-branch {
          stroke: rgba(103,232,249,.82);
          stroke-width: .85;
          stroke-dasharray: 3 3 8 4;
          filter: drop-shadow(0 0 3px rgba(34,211,238,.72));
        }

        .arc-a { animation: v4ArcA .92s steps(2,end) infinite; }
        .arc-b { animation: v4ArcB 1.17s steps(2,end) infinite; }
        .arc-c { animation: v4ArcC .78s steps(2,end) infinite; }
        .arc-d { animation: v4ArcD 1.04s steps(2,end) infinite; }
        .branch-a { animation: v4Branch .63s steps(2,end) infinite; }
        .branch-b { animation: v4Branch .81s steps(2,end) infinite reverse; }
        .branch-c { animation: v4Branch .71s steps(2,end) infinite; }
        .branch-d { animation: v4Branch .96s steps(2,end) infinite reverse; }

        .hit-mar .fx-flare {
          inset: 0 !important;
          opacity: .10 !important;
          background: radial-gradient(circle at 50% 50%, rgba(224,242,254,.20), transparent 55%) !important;
          animation: v4MarInnerPulse 1.45s ease-in-out infinite !important;
        }

        /* GOLD — visibly above MAR: living molten metal rather than electricity */
        .hit-gold {
          border-color: rgba(226,190,74,.56) !important;
          background: linear-gradient(135deg, #050505, #141107 50%, #070604) !important;
          animation: v4GoldEdge 2.8s ease-in-out infinite !important;
        }

        .hit-gold .fx-ambient {
          inset: -10% !important;
          opacity: .72 !important;
          background:
            repeating-linear-gradient(
              126deg,
              transparent 0 8%,
              rgba(255,220,110,.03) 8.6%,
              rgba(255,220,110,.30) 9.1%,
              rgba(180,126,22,.10) 9.8%,
              transparent 10.7% 19%
            ) !important;
          background-size: 190% 190% !important;
          filter: blur(.4px);
          animation: v4GoldVeins 5.5s ease-in-out infinite !important;
        }

        .hit-gold .fx-primary {
          top: -25% !important;
          bottom: -25% !important;
          left: -20% !important;
          width: 13% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(90deg, transparent, rgba(255,247,198,.92), rgba(212,175,55,.32), transparent) !important;
          animation: v4GoldSweep 4s ease-in-out infinite !important;
        }

        .hit-gold .fx-secondary {
          inset: 0 !important;
          opacity: .68 !important;
          background-image:
            radial-gradient(circle, rgba(255,238,155,.92) 0 .8px, transparent 1.7px),
            radial-gradient(circle, rgba(212,175,55,.68) 0 1px, transparent 1.8px) !important;
          background-size: 49px 49px, 77px 77px !important;
          animation: v4GoldEmbers 6s linear infinite !important;
        }

        .hit-gold .fx-detail {
          inset: 3px !important;
          border: 1px solid rgba(255,225,125,.42) !important;
          border-radius: inherit;
          background: none !important;
          box-shadow: inset 0 0 16px rgba(212,175,55,.08);
          animation: v4GoldInner 2.2s ease-in-out infinite !important;
        }

        .hit-gold .fx-extra {
          inset: 0 !important;
          opacity: .58 !important;
          background:
            radial-gradient(ellipse at 18% 70%, rgba(250,204,21,.18), transparent 14%),
            radial-gradient(ellipse at 58% 28%, rgba(212,175,55,.20), transparent 16%),
            radial-gradient(ellipse at 86% 68%, rgba(255,228,128,.16), transparent 14%) !important;
          filter: blur(9px);
          animation: v4GoldPools 4.5s ease-in-out infinite !important;
        }

        /* SIR — top tier: animated prismatic glass with depth and flare */
        .hit-sir {
          border-color: rgba(196,181,253,.62) !important;
          background: linear-gradient(135deg, #050712, #0e1225 50%, #070812) !important;
          animation: v4SirEdge 3s linear infinite !important;
        }

        .hit-sir .fx-ambient {
          inset: -72% !important;
          opacity: .76 !important;
          background: conic-gradient(
            from 0deg,
            rgba(34,211,238,.36),
            rgba(99,102,241,.34),
            rgba(167,139,250,.48),
            rgba(244,114,182,.40),
            rgba(250,204,21,.24),
            rgba(52,211,153,.22),
            rgba(34,211,238,.36)
          ) !important;
          filter: blur(24px);
          animation: v4SirPrism 5.8s linear infinite !important;
        }

        .hit-sir .fx-primary {
          top: -25% !important;
          bottom: -25% !important;
          left: -24% !important;
          width: 15% !important;
          opacity: 0 !important;
          transform: rotate(11deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.16),
            rgba(255,255,255,.96),
            rgba(103,232,249,.32),
            rgba(196,181,253,.36),
            rgba(244,114,182,.30),
            transparent
          ) !important;
          animation: v4SirFlare 3.8s ease-in-out infinite !important;
        }

        .hit-sir .fx-secondary {
          inset: 0 !important;
          opacity: .78 !important;
          background:
            linear-gradient(112deg,
              transparent 4%,
              rgba(34,211,238,.14) 18%,
              transparent 30%,
              rgba(167,139,250,.18) 43%,
              transparent 56%,
              rgba(244,114,182,.16) 70%,
              transparent 83%,
              rgba(250,204,21,.09) 94%
            ) !important;
          background-size: 280% 100% !important;
          animation: v4SirRays 4s ease-in-out infinite !important;
        }

        .hit-sir .fx-detail {
          inset: 0 !important;
          opacity: .72 !important;
          border: none !important;
          box-shadow: none !important;
          background-image:
            radial-gradient(circle, rgba(255,255,255,.96) 0 .8px, transparent 1.7px),
            radial-gradient(circle, rgba(103,232,249,.78) 0 1px, transparent 1.8px),
            radial-gradient(circle, rgba(244,114,182,.70) 0 .8px, transparent 1.6px),
            radial-gradient(circle, rgba(196,181,253,.72) 0 .9px, transparent 1.7px) !important;
          background-size: 41px 41px, 67px 67px, 91px 91px, 119px 119px !important;
          animation: v4SirDust 5.8s linear infinite !important;
        }

        .hit-sir .fx-extra {
          inset: -12% !important;
          opacity: .52 !important;
          background:
            radial-gradient(ellipse at 26% 50%, transparent 0 14%, rgba(34,211,238,.15) 21%, transparent 33%),
            radial-gradient(ellipse at 68% 44%, transparent 0 12%, rgba(244,114,182,.15) 20%, transparent 34%),
            radial-gradient(ellipse at 50% 68%, transparent 0 12%, rgba(167,139,250,.16) 20%, transparent 34%) !important;
          filter: blur(3px);
          animation: v4SirLens 4.8s ease-in-out infinite !important;
        }

        .hit-sir .fx-flare {
          inset: 0 !important;
          opacity: 0 !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.26), transparent 17%),
            radial-gradient(circle at 50% 50%, rgba(103,232,249,.18), transparent 38%),
            linear-gradient(90deg, transparent, rgba(196,181,253,.13), transparent) !important;
          animation: v4SirBloom 5.4s ease-in-out infinite !important;
        }

        @keyframes v4ExBreath {
          0%,100% { opacity:.38; transform:scale(.98); }
          50% { opacity:.78; transform:scale(1.02); }
        }
        @keyframes v4EdgeRun {
          from { left:-15%; }
          to { left:105%; }
        }
        @keyframes v4SrField {
          0%,100% { transform:translate(-2%,1%) scale(.96); opacity:.38; }
          50% { transform:translate(2%,-1%) scale(1.07); opacity:.74; }
        }
        @keyframes v4Motes {
          from { background-position:0 0, 20px 30px; }
          to { background-position:0 -92px, 20px -112px; }
        }
        @keyframes v4IrRotate {
          from { transform:rotate(0deg) scale(1); }
          to { transform:rotate(360deg) scale(1.05); }
        }
        @keyframes v4FoilSweep {
          0%,18% { left:-22%; opacity:0; }
          30% { opacity:.72; }
          62% { left:112%; opacity:.50; }
          72%,100% { left:112%; opacity:0; }
        }

        @keyframes v4MarCardPulse {
          0%,100% { box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 8px rgba(34,211,238,.10); }
          50% { box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 16px rgba(34,211,238,.20); }
        }
        @keyframes v4MarAtmosphere {
          0%,100% { opacity:.32; }
          50% { opacity:.62; }
        }
        @keyframes v4ArcA {
          0% { opacity:.42; stroke-dashoffset:0; }
          24% { opacity:1; }
          27% { opacity:.30; }
          54% { opacity:.82; stroke-dashoffset:-13; }
          72% { opacity:.48; }
          100% { opacity:.76; stroke-dashoffset:-26; }
        }
        @keyframes v4ArcB {
          0% { opacity:.72; stroke-dashoffset:0; }
          18% { opacity:.35; }
          21% { opacity:.94; }
          49% { opacity:.50; stroke-dashoffset:11; }
          77% { opacity:1; }
          100% { opacity:.52; stroke-dashoffset:24; }
        }
        @keyframes v4ArcC {
          0% { opacity:.36; }
          16% { opacity:.96; }
          19% { opacity:.26; }
          46% { opacity:.80; }
          70% { opacity:.42; }
          73% { opacity:1; }
          100% { opacity:.58; }
        }
        @keyframes v4ArcD {
          0% { opacity:.82; }
          31% { opacity:.30; }
          34% { opacity:.98; }
          63% { opacity:.48; }
          86% { opacity:.92; }
          100% { opacity:.54; }
        }
        @keyframes v4Branch {
          0%,100% { opacity:.22; }
          35% { opacity:.92; }
          41% { opacity:.30; }
          72% { opacity:.74; }
        }
        @keyframes v4MarInnerPulse {
          0%,100% { opacity:.06; transform:scale(.96); }
          50% { opacity:.20; transform:scale(1.04); }
        }

        @keyframes v4GoldEdge {
          0%,100% { box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 9px rgba(212,175,55,.08); }
          50% { box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(212,175,55,.20); }
        }
        @keyframes v4GoldVeins {
          0%,100% { background-position:0% 15%; opacity:.48; }
          50% { background-position:100% 85%; opacity:.82; }
        }
        @keyframes v4GoldSweep {
          0%,16% { left:-20%; opacity:0; }
          27% { opacity:.96; }
          58% { left:112%; opacity:.68; }
          68%,100% { left:112%; opacity:0; }
        }
        @keyframes v4GoldEmbers {
          from { background-position:5px 12px, 28px 5px; }
          to { background-position:5px -86px, 28px -149px; }
        }
        @keyframes v4GoldInner {
          0%,100% { opacity:.44; }
          50% { opacity:.94; }
        }
        @keyframes v4GoldPools {
          0%,100% { transform:translateX(-2%) scale(.96); opacity:.34; }
          50% { transform:translateX(2%) scale(1.07); opacity:.68; }
        }

        @keyframes v4SirEdge {
          0%,100% { border-color:rgba(103,232,249,.58); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 12px rgba(34,211,238,.12); }
          25% { border-color:rgba(167,139,250,.76); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 16px rgba(167,139,250,.16); }
          50% { border-color:rgba(244,114,182,.72); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 16px rgba(244,114,182,.14); }
          75% { border-color:rgba(250,204,21,.52); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 14px rgba(250,204,21,.10); }
        }
        @keyframes v4SirPrism {
          from { transform:rotate(0deg) scale(1); }
          50% { transform:rotate(180deg) scale(1.13); }
          to { transform:rotate(360deg) scale(1); }
        }
        @keyframes v4SirFlare {
          0%,12% { left:-24%; opacity:0; }
          24% { opacity:.98; }
          56% { left:112%; opacity:.70; }
          66%,100% { left:112%; opacity:0; }
        }
        @keyframes v4SirRays {
          0%,100% { background-position:0% 50%; opacity:.52; }
          50% { background-position:100% 50%; opacity:.90; }
        }
        @keyframes v4SirDust {
          from { background-position:7px 12px,31px 3px,18px 41px,51px 22px; }
          to { background-position:7px -70px,31px -131px,18px -141px,51px -216px; }
        }
        @keyframes v4SirLens {
          0%,100% { transform:translate(-2%,0) rotate(-2deg) scale(.96); }
          50% { transform:translate(2%,1%) rotate(2deg) scale(1.07); }
        }
        @keyframes v4SirBloom {
          0%,65%,100% { opacity:0; transform:scale(.92); }
          76% { opacity:.82; transform:scale(1.02); }
          83% { opacity:.22; }
          89% { opacity:.58; transform:scale(1.07); }
          94% { opacity:.06; }
        }

        /* =====================================================
           RARITY FX V5 — refinement pass
           Keeps SR + MAR direction, restores Gold motion,
           gives EX an identity, makes IR clearly > SR,
           and makes SIR the unmistakable top tier.
           ===================================================== */

        /* EX — subtle but no longer empty:
           a restrained blue plasma ribbon + edge current. */
        .hit-ex {
          border-color: rgba(96,165,250,.32) !important;
        }

        .hit-ex .fx-ambient {
          inset: -8% !important;
          opacity: .58 !important;
          background:
            radial-gradient(ellipse at 16% 55%, rgba(59,130,246,.22), transparent 24%),
            radial-gradient(ellipse at 82% 42%, rgba(125,211,252,.12), transparent 24%),
            linear-gradient(110deg, transparent 25%, rgba(59,130,246,.07) 48%, transparent 70%) !important;
          background-size: 100% 100%, 100% 100%, 190% 100% !important;
          animation: v5ExField 3.4s ease-in-out infinite !important;
        }

        .hit-ex .fx-primary {
          display: block !important;
          top: auto !important;
          bottom: 3px !important;
          left: -18% !important;
          width: 25% !important;
          height: 1px !important;
          opacity: .9 !important;
          transform: none !important;
          background: linear-gradient(90deg, transparent, rgba(191,219,254,.95), rgba(59,130,246,.72), transparent) !important;
          box-shadow: 0 0 7px rgba(59,130,246,.48);
          animation: v5ExEdgeCurrent 2.9s linear infinite !important;
        }

        .hit-ex .fx-secondary {
          display: block !important;
          inset: 0 !important;
          opacity: .34 !important;
          background:
            linear-gradient(118deg, transparent 10%, rgba(96,165,250,.09) 42%, transparent 58%) !important;
          background-size: 210% 100% !important;
          animation: v5ExRibbon 4.4s ease-in-out infinite !important;
        }

        /* IR — now a proper rarity jump over SR:
           living aurora foil + interference bands + bright foil glint. */
        .hit-ir {
          border-color: rgba(244,114,182,.38) !important;
          background:
            radial-gradient(circle at 16% 20%, rgba(244,114,182,.045), transparent 26%),
            radial-gradient(circle at 84% 78%, rgba(34,211,238,.045), transparent 28%),
            linear-gradient(135deg, #08090d, #101016 52%, #08090c) !important;
          animation: v5IrEdge 4.4s ease-in-out infinite !important;
        }

        .hit-ir .fx-ambient {
          inset: -55% !important;
          opacity: .58 !important;
          background: conic-gradient(
            from 30deg,
            rgba(251,146,60,.16),
            rgba(244,114,182,.30),
            rgba(167,139,250,.24),
            rgba(34,211,238,.22),
            rgba(52,211,153,.13),
            rgba(251,146,60,.16)
          ) !important;
          filter: blur(25px);
          animation: v5IrAurora 8s linear infinite !important;
        }

        .hit-ir .fx-primary {
          display: block !important;
          top: -25% !important;
          bottom: -25% !important;
          left: -22% !important;
          width: 14% !important;
          opacity: 0 !important;
          transform: rotate(11deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.12),
            rgba(255,255,255,.72),
            rgba(244,114,182,.34),
            rgba(34,211,238,.24),
            transparent
          ) !important;
          filter: blur(.3px);
          animation: v5IrSweep 3.9s ease-in-out infinite !important;
        }

        .hit-ir .fx-secondary {
          display: block !important;
          inset: 0 !important;
          opacity: .55 !important;
          background:
            repeating-linear-gradient(
              118deg,
              transparent 0 8%,
              rgba(244,114,182,.07) 9%,
              transparent 11% 18%,
              rgba(34,211,238,.06) 19%,
              transparent 21% 30%
            ) !important;
          background-size: 190% 160% !important;
          animation: v5IrInterference 6.2s ease-in-out infinite !important;
        }

        .hit-ir .fx-detail {
          display: block !important;
          inset: 0 !important;
          opacity: .42 !important;
          border: none !important;
          background:
            radial-gradient(circle at 28% 35%, rgba(255,255,255,.30) 0 .7px, transparent 1.4px),
            radial-gradient(circle at 72% 65%, rgba(244,114,182,.34) 0 .8px, transparent 1.5px) !important;
          background-size: 54px 54px, 83px 83px !important;
          animation: v5IrDust 8s linear infinite !important;
        }

        /* GOLD — restore obvious continuous movement.
           Keep the V4 black/melted-gold identity the user likes. */
        .hit-gold .fx-ambient {
          inset: -18% !important;
          opacity: .78 !important;
          background:
            repeating-linear-gradient(
              126deg,
              transparent 0 7%,
              rgba(255,220,110,.035) 7.8%,
              rgba(255,220,110,.34) 8.5%,
              rgba(180,126,22,.12) 9.2%,
              transparent 10.2% 18%
            ) !important;
          background-size: 220% 220% !important;
          filter: blur(.45px);
          animation: v5GoldVeins 4.6s linear infinite !important;
        }

        .hit-gold .fx-primary {
          display: block !important;
          top: -25% !important;
          bottom: -25% !important;
          left: -24% !important;
          width: 14% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(212,175,55,.18),
            rgba(255,249,205,.96),
            rgba(250,204,21,.38),
            transparent
          ) !important;
          filter: blur(.35px);
          animation: v5GoldSweep 3.7s ease-in-out infinite !important;
        }

        .hit-gold .fx-secondary {
          display: block !important;
          inset: 0 !important;
          opacity: .72 !important;
          background-image:
            radial-gradient(circle, rgba(255,239,158,.95) 0 .8px, transparent 1.7px),
            radial-gradient(circle, rgba(212,175,55,.72) 0 1px, transparent 1.8px) !important;
          background-size: 47px 47px, 73px 73px !important;
          animation: v5GoldEmbers 5.2s linear infinite !important;
        }

        .hit-gold .fx-extra {
          display: block !important;
          inset: -5% !important;
          opacity: .66 !important;
          background:
            radial-gradient(ellipse at 18% 70%, rgba(250,204,21,.20), transparent 14%),
            radial-gradient(ellipse at 58% 28%, rgba(212,175,55,.22), transparent 16%),
            radial-gradient(ellipse at 86% 68%, rgba(255,228,128,.18), transparent 14%) !important;
          filter: blur(8px);
          animation: v5GoldMolten 3.8s ease-in-out infinite !important;
        }

        .hit-gold .fx-flare {
          display: block !important;
          inset: 0 !important;
          opacity: .18 !important;
          background: linear-gradient(105deg, transparent 25%, rgba(255,220,110,.09) 50%, transparent 75%) !important;
          background-size: 220% 100% !important;
          animation: v5GoldSurface 4.8s ease-in-out infinite !important;
        }

        /* SIR — top-tier showpiece:
           animated holographic glass, aurora depth, spectral caustics,
           crystal shimmer and periodic jackpot flare. */
        .hit-sir {
          border-color: rgba(196,181,253,.68) !important;
          background:
            radial-gradient(circle at 12% 16%, rgba(34,211,238,.065), transparent 25%),
            radial-gradient(circle at 86% 82%, rgba(244,114,182,.065), transparent 27%),
            linear-gradient(135deg, #050712, #0d1122 50%, #060711) !important;
          animation: v5SirBorder 2.8s linear infinite !important;
        }

        .hit-sir .fx-ambient {
          inset: -75% !important;
          opacity: .86 !important;
          background: conic-gradient(
            from 0deg,
            rgba(34,211,238,.44),
            rgba(59,130,246,.30),
            rgba(139,92,246,.48),
            rgba(244,114,182,.46),
            rgba(251,191,36,.28),
            rgba(52,211,153,.25),
            rgba(34,211,238,.44)
          ) !important;
          filter: blur(22px);
          animation: v5SirAurora 5.1s linear infinite !important;
        }

        .hit-sir .fx-primary {
          display: block !important;
          top: -28% !important;
          bottom: -28% !important;
          left: -24% !important;
          width: 16% !important;
          opacity: 0 !important;
          transform: rotate(11deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.12),
            rgba(255,255,255,1),
            rgba(103,232,249,.38),
            rgba(196,181,253,.42),
            rgba(244,114,182,.36),
            transparent
          ) !important;
          filter: blur(.25px);
          animation: v5SirSpectralSweep 3.25s ease-in-out infinite !important;
        }

        .hit-sir .fx-secondary {
          display: block !important;
          inset: -4% !important;
          opacity: .82 !important;
          background:
            linear-gradient(
              112deg,
              transparent 4%,
              rgba(34,211,238,.16) 16%,
              transparent 27%,
              rgba(167,139,250,.22) 40%,
              transparent 52%,
              rgba(244,114,182,.19) 65%,
              transparent 78%,
              rgba(250,204,21,.11) 91%,
              transparent
            ) !important;
          background-size: 300% 100% !important;
          filter: blur(.2px);
          animation: v5SirCaustics 3.7s ease-in-out infinite !important;
        }

        .hit-sir .fx-detail {
          display: block !important;
          inset: 0 !important;
          opacity: .82 !important;
          border: none !important;
          box-shadow: none !important;
          background-image:
            radial-gradient(circle, rgba(255,255,255,1) 0 .9px, transparent 1.8px),
            radial-gradient(circle, rgba(103,232,249,.86) 0 1px, transparent 1.9px),
            radial-gradient(circle, rgba(244,114,182,.80) 0 .9px, transparent 1.7px),
            radial-gradient(circle, rgba(196,181,253,.82) 0 1px, transparent 1.8px) !important;
          background-size: 37px 37px, 61px 61px, 83px 83px, 109px 109px !important;
          animation: v5SirCrystalDust 5.1s linear infinite !important;
        }

        .hit-sir .fx-extra {
          display: block !important;
          inset: -16% !important;
          opacity: .62 !important;
          background:
            radial-gradient(ellipse at 24% 48%, transparent 0 13%, rgba(34,211,238,.18) 20%, transparent 32%),
            radial-gradient(ellipse at 70% 42%, transparent 0 11%, rgba(244,114,182,.18) 19%, transparent 33%),
            radial-gradient(ellipse at 50% 70%, transparent 0 11%, rgba(167,139,250,.20) 19%, transparent 33%) !important;
          filter: blur(2.5px);
          animation: v5SirGlassDepth 4.2s ease-in-out infinite !important;
        }

        .hit-sir .fx-flare {
          display: block !important;
          inset: 0 !important;
          opacity: 0 !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.32), transparent 14%),
            radial-gradient(circle at 50% 50%, rgba(103,232,249,.21), transparent 34%),
            radial-gradient(circle at 50% 50%, rgba(244,114,182,.13), transparent 52%) !important;
          animation: v5SirJackpot 4.9s ease-in-out infinite !important;
        }

        @keyframes v5ExField {
          0%,100% { background-position:0 0,0 0,-70% 0; opacity:.42; }
          50% { background-position:0 0,0 0,110% 0; opacity:.68; }
        }
        @keyframes v5ExEdgeCurrent {
          from { left:-18%; }
          to { left:108%; }
        }
        @keyframes v5ExRibbon {
          0%,100% { background-position:0% 50%; opacity:.20; }
          50% { background-position:100% 50%; opacity:.48; }
        }

        @keyframes v5IrEdge {
          0%,100% { border-color:rgba(244,114,182,.32); box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 7px rgba(244,114,182,.05); }
          50% { border-color:rgba(103,232,249,.48); box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 11px rgba(34,211,238,.10); }
        }
        @keyframes v5IrAurora {
          from { transform:rotate(0deg) scale(1); }
          50% { transform:rotate(180deg) scale(1.08); }
          to { transform:rotate(360deg) scale(1); }
        }
        @keyframes v5IrSweep {
          0%,14% { left:-22%; opacity:0; }
          26% { opacity:.84; }
          59% { left:113%; opacity:.55; }
          69%,100% { left:113%; opacity:0; }
        }
        @keyframes v5IrInterference {
          0%,100% { background-position:0% 20%; opacity:.38; }
          50% { background-position:100% 80%; opacity:.68; }
        }
        @keyframes v5IrDust {
          from { background-position:0 0,25px 40px; }
          to { background-position:0 -108px,25px -126px; }
        }

        @keyframes v5GoldVeins {
          from { background-position:0% 0%; }
          to { background-position:100% 100%; }
        }
        @keyframes v5GoldSweep {
          0%,12% { left:-24%; opacity:0; }
          24% { opacity:.98; }
          57% { left:114%; opacity:.72; }
          67%,100% { left:114%; opacity:0; }
        }
        @keyframes v5GoldEmbers {
          from { background-position:5px 12px,28px 5px; }
          to { background-position:5px -82px,28px -141px; }
        }
        @keyframes v5GoldMolten {
          0%,100% { transform:translate(-2%,1%) scale(.95); opacity:.40; }
          50% { transform:translate(2%,-1%) scale(1.08); opacity:.76; }
        }
        @keyframes v5GoldSurface {
          0%,100% { background-position:0% 50%; opacity:.10; }
          50% { background-position:100% 50%; opacity:.30; }
        }

        @keyframes v5SirBorder {
          0%,100% { border-color:rgba(103,232,249,.62); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 13px rgba(34,211,238,.13); }
          25% { border-color:rgba(167,139,250,.82); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(167,139,250,.18); }
          50% { border-color:rgba(244,114,182,.78); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(244,114,182,.16); }
          75% { border-color:rgba(250,204,21,.58); box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 15px rgba(250,204,21,.11); }
        }
        @keyframes v5SirAurora {
          from { transform:rotate(0deg) scale(1); }
          50% { transform:rotate(180deg) scale(1.15); }
          to { transform:rotate(360deg) scale(1); }
        }
        @keyframes v5SirSpectralSweep {
          0%,10% { left:-24%; opacity:0; }
          22% { opacity:1; }
          55% { left:114%; opacity:.78; }
          65%,100% { left:114%; opacity:0; }
        }
        @keyframes v5SirCaustics {
          0%,100% { background-position:0% 50%; opacity:.56; }
          50% { background-position:100% 50%; opacity:.94; }
        }
        @keyframes v5SirCrystalDust {
          from { background-position:7px 12px,31px 3px,18px 41px,51px 22px; }
          to { background-position:7px -62px,31px -119px,18px -125px,51px -196px; }
        }
        @keyframes v5SirGlassDepth {
          0%,100% { transform:translate(-2%,0) rotate(-2deg) scale(.95); }
          50% { transform:translate(2%,1%) rotate(2deg) scale(1.08); }
        }
        @keyframes v5SirJackpot {
          0%,58%,100% { opacity:0; transform:scale(.90); }
          69% { opacity:.92; transform:scale(1.02); }
          76% { opacity:.24; }
          83% { opacity:.68; transform:scale(1.08); }
          90% { opacity:.07; }
        }

        /* =====================================================
           RARITY FX V6 — IR / GOLD / SIR premium refinement
           ===================================================== */

        /* IR: near-MAR tier. More dimensional foil with moving spectral bands
           and a clean diffraction flare, while remaining calmer than MAR. */
        .hit-ir {
          animation: v6IrEdge 3.5s ease-in-out infinite !important;
        }

        .hit-ir .fx-ambient {
          inset: -62% !important;
          opacity: .70 !important;
          background: conic-gradient(
            from 20deg,
            rgba(251,146,60,.18),
            rgba(244,114,182,.36),
            rgba(167,139,250,.31),
            rgba(34,211,238,.28),
            rgba(52,211,153,.18),
            rgba(250,204,21,.13),
            rgba(251,146,60,.18)
          ) !important;
          filter: blur(23px);
          animation: v6IrAurora 6.5s linear infinite !important;
        }

        .hit-ir .fx-primary {
          top: -28% !important;
          bottom: -28% !important;
          left: -25% !important;
          width: 16% !important;
          opacity: 0 !important;
          transform: rotate(10deg) !important;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255,255,255,.10),
            rgba(255,255,255,.88),
            rgba(244,114,182,.42),
            rgba(167,139,250,.30),
            rgba(34,211,238,.32),
            transparent
          ) !important;
          filter: blur(.25px);
          animation: v6IrPrismSweep 3.25s ease-in-out infinite !important;
        }

        .hit-ir .fx-secondary {
          inset: 0 !important;
          opacity: .70 !important;
          background:
            repeating-linear-gradient(
              116deg,
              transparent 0 7%,
              rgba(244,114,182,.10) 8%,
              transparent 10% 15%,
              rgba(34,211,238,.09) 16%,
              transparent 18% 24%,
              rgba(167,139,250,.08) 25%,
              transparent 27% 34%
            ) !important;
          background-size: 220% 180% !important;
          animation: v6IrBands 4.8s ease-in-out infinite !important;
        }

        .hit-ir .fx-extra {
          display: block !important;
          inset: -8% !important;
          opacity: .48 !important;
          background:
            radial-gradient(ellipse at 24% 45%, transparent 0 13%, rgba(244,114,182,.15) 20%, transparent 31%),
            radial-gradient(ellipse at 72% 58%, transparent 0 12%, rgba(34,211,238,.15) 19%, transparent 31%) !important;
          filter: blur(3px);
          animation: v6IrLens 4.2s ease-in-out infinite !important;
        }

        .hit-ir .fx-flare {
          display: block !important;
          inset: 0 !important;
          opacity: 0 !important;
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.20), transparent 14%),
            linear-gradient(90deg, transparent, rgba(244,114,182,.12), rgba(34,211,238,.10), transparent) !important;
          animation: v6IrFlash 5.2s ease-in-out infinite !important;
        }

        /* GOLD: replace the previous abstract vein motion with literal molten
           gold running down the card. */
        .hit-gold .fx-ambient,
        .hit-gold .fx-primary,
        .hit-gold .fx-secondary,
        .hit-gold .fx-extra,
        .hit-gold .fx-flare {
          opacity: 0 !important;
          animation: none !important;
        }

        .hit-gold {
          position: relative;
          overflow: hidden !important;
          background:
            radial-gradient(circle at 50% -10%, rgba(212,175,55,.13), transparent 36%),
            linear-gradient(135deg, #050505, #151108 52%, #070604) !important;
          border-color: rgba(225,190,75,.58) !important;
          animation: v6GoldCardGlow 2.7s ease-in-out infinite !important;
        }

        .gold-molten-system {
          position: absolute;
          inset: 0;
          z-index: 3;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }

        .gold-top-pool {
          position: absolute;
          top: -5px;
          left: -3%;
          width: 106%;
          height: 13px;
          border-radius: 0 0 55% 45%;
          background:
            linear-gradient(180deg, rgba(255,247,190,.96), rgba(250,204,21,.88) 38%, rgba(154,101,14,.86));
          box-shadow:
            0 2px 5px rgba(255,225,110,.38),
            0 7px 16px rgba(212,175,55,.15);
          animation: v6GoldPool 3.2s ease-in-out infinite;
        }

        .gold-drip {
          position: absolute;
          top: 3px;
          width: 5px;
          height: 54%;
          border-radius: 0 0 999px 999px;
          transform-origin: top center;
          background:
            linear-gradient(
              90deg,
              rgba(132,82,8,.80),
              rgba(250,204,21,.96) 32%,
              rgba(255,245,181,1) 52%,
              rgba(212,154,25,.94) 76%,
              rgba(111,67,7,.78)
            );
          box-shadow:
            0 0 5px rgba(250,204,21,.26),
            inset 1px 0 1px rgba(255,255,255,.32);
        }

        .gold-drip::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -4px;
          width: 9px;
          height: 9px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #fff6bd, #facc15 42%, #a16207 82%);
          box-shadow: 0 0 6px rgba(250,204,21,.34);
        }

        .gold-drip-1 {
          left: 15%;
          height: 44%;
          animation: v6GoldDripA 3.6s ease-in-out infinite;
        }
        .gold-drip-2 {
          left: 39%;
          width: 7px;
          height: 68%;
          animation: v6GoldDripB 4.3s ease-in-out infinite .45s;
        }
        .gold-drip-3 {
          left: 68%;
          width: 4px;
          height: 51%;
          animation: v6GoldDripA 3.9s ease-in-out infinite 1.1s;
        }
        .gold-drip-4 {
          left: 86%;
          width: 6px;
          height: 61%;
          animation: v6GoldDripB 4.6s ease-in-out infinite 1.7s;
        }

        .gold-drop {
          position: absolute;
          top: -12px;
          width: 8px;
          height: 11px;
          border-radius: 55% 55% 62% 62%;
          background: radial-gradient(circle at 35% 25%, #fff7c7, #facc15 43%, #9a6708 84%);
          box-shadow: 0 0 6px rgba(250,204,21,.34);
          opacity: 0;
        }

        .gold-drop-1 { left: 27%; animation: v6GoldDrop 3.4s ease-in infinite .2s; }
        .gold-drop-2 { left: 57%; animation: v6GoldDrop 4.1s ease-in infinite 1.3s; }
        .gold-drop-3 { left: 78%; animation: v6GoldDrop 3.7s ease-in infinite 2.1s; }

        /* SIR: keep the classy holographic depth but add an unmistakable
           top-tier flash signature: crystalline starbursts + expanding prism ring. */
        .hit-sir .fx-ambient {
          opacity: .90 !important;
        }

        .hit-sir .fx-primary {
          animation-duration: 2.9s !important;
        }

        .hit-sir .fx-secondary {
          opacity: .88 !important;
          animation-duration: 3.25s !important;
        }

        .sir-flash-system {
          position: absolute;
          inset: 0;
          z-index: 4;
          overflow: hidden;
          border-radius: inherit;
          pointer-events: none;
        }

        .sir-starburst {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          opacity: 0;
          background: #fff;
          box-shadow:
            0 0 6px rgba(255,255,255,.95),
            0 0 14px rgba(103,232,249,.55),
            0 0 22px rgba(196,181,253,.35);
        }

        .sir-starburst::before,
        .sir-starburst::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.95), transparent);
          transform: translate(-50%,-50%);
        }

        .sir-starburst::before {
          width: 74px;
          height: 1px;
        }

        .sir-starburst::after {
          width: 1px;
          height: 74px;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,.95), transparent);
        }

        .sir-starburst-1 {
          top: 28%;
          left: 24%;
          animation: v6SirStarA 4.2s ease-in-out infinite;
        }

        .sir-starburst-2 {
          top: 68%;
          left: 76%;
          animation: v6SirStarB 4.2s ease-in-out infinite 1.7s;
        }

        .sir-rainbow-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 32%;
          aspect-ratio: 1;
          border-radius: 50%;
          opacity: 0;
          transform: translate(-50%,-50%) scale(.35);
          border: 1px solid rgba(255,255,255,.70);
          box-shadow:
            0 -2px 10px rgba(34,211,238,.42),
            2px 0 10px rgba(167,139,250,.40),
            0 2px 10px rgba(244,114,182,.38),
            -2px 0 10px rgba(250,204,21,.25);
          animation: v6SirRing 5s ease-out infinite;
        }

        @keyframes v6IrEdge {
          0%,100% {
            border-color: rgba(244,114,182,.38);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 8px rgba(244,114,182,.07);
          }
          50% {
            border-color: rgba(103,232,249,.58);
            box-shadow: 0 14px 34px rgba(0,0,0,.28), 0 0 14px rgba(34,211,238,.13);
          }
        }
        @keyframes v6IrAurora {
          from { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.11); }
          to { transform: rotate(360deg) scale(1); }
        }
        @keyframes v6IrPrismSweep {
          0%,10% { left:-25%; opacity:0; }
          23% { opacity:.94; }
          57% { left:114%; opacity:.68; }
          67%,100% { left:114%; opacity:0; }
        }
        @keyframes v6IrBands {
          0%,100% { background-position:0% 15%; opacity:.48; }
          50% { background-position:100% 85%; opacity:.80; }
        }
        @keyframes v6IrLens {
          0%,100% { transform:translate(-2%,0) scale(.96); }
          50% { transform:translate(2%,1%) scale(1.06); }
        }
        @keyframes v6IrFlash {
          0%,70%,100% { opacity:0; transform:scale(.95); }
          80% { opacity:.58; transform:scale(1.02); }
          88% { opacity:.10; }
        }

        @keyframes v6GoldCardGlow {
          0%,100% {
            border-color:rgba(225,190,75,.48);
            box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 8px rgba(212,175,55,.08);
          }
          50% {
            border-color:rgba(255,226,124,.80);
            box-shadow:0 14px 34px rgba(0,0,0,.30),0 0 18px rgba(212,175,55,.21);
          }
        }
        @keyframes v6GoldPool {
          0%,100% { transform:translateY(-2px) scaleX(.98); filter:brightness(.92); }
          50% { transform:translateY(1px) scaleX(1.02); filter:brightness(1.18); }
        }
        @keyframes v6GoldDripA {
          0%,100% { transform:scaleY(.22); opacity:.54; }
          45% { transform:scaleY(.86); opacity:.96; }
          70% { transform:scaleY(1); opacity:.82; }
        }
        @keyframes v6GoldDripB {
          0%,100% { transform:scaleY(.30); opacity:.48; }
          38% { transform:scaleY(1); opacity:1; }
          68% { transform:scaleY(.72); opacity:.78; }
        }
        @keyframes v6GoldDrop {
          0%,22% { top:-12px; opacity:0; transform:scale(.65); }
          28% { opacity:1; }
          72% { opacity:.92; transform:scale(1); }
          100% { top:108%; opacity:0; transform:scale(.72); }
        }

        @keyframes v6SirStarA {
          0%,58%,100% { opacity:0; transform:scale(.35) rotate(0deg); }
          68% { opacity:1; transform:scale(1.25) rotate(20deg); }
          76% { opacity:.24; transform:scale(.78) rotate(35deg); }
          82% { opacity:.78; transform:scale(1) rotate(45deg); }
          90% { opacity:0; transform:scale(1.5) rotate(55deg); }
        }
        @keyframes v6SirStarB {
          0%,60%,100% { opacity:0; transform:scale(.3) rotate(45deg); }
          70% { opacity:.92; transform:scale(1.05) rotate(65deg); }
          79% { opacity:.18; }
          86% { opacity:.70; transform:scale(.86) rotate(80deg); }
          94% { opacity:0; transform:scale(1.4) rotate(95deg); }
        }
        @keyframes v6SirRing {
          0%,55% { opacity:0; transform:translate(-50%,-50%) scale(.25); }
          65% { opacity:.78; }
          88% { opacity:.18; }
          100% { opacity:0; transform:translate(-50%,-50%) scale(3.6); }
        }

        /* =====================================================
           V7 — IR signature spectral ribbons + heavier molten Gold
           ===================================================== */

        /* IR's equivalent of MAR lightning:
           continuous luminous spectral ribbons flow across the whole card. */
        .ir-spectral-field {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 4;
          overflow: visible;
          pointer-events: none;
          opacity: .92;
        }

        .ir-ribbon {
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-width: 2.2;
          stroke-dasharray: 34 13 8 12;
        }

        .ir-ribbon-a {
          animation: v7IrRibbonA 3.8s ease-in-out infinite;
        }

        .ir-ribbon-b {
          stroke-width: 1.65;
          opacity: .76;
          animation: v7IrRibbonB 4.5s ease-in-out infinite;
        }

        .ir-ribbon-c {
          stroke-width: 1.05;
          opacity: .58;
          animation: v7IrRibbonC 3.2s ease-in-out infinite;
        }

        .hit-ir .fx-ambient {
          opacity: .76 !important;
          animation-duration: 5.8s !important;
        }

        .hit-ir .fx-primary {
          animation-duration: 2.9s !important;
        }

        .hit-ir .fx-flare {
          background:
            radial-gradient(circle at 50% 50%, rgba(255,255,255,.24), transparent 13%),
            radial-gradient(circle at 50% 50%, rgba(244,114,182,.13), transparent 32%),
            linear-gradient(90deg, transparent, rgba(103,232,249,.11), rgba(244,114,182,.13), transparent) !important;
          animation: v7IrPulse 4.4s ease-in-out infinite !important;
        }

        /* Gold: denser, longer streams. Existing four remain, but now most
           streaks visibly travel deep into / all the way down the card. */
        .gold-drip-1 {
          left: 8% !important;
          height: 94% !important;
          width: 4px !important;
          animation: v7GoldLongA 4.2s ease-in-out infinite !important;
        }

        .gold-drip-2 {
          left: 22% !important;
          height: 112% !important;
          width: 7px !important;
          animation: v7GoldLongB 5.0s ease-in-out infinite .4s !important;
        }

        .gold-drip-3 {
          left: 36% !important;
          height: 82% !important;
          width: 3px !important;
          animation: v7GoldLongA 4.6s ease-in-out infinite .9s !important;
        }

        .gold-drip-4 {
          left: 51% !important;
          height: 118% !important;
          width: 6px !important;
          animation: v7GoldLongB 5.4s ease-in-out infinite 1.4s !important;
        }

        .gold-drip-5 {
          left: 63%;
          height: 91%;
          width: 4px;
          animation: v7GoldLongA 4.8s ease-in-out infinite .7s;
        }

        .gold-drip-6 {
          left: 73%;
          height: 115%;
          width: 7px;
          animation: v7GoldLongB 5.3s ease-in-out infinite 1.8s;
        }

        .gold-drip-7 {
          left: 84%;
          height: 76%;
          width: 3px;
          animation: v7GoldLongA 4.1s ease-in-out infinite 1.2s;
        }

        .gold-drip-8 {
          left: 93%;
          height: 108%;
          width: 5px;
          animation: v7GoldLongB 5.6s ease-in-out infinite 2.2s;
        }

        .gold-drip {
          top: -1px !important;
          background:
            linear-gradient(
              90deg,
              rgba(108,64,5,.78),
              rgba(212,154,25,.92) 18%,
              rgba(255,226,108,.98) 42%,
              rgba(255,248,194,1) 54%,
              rgba(230,174,43,.96) 72%,
              rgba(117,70,6,.80)
            ) !important;
          box-shadow:
            0 0 5px rgba(250,204,21,.25),
            0 0 12px rgba(212,175,55,.09),
            inset 1px 0 1px rgba(255,255,255,.32) !important;
        }

        .gold-top-pool {
          height: 16px !important;
          animation-duration: 2.7s !important;
        }

        @keyframes v7IrRibbonA {
          0%,100% { stroke-dashoffset:0; opacity:.54; transform:translateY(3px); }
          50% { stroke-dashoffset:-86; opacity:1; transform:translateY(-4px); }
        }

        @keyframes v7IrRibbonB {
          0%,100% { stroke-dashoffset:40; opacity:.42; transform:translateY(-3px); }
          50% { stroke-dashoffset:-72; opacity:.88; transform:translateY(4px); }
        }

        @keyframes v7IrRibbonC {
          0%,100% { stroke-dashoffset:-20; opacity:.30; }
          50% { stroke-dashoffset:-108; opacity:.72; }
        }

        @keyframes v7IrPulse {
          0%,62%,100% { opacity:0; transform:scale(.94); }
          73% { opacity:.68; transform:scale(1.02); }
          80% { opacity:.16; }
          86% { opacity:.46; transform:scale(1.05); }
          92% { opacity:.04; }
        }

        @keyframes v7GoldLongA {
          0%,100% { transform:scaleY(.20); opacity:.52; filter:brightness(.86); }
          34% { transform:scaleY(.70); opacity:.92; filter:brightness(1.06); }
          68% { transform:scaleY(1); opacity:1; filter:brightness(1.16); }
          84% { transform:scaleY(.88); opacity:.82; }
        }

        @keyframes v7GoldLongB {
          0%,100% { transform:scaleY(.28); opacity:.48; filter:brightness(.88); }
          28% { transform:scaleY(.56); opacity:.78; }
          57% { transform:scaleY(1); opacity:1; filter:brightness(1.18); }
          76% { transform:scaleY(.92); opacity:.88; }
        }

        /* =====================================================
           V8 — SIR signature: dimensional crystal fracture
           ===================================================== */

        .sir-fracture-system {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 4;
          overflow: hidden;
          pointer-events: none;
        }

        .sir-crack {
          fill: none;
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.35;
          stroke-dasharray: 900;
          stroke-dashoffset: 900;
          opacity: 0;
        }

        .sir-crack-main {
          animation: v8SirFractureMain 6.2s ease-in-out infinite;
        }

        .sir-crack-right {
          animation-delay: .08s;
        }

        .sir-crack-down {
          stroke-width: 1.15;
          animation: v8SirFractureMain 6.2s ease-in-out infinite .15s;
        }

        .sir-crack-up {
          stroke-width: 1.05;
          animation: v8SirFractureMain 6.2s ease-in-out infinite .20s;
        }

        .sir-crack-branch {
          stroke-width: .78;
          animation: v8SirFractureBranch 6.2s ease-in-out infinite;
        }

        .branch-one { animation-delay: .20s; }
        .branch-two { animation-delay: .27s; }
        .branch-three { animation-delay: .24s; }
        .branch-four { animation-delay: .31s; }
        .branch-five { animation-delay: .35s; }
        .branch-six { animation-delay: .29s; }

        .sir-fracture-core {
          fill: rgba(255,255,255,.98);
          opacity: 0;
          filter:
            drop-shadow(0 0 4px rgba(255,255,255,1))
            drop-shadow(0 0 12px rgba(103,232,249,.85))
            drop-shadow(0 0 22px rgba(196,181,253,.55));
          animation: v8SirCore 6.2s ease-in-out infinite;
        }

        /* During the fracture cycle, the whole SIR surface gets a brief
           refractive pulse rather than simply becoming brighter. */
        .hit-sir .fx-flare {
          animation: v8SirRefractivePulse 6.2s ease-in-out infinite !important;
        }

        .hit-sir {
          animation: v8SirGlassBorder 6.2s ease-in-out infinite !important;
        }

        @keyframes v8SirFractureMain {
          0%,54% {
            stroke-dashoffset:900;
            opacity:0;
          }
          58% {
            opacity:.96;
          }
          67% {
            stroke-dashoffset:0;
            opacity:1;
          }
          76% {
            stroke-dashoffset:0;
            opacity:.86;
          }
          83% {
            stroke-dashoffset:-900;
            opacity:.36;
          }
          88%,100% {
            stroke-dashoffset:-900;
            opacity:0;
          }
        }

        @keyframes v8SirFractureBranch {
          0%,58% {
            stroke-dashoffset:900;
            opacity:0;
          }
          64% {
            opacity:.82;
          }
          72% {
            stroke-dashoffset:0;
            opacity:.92;
          }
          79% {
            stroke-dashoffset:0;
            opacity:.64;
          }
          85% {
            stroke-dashoffset:-900;
            opacity:.20;
          }
          89%,100% {
            stroke-dashoffset:-900;
            opacity:0;
          }
        }

        @keyframes v8SirCore {
          0%,54%,88%,100% {
            opacity:0;
            transform:scale(.3);
            transform-origin:505px 126px;
          }
          59% {
            opacity:1;
            transform:scale(1.35);
          }
          66% {
            opacity:.46;
            transform:scale(.72);
          }
          72% {
            opacity:.92;
            transform:scale(1);
          }
          81% {
            opacity:.22;
            transform:scale(.55);
          }
        }

        @keyframes v8SirRefractivePulse {
          0%,53%,100% {
            opacity:0;
            transform:scale(.96);
          }
          59% {
            opacity:.28;
            transform:scale(.99);
          }
          68% {
            opacity:.74;
            transform:scale(1.025);
          }
          76% {
            opacity:.22;
            transform:scale(1.045);
          }
          84% {
            opacity:.58;
            transform:scale(1.065);
          }
          90% {
            opacity:0;
            transform:scale(1.08);
          }
        }

        @keyframes v8SirGlassBorder {
          0%,52%,100% {
            border-color:rgba(103,232,249,.60);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 13px rgba(34,211,238,.12);
          }
          60% {
            border-color:rgba(196,181,253,.84);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 18px rgba(196,181,253,.22);
          }
          68% {
            border-color:rgba(255,255,255,.96);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 8px rgba(255,255,255,.34),
              0 0 22px rgba(103,232,249,.25),
              inset 0 0 15px rgba(196,181,253,.08);
          }
          76% {
            border-color:rgba(244,114,182,.76);
            box-shadow:
              0 14px 34px rgba(0,0,0,.30),
              0 0 18px rgba(244,114,182,.17);
          }
          86% {
            border-color:rgba(167,139,250,.70);
          }
        }

        /* =====================================================
           V8.1 — SIR fracture visibility fix
           Normalised SVG drawing + persistent glass crack + strong pulse
           ===================================================== */

        .sir-fracture-system {
          z-index: 8 !important;
          opacity: 1 !important;
          mix-blend-mode: screen;
        }

        .sir-fracture-glow {
          opacity: 1 !important;
        }

        .sir-crack {
          stroke-dasharray: 1 !important;
          stroke-dashoffset: 0 !important;
          opacity: .16 !important;
          stroke-width: 1.45 !important;
          animation: v81SirCrackPulse 4.8s ease-in-out infinite !important;
        }

        .sir-crack-branch {
          opacity: .10 !important;
          stroke-width: .9 !important;
          animation: v81SirBranchPulse 4.8s ease-in-out infinite !important;
        }

        .sir-crack-right { animation-delay: .05s !important; }
        .sir-crack-down { animation-delay: .10s !important; }
        .sir-crack-up { animation-delay: .14s !important; }
        .branch-one { animation-delay: .18s !important; }
        .branch-two { animation-delay: .22s !important; }
        .branch-three { animation-delay: .26s !important; }
        .branch-four { animation-delay: .30s !important; }
        .branch-five { animation-delay: .34s !important; }
        .branch-six { animation-delay: .38s !important; }

        .sir-fracture-core {
          opacity: .14 !important;
          animation: v81SirCorePulse 4.8s ease-in-out infinite !important;
        }

        /* A glassy shockwave accompanies the fracture so the SIR event
           is impossible to miss even on a dark card/image. */
        .sir-rainbow-ring {
          z-index: 9 !important;
          animation: v81SirShockwave 4.8s ease-out infinite !important;
        }

        .sir-starburst-1 {
          z-index: 10 !important;
          animation: v81SirBurstA 4.8s ease-in-out infinite !important;
        }

        .sir-starburst-2 {
          z-index: 10 !important;
          animation: v81SirBurstB 4.8s ease-in-out infinite !important;
        }

        @keyframes v81SirCrackPulse {
          0%,45%,100% {
            opacity:.14;
            stroke-dashoffset:1;
            filter:brightness(.85);
          }
          52% {
            opacity:.42;
            stroke-dashoffset:.72;
          }
          60% {
            opacity:1;
            stroke-dashoffset:0;
            filter:brightness(1.7);
          }
          68% {
            opacity:.92;
            stroke-dashoffset:0;
          }
          77% {
            opacity:.38;
            stroke-dashoffset:-.35;
          }
          86% {
            opacity:.14;
            stroke-dashoffset:-1;
          }
        }

        @keyframes v81SirBranchPulse {
          0%,50%,100% { opacity:.08; stroke-dashoffset:1; }
          58% { opacity:.34; stroke-dashoffset:.6; }
          65% { opacity:.88; stroke-dashoffset:0; }
          74% { opacity:.55; stroke-dashoffset:0; }
          84% { opacity:.08; stroke-dashoffset:-1; }
        }

        @keyframes v81SirCorePulse {
          0%,48%,100% { opacity:.10; transform:scale(.5); transform-origin:505px 126px; }
          57% { opacity:1; transform:scale(1.8); }
          64% { opacity:.45; transform:scale(.8); }
          70% { opacity:.95; transform:scale(1.25); }
          82% { opacity:.10; transform:scale(.5); }
        }

        @keyframes v81SirShockwave {
          0%,53%,100% { opacity:0; transform:translate(-50%,-50%) scale(.18); }
          60% { opacity:.95; }
          78% { opacity:.28; }
          88% { opacity:0; transform:translate(-50%,-50%) scale(4.4); }
        }

        @keyframes v81SirBurstA {
          0%,52%,100% { opacity:0; transform:scale(.25) rotate(0deg); }
          60% { opacity:1; transform:scale(1.55) rotate(25deg); }
          68% { opacity:.28; transform:scale(.75) rotate(38deg); }
          74% { opacity:.85; transform:scale(1.12) rotate(48deg); }
          84% { opacity:0; transform:scale(1.8) rotate(62deg); }
        }

        @keyframes v81SirBurstB {
          0%,57%,100% { opacity:0; transform:scale(.25) rotate(45deg); }
          65% { opacity:.92; transform:scale(1.35) rotate(68deg); }
          73% { opacity:.22; }
          79% { opacity:.75; transform:scale(1) rotate(82deg); }
          88% { opacity:0; transform:scale(1.65) rotate(98deg); }
        }

        /* =====================================================
           RARITY FX — Lifetime mini cards + Best Pulls carousel
           Reuses the exact same rarity identities as main hits.
           ===================================================== */

        .stat-box,
        .showcase-hit-card {
          position: relative;
          isolation: isolate;
          overflow: hidden;
        }

        .stat-box > .rarity-fx,
        .showcase-hit-card > .rarity-fx {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }

        .stat-box > :not(.rarity-fx),
        .showcase-hit-card > :not(.rarity-fx) {
          position: relative;
          z-index: 3;
        }

        /* Mini cards use the same animations, just slightly restrained so the
           count remains instantly readable. */
        .stat-box > .rarity-fx {
          opacity: .82;
        }

        .stat-box .mar-electric-field,
        .stat-box .ir-spectral-field,
        .stat-box .sir-fracture-system {
          width: 100%;
          height: 100%;
        }

        .stat-box .gold-molten-system {
          inset: 0;
        }

        /* Gold drips should still reach the bottom even on the shorter cards. */
        .stat-box.hit-gold .gold-drip {
          min-height: 115%;
        }

        /* Keep the Best Pull card at full-strength premium presentation. */
        .showcase-hit-card > .rarity-fx {
          opacity: 1;
        }

        /* Readability layer: subtle dark glass behind mini-card numbers only. */
        .stat-box .stat-label,
        .stat-box .stat-number {
          text-shadow: 0 1px 8px rgba(0,0,0,.72);
        }

        .stat-box .stat-number {
          position: relative;
          z-index: 4;
        }

        /* Best Pulls is intentionally the exact same card component as Calendar/Search. */
        .best-pull-normal-card {
          margin-top: 8px;
          width: 100%;
        }

        .best-pull-normal-card > .hit-card {
          width: 100%;
          margin: 0;
        }

        .best-pull-normal-card > .best-hit-controls {
          position: relative;
          z-index: 10;
          margin-top: 10px;
        }


        /* =====================================================
           HOMEPAGE PALETTE MATCH — COLLECTOR VAULT
           Exact approved homepage colours. Rarity effects untouched.
           ===================================================== */
        html, body {
          background: #F3E8D7 !important;
        }

        body,
        .page {
          background: #F3E8D7 !important;
          color: #10152D !important;
        }

        /* Collector identity/header = same Collectiverse navy */
        .header {
          background:
            radial-gradient(circle at 50% 0%, rgba(72,91,190,.24), transparent 52%),
            linear-gradient(180deg, #11176A 0%, #080D49 100%) !important;
          color: #FFFFFF !important;
          border: 0 !important;
          border-radius: 20px !important;
          padding: 18px 20px !important;
          box-shadow: 0 8px 22px rgba(15,20,55,.13) !important;
        }
        .header h1,
        .header p { color: #FFFFFF !important; }
        .header p { opacity: .78 !important; }

        /* Navigation pills */
        .tab-button {
          background: #FAF7F1 !important;
          border: 1px solid rgba(16,21,45,.14) !important;
          color: #10152D !important;
          box-shadow: 0 5px 14px rgba(31,28,23,.06) !important;
        }
        .tab-button.active {
          background: linear-gradient(135deg, #31559A 0%, #4774BE 100%) !important;
          border-color: rgba(49,85,154,.35) !important;
          color: #FFFFFF !important;
          box-shadow: 0 7px 17px rgba(30,58,112,.18) !important;
        }

        /* Page typography */
        .section-title {
          background: none !important;
          color: #10152D !important;
          -webkit-text-fill-color: #10152D !important;
          text-shadow: none !important;
        }
        .subsection-title,
        .calendar-month,
        .week-range,
        .showcase-topline,
        .showcase-title,
        .showcase-stat-label,
        .milestone-label,
        .milestone-remaining,
        .badge-label {
          color: #10152D !important;
          text-shadow: none !important;
        }

        .section-divider {
          background: linear-gradient(90deg, transparent, rgba(16,21,45,.16), transparent) !important;
        }

        /* Warm ivory surface cards */
        .break-date-card,
        .collector-showcase,
        .milestone-card,
        .collector-badge,
        .empty-state-card,
        .vault-message,
        .showcase-rank-card {
          background: linear-gradient(145deg, #FAF7F1 0%, #F5F0E7 100%) !important;
          border: 1px solid rgba(16,21,45,.14) !important;
          color: #10152D !important;
          box-shadow:
            0 14px 34px rgba(31,28,23,.11),
            0 2px 8px rgba(31,28,23,.055) !important;
        }

        .empty-state-card p,
        .vault-message,
        .showcase-hit-date,
        .showcase-hit-break {
          color: #62636A !important;
        }

        /* Archive controls use the same blue-grey + Collectiverse blue */
        .calendar-nav,
        .best-hit-button {
          background: #E3E8F0 !important;
          border: 1px solid rgba(38,58,104,.18) !important;
          color: #10152D !important;
          box-shadow: none !important;
        }

        .week-day,
        .calendar-day {
          background: #FAF7F1 !important;
          border: 1px solid rgba(16,21,45,.13) !important;
          color: #10152D !important;
          box-shadow: 0 4px 12px rgba(31,28,23,.05) !important;
        }

        .week-day.has-break,
        .calendar-day.has-break {
          background: #E3E8F0 !important;
          border-color: rgba(49,85,154,.30) !important;
          color: #10152D !important;
          box-shadow: inset 0 0 0 1px rgba(49,85,154,.05) !important;
        }

        .week-day.selected,
        .calendar-day.selected {
          background: linear-gradient(135deg, #31559A 0%, #4774BE 100%) !important;
          border-color: rgba(255,255,255,.18) !important;
          color: #FFFFFF !important;
          box-shadow: 0 7px 17px rgba(30,58,112,.18) !important;
        }
        .week-day.selected * { color: #FFFFFF !important; }

        /* Neutral total/stat surface. Tier stat cards retain rarity designs. */
        .stat-box.stat-total {
          background: linear-gradient(180deg, #11176A 0%, #080D49 100%) !important;
          border: 1px solid rgba(255,255,255,.10) !important;
          color: #FFFFFF !important;
          box-shadow: 0 8px 22px rgba(15,20,55,.13) !important;
        }
        .stat-box.stat-total .stat-label,
        .stat-box.stat-total .stat-number { color: #FFFFFF !important; }

        .rank-pill {
          background: rgba(255,255,255,.10) !important;
          border: 1px solid rgba(255,255,255,.28) !important;
          color: #FFFFFF !important;
        }

        /* Progress treatment mirrors homepage CTA blue */
        .milestone-bar {
          background: #E3E8F0 !important;
          border: 1px solid rgba(38,58,104,.12) !important;
        }
        .milestone-fill {
          background: linear-gradient(135deg, #31559A 0%, #4774BE 100%) !important;
          box-shadow: 0 0 14px rgba(49,85,154,.20) !important;
        }

        /* Locked/unlocked badge surfaces stay warm rather than purple glass */
        .collector-badge {
          color: #10152D !important;
        }

        /* Demo notice translated into the same palette */
        .demo-notice {
          background: #E3E8F0 !important;
          border: 1px solid rgba(49,85,154,.24) !important;
          color: #10152D !important;
          box-shadow: 0 8px 20px rgba(31,28,23,.08) !important;
        }

        /* Champagne/gold marks dates where this collector actually hit */
        .week-day.has-break,
        .calendar-day.has-break {
          background: linear-gradient(145deg, #E8D5A8 0%, #D7BC7B 100%) !important;
          border-color: rgba(154,119,49,.38) !important;
          color: #10152D !important;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.28), 0 5px 14px rgba(93,70,28,.10) !important;
        }

        /* Keep the currently selected date clearly selected, but within the palette */
        .week-day.has-break.selected,
        .calendar-day.has-break.selected {
          background: linear-gradient(145deg, #CDB06A 0%, #B99545 100%) !important;
          border-color: rgba(116,84,25,.45) !important;
          color: #10152D !important;
          box-shadow: 0 7px 17px rgba(93,70,28,.18) !important;
        }
        .week-day.has-break.selected * { color: #10152D !important; }

        /* Final surface colours:
           Lifetime Hits stays warm cream; Break Archive calendar is navy. */
        .collector-showcase {
          background: #F3E8D7 !important;
        }

        .break-date-card.week-archive {
          background: linear-gradient(145deg, #10152D 0%, #171F42 100%) !important;
          border-color: rgba(255,255,255,.12) !important;
          box-shadow: 0 14px 34px rgba(16,21,45,.18) !important;
        }

        .break-date-card.week-archive .calendar-month,
        .break-date-card.week-archive .week-range {
          color: #FFFFFF !important;
        }

        .break-date-card.week-archive .calendar-nav {
          background: rgba(255,255,255,.10) !important;
          border-color: rgba(255,255,255,.18) !important;
          color: #FFFFFF !important;
        }

        /* Match homepage Featured Hit typography: all hit-card copy is white */
        .hit-card .hit-break,
        .hit-card h3,
        .showcase-hit-card .hit-break,
        .showcase-hit-card h3,
        .best-pull-normal-card .hit-break,
        .best-pull-normal-card h3 {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          text-shadow: 0 2px 10px rgba(0,0,0,.45) !important;
          opacity: 1 !important;
        }

        /* Lifetime Hits total widget: Collectiverse navy */
        .stat-box.stat-total {
          background: linear-gradient(145deg, #151D63 0%, #0E154D 100%) !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          color: #FFFFFF !important;
          box-shadow: 0 12px 28px rgba(14,21,77,.20) !important;
        }
        .stat-box.stat-total .stat-label,
        .stat-box.stat-total .stat-number,
        .stat-box.stat-total .rank-pill {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }


        /* =====================================================
           LIFETIME STATS — MATCH APPROVED NAVY PALETTE
           Keep all rarity animations/effects intact.
           ===================================================== */

        /* Entire Lifetime Stats widget/container */
        .lifetime-stats,
        .lifetime-stats-card,
        .lifetime-stats-widget,
        .lifetime-stats-panel,
        .lifetime-panel,
        .stats-card,
        .stats-panel {
          background:
            radial-gradient(circle at 82% 0%, rgba(68,88,185,.18), transparent 38%),
            linear-gradient(145deg, #111A59 0%, #080D3D 100%) !important;
          border-color: rgba(255,255,255,.10) !important;
          box-shadow:
            0 14px 32px rgba(24,27,54,.16),
            inset 0 1px 0 rgba(255,255,255,.04) !important;
          color: #FFFFFF !important;
        }

        .lifetime-stats *,
        .lifetime-stats-card *,
        .lifetime-stats-widget *,
        .lifetime-stats-panel *,
        .lifetime-panel *,
        .stats-card *,
        .stats-panel * {
          color: #FFFFFF;
        }

        /* Mini rarity cards:
           use the SAME base background family as the full hit cards.
           Pseudo-elements and animation layers are deliberately untouched. */
        .lifetime-tier.sir,
        .tier-mini.sir,
        .mini-hit-card.sir,
        [data-tier="SIR"].lifetime-tier,
        [data-tier="sir"].lifetime-tier {
          background-color: #111827 !important;
        }

        .lifetime-tier.gold,
        .tier-mini.gold,
        .mini-hit-card.gold,
        [data-tier="Gold"].lifetime-tier,
        [data-tier="gold"].lifetime-tier {
          background-color: #17120A !important;
        }

        .lifetime-tier.mar,
        .tier-mini.mar,
        .mini-hit-card.mar,
        [data-tier="MAR"].lifetime-tier,
        [data-tier="mar"].lifetime-tier {
          background-color: #0C1A29 !important;
        }

        .lifetime-tier.ir,
        .tier-mini.ir,
        .mini-hit-card.ir,
        [data-tier="IR"].lifetime-tier,
        [data-tier="ir"].lifetime-tier {
          background-color: #17121E !important;
        }

        .lifetime-tier.sr,
        .tier-mini.sr,
        .mini-hit-card.sr,
        [data-tier="SR"].lifetime-tier,
        [data-tier="sr"].lifetime-tier {
          background-color: #171523 !important;
        }

        .lifetime-tier.ex,
        .tier-mini.ex,
        .mini-hit-card.ex,
        [data-tier="EX"].lifetime-tier,
        [data-tier="ex"].lifetime-tier {
          background-color: #101827 !important;
        }

        /* White labels/counts on the mini cards */
        .lifetime-tier,
        .lifetime-tier *,
        .tier-mini,
        .tier-mini *,
        .mini-hit-card,
        .mini-hit-card * {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }


        /* Actual Lifetime Stats markup */
        .stats-grid {
          background:
            radial-gradient(circle at 82% 0%, rgba(68,88,185,.18), transparent 38%),
            linear-gradient(145deg, #111A59 0%, #080D3D 100%) !important;
          border: 1px solid rgba(255,255,255,.10) !important;
          border-radius: 18px !important;
          padding: 12px !important;
          box-shadow: 0 14px 32px rgba(24,27,54,.16) !important;
        }

        .stats-grid .stat-label,
        .stats-grid .stat-number {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }

        /* Base surfaces matched to the corresponding full-size rarity cards.
           Existing rarity FX/pseudo-elements remain untouched. */
        .stats-grid .stat-box.hit-sir { background-color: #111827 !important; }
        .stats-grid .stat-box.hit-gold { background-color: #17120A !important; }
        .stats-grid .stat-box.hit-future { background-color: #09182d !important; }
        .stats-grid .stat-box.hit-mar { background-color: #0C1A29 !important; }
        .stats-grid .stat-box.hit-ir { background-color: #17121E !important; }
        .stats-grid .stat-box.hit-sr { background-color: #171523 !important; }
        .stats-grid .stat-box.hit-ex { background-color: #101827 !important; }

        .stats-grid .stat-box.hit-sir,
        .stats-grid .stat-box.hit-gold,
        .stats-grid .stat-box.hit-future,
        .stats-grid .stat-box.hit-mar,
        .stats-grid .stat-box.hit-ir,
        .stats-grid .stat-box.hit-sr,
        .stats-grid .stat-box.hit-ex {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
        }

      

        /* ==========================================================
           CLC FULL HIT CARD — vintage paper + old camera/projector
           Applies to archive cards, Best Pull card, and any HitCard
           using getTierClass('clc'). No JSX/layout changes.
           ========================================================== */
        .hit-card.hit-clc,
        .showcase-hit-card.hit-clc {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% 42%, rgba(247,232,188,.98) 0%, rgba(211,181,119,.98) 48%, rgba(126,88,43,.99) 100%) !important;
          border: 1px solid rgba(119,82,39,.92) !important;
          box-shadow:
            inset 0 0 58px rgba(61,35,10,.38),
            0 16px 38px rgba(61,40,18,.28) !important;
          animation: clcFullProjectorFlicker 5.1s steps(1,end) infinite;
        }

        .hit-card.hit-clc::before,
        .showcase-hit-card.hit-clc::before {
          content: '' !important;
          position: absolute !important;
          inset: -12% !important;
          z-index: 0 !important;
          opacity: .30 !important;
          background:
            radial-gradient(circle at 12% 18%, rgba(66,38,12,.32) 0 1px, transparent 1.7px),
            radial-gradient(circle at 74% 63%, rgba(66,38,12,.24) 0 1px, transparent 1.8px),
            repeating-radial-gradient(circle at 35% 42%, rgba(48,27,8,.22) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(7deg, rgba(72,42,15,.055) 0 1px, transparent 1px 6px) !important;
          background-size: 43px 37px, 61px 53px, 8px 8px, auto !important;
          animation: clcFullGrain .18s steps(2,end) infinite !important;
          pointer-events: none;
        }

        .hit-card.hit-clc::after,
        .showcase-hit-card.hit-clc::after {
          content: '' !important;
          position: absolute !important;
          inset: 0 !important;
          left: 0 !important;
          top: 0 !important;
          width: auto !important;
          height: auto !important;
          transform: none !important;
          z-index: 1 !important;
          opacity: 1 !important;
          background:
            linear-gradient(90deg,
              transparent 0 18%,
              rgba(255,248,215,.13) 18.15% 18.3%,
              transparent 18.45% 72%,
              rgba(61,34,10,.13) 72.1% 72.25%,
              transparent 72.4% 100%),
            radial-gradient(ellipse at center, transparent 39%, rgba(61,35,11,.12) 67%, rgba(39,21,7,.52) 100%) !important;
          animation: clcFullExposure 3.9s ease-in-out infinite !important;
          pointer-events: none;
        }

        .hit-card.hit-clc .hit-layout,
        .hit-card.hit-clc .hit-content,
        .showcase-hit-card.hit-clc .hit-layout,
        .showcase-hit-card.hit-clc .hit-content {
          position: relative;
          z-index: 4;
        }

        .hit-card.hit-clc .hit-break,
        .hit-card.hit-clc h3,
        .showcase-hit-card.hit-clc .hit-break,
        .showcase-hit-card.hit-clc h3 {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          text-shadow:
            0 2px 2px rgba(48,27,8,.72),
            0 4px 14px rgba(48,27,8,.42) !important;
        }

        .hit-card.hit-clc .break-number,
        .showcase-hit-card.hit-clc .break-number {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          background: rgba(67,40,15,.36) !important;
          border-color: rgba(255,245,208,.52) !important;
          text-shadow: 0 2px 6px rgba(43,24,7,.72) !important;
        }

        .hit-card.hit-clc .badge-clc,
        .showcase-hit-card.hit-clc .badge-clc {
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          background: rgba(67,40,15,.54) !important;
          border: 1px solid rgba(255,231,166,.82) !important;
          box-shadow:
            inset 0 0 12px rgba(255,224,145,.12),
            0 0 15px rgba(72,43,15,.20) !important;
          text-shadow: 0 2px 6px rgba(43,24,7,.72) !important;
        }

        @keyframes clcFullProjectorFlicker {
          0%,14%,16%,37%,39%,66%,68%,90%,92%,100% { filter: sepia(.24) contrast(1.04) brightness(1); }
          15% { filter: sepia(.42) contrast(1.10) brightness(.91); }
          38% { filter: sepia(.30) contrast(1.07) brightness(1.06); }
          67% { filter: sepia(.46) contrast(1.11) brightness(.90); }
          91% { filter: sepia(.34) contrast(1.07) brightness(1.04); }
        }
        @keyframes clcFullGrain {
          0% { transform: translate(0,0); }
          25% { transform: translate(-2px,1px); }
          50% { transform: translate(1px,-2px); }
          75% { transform: translate(2px,2px); }
          100% { transform: translate(-1px,1px); }
        }
        @keyframes clcFullExposure {
          0%,100% { opacity:.88; }
          45% { opacity:1; }
          47% { opacity:.80; }
          50% { opacity:.96; }
        }

        /* CLC Lifetime Stats — same vintage paper / old-film identity */
        .stats-grid .stat-box.hit-clc {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% 42%, #f1e4bd 0%, #d6bd82 48%, #9d7540 100%) !important;
          border: 1px solid rgba(111,77,34,.82) !important;
          box-shadow:
            inset 0 0 38px rgba(68,40,13,.30),
            0 8px 22px rgba(68,45,22,.22) !important;
          animation: clcProjectorFlicker 4.8s steps(1,end) infinite;
        }

        .stats-grid .stat-box.hit-clc .stat-label,
        .stats-grid .stat-box.hit-clc .stat-number {
          position: relative;
          z-index: 5;
          color: #FFFFFF !important;
          -webkit-text-fill-color: #FFFFFF !important;
          text-shadow: 0 2px 8px rgba(45,25,7,.72) !important;
        }

        .stats-grid .stat-box.hit-clc .clc-vintage-film {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .stats-grid .stat-box.hit-clc .clc-paper-texture {
          position: absolute;
          inset: 0;
          opacity: .42;
          background:
            radial-gradient(circle at 12% 18%, rgba(75,45,18,.20) 0 1px, transparent 1.8px),
            radial-gradient(circle at 77% 63%, rgba(75,45,18,.15) 0 1px, transparent 1.7px),
            repeating-linear-gradient(8deg, rgba(75,45,18,.035) 0 1px, transparent 1px 5px);
          background-size: 37px 31px, 53px 47px, auto;
        }

        .stats-grid .stat-box.hit-clc .clc-film-grain {
          position: absolute;
          inset: -12%;
          opacity: .22;
          background: repeating-radial-gradient(circle at 30% 40%, rgba(45,27,11,.35) 0 1px, transparent 1px 4px);
          background-size: 7px 7px;
          animation: clcGrain .16s steps(2,end) infinite;
        }

        .stats-grid .stat-box.hit-clc .clc-film-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 42%, rgba(54,31,10,.16) 68%, rgba(43,24,8,.50) 100%);
          animation: clcExposure 3.7s ease-in-out infinite;
        }

        .stats-grid .stat-box.hit-clc .clc-film-line {
          position: absolute;
          top: -10%;
          height: 120%;
          width: 1px;
          background: rgba(255,249,218,.72);
          opacity: .16;
        }

        .stats-grid .stat-box.hit-clc .clc-film-line-a { left: 22%; animation: clcScratchA 5.2s steps(1,end) infinite; }
        .stats-grid .stat-box.hit-clc .clc-film-line-b { left: 79%; animation: clcScratchB 6.7s steps(1,end) infinite; }

        @keyframes clcProjectorFlicker {
          0%,15%,17%,38%,40%,67%,69%,91%,93%,100% { filter: sepia(.26) contrast(1.03) brightness(1); }
          16% { filter: sepia(.42) contrast(1.08) brightness(.91); }
          39% { filter: sepia(.32) contrast(1.06) brightness(1.06); }
          68% { filter: sepia(.46) contrast(1.10) brightness(.90); }
          92% { filter: sepia(.36) contrast(1.07) brightness(1.04); }
        }
        @keyframes clcGrain {
          0% { transform: translate(0,0); }
          25% { transform: translate(-2px,1px); }
          50% { transform: translate(1px,-2px); }
          75% { transform: translate(2px,2px); }
          100% { transform: translate(-1px,1px); }
        }
        @keyframes clcExposure { 0%,100% { opacity:.76; } 50% { opacity:1; } }
        @keyframes clcScratchA {
          0%,26%,28%,65%,67%,100% { transform:translateX(0); opacity:.10; }
          27% { transform:translateX(17px); opacity:.42; }
          66% { transform:translateX(-11px); opacity:.30; }
        }
        @keyframes clcScratchB {
          0%,34%,36%,72%,74%,100% { transform:translateX(0); opacity:.08; }
          35% { transform:translateX(-14px); opacity:.35; }
          73% { transform:translateX(9px); opacity:.26; }
        }

      
        /* CLC visible old-film animation override */
        .hit-card.hit-clc,
        .showcase-hit-card.hit-clc {
          animation: clcCameraBodyFlicker 3.2s steps(1,end) infinite !important;
        }

        .hit-card.hit-clc::before,
        .showcase-hit-card.hit-clc::before {
          display: block !important;
          animation: clcMovingGrain .13s steps(2,end) infinite !important;
          will-change: transform, opacity;
        }

        .hit-card.hit-clc::after,
        .showcase-hit-card.hit-clc::after {
          display: block !important;
          animation: clcFilmGate 2.9s steps(1,end) infinite !important;
          will-change: transform, opacity;
        }

        @keyframes clcCameraBodyFlicker {
          0%, 11%, 13%, 31%, 33%, 54%, 56%, 77%, 79%, 100% {
            filter: sepia(.22) brightness(1) contrast(1.03);
          }
          12% {
            filter: sepia(.42) brightness(.84) contrast(1.14);
          }
          32% {
            filter: sepia(.30) brightness(1.13) contrast(1.08);
          }
          55% {
            filter: sepia(.46) brightness(.88) contrast(1.13);
          }
          78% {
            filter: sepia(.34) brightness(1.09) contrast(1.07);
          }
        }

        @keyframes clcMovingGrain {
          0%   { transform: translate3d(-1.5%, -1%, 0) scale(1.04); opacity: .24; }
          20%  { transform: translate3d(1%, 1.5%, 0) scale(1.05); opacity: .36; }
          40%  { transform: translate3d(-.5%, 2%, 0) scale(1.04); opacity: .27; }
          60%  { transform: translate3d(1.8%, -.8%, 0) scale(1.05); opacity: .39; }
          80%  { transform: translate3d(-1%, 1%, 0) scale(1.04); opacity: .29; }
          100% { transform: translate3d(1.2%, -1.5%, 0) scale(1.05); opacity: .35; }
        }

        @keyframes clcFilmGate {
          0%, 19%, 21%, 48%, 50%, 73%, 75%, 100% {
            transform: translateX(0) !important;
            opacity: .92;
          }
          20% {
            transform: translateX(3px) !important;
            opacity: .58;
          }
          49% {
            transform: translateX(-2px) !important;
            opacity: 1;
          }
          74% {
            transform: translateX(1px) !important;
            opacity: .66;
          }
        }

        @media (prefers-reduced-motion: no-preference) {
          .hit-card.hit-clc .hit-layout,
          .showcase-hit-card.hit-clc .hit-layout {
            animation: clcFrameJitter 4.6s steps(1,end) infinite;
          }
        }

        @keyframes clcFrameJitter {
          0%, 23%, 25%, 61%, 63%, 100% { transform: translate(0,0); }
          24% { transform: translate(0,-1px); }
          62% { transform: translate(1px,0); }
        }


        /* FUTURE: holographic tech interface — scoped to Future hit cards only. */
        .hit-card.hit-future, .showcase-hit-card.hit-future {
          border: 1px solid rgba(74,238,255,.86);
          background: radial-gradient(ellipse at 80% 15%,rgba(96,42,184,.33),transparent 55%),
            radial-gradient(ellipse at 5% 85%,rgba(0,214,255,.16),transparent 55%),
            linear-gradient(125deg,#07182c 0%,#0b1130 53%,#180e3b 100%);
          box-shadow: 0 0 0 1px rgba(57,216,255,.12),0 0 30px rgba(0,225,255,.22),
            0 16px 45px rgba(3,6,30,.42),inset 0 0 32px rgba(48,130,230,.12);
          animation: futureCardBreath 5s ease-in-out infinite;
        }
        .hit-card.hit-future::before, .showcase-hit-card.hit-future::before {
          inset: 0; opacity: 1;
          background: linear-gradient(135deg,rgba(76,231,255,.14),transparent 36%,rgba(170,80,255,.10));
          animation: none;
        }
        .hit-card.hit-future::after, .showcase-hit-card.hit-future::after {
          background: linear-gradient(90deg,transparent,rgba(93,246,255,.26),rgba(226,248,255,.4),transparent);
          animation: futureGlint 6s ease-in-out infinite;
        }
        .hit-future .rarity-fx { position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
        .hit-future .rarity-fx > .fx-ambient,
        .hit-future .rarity-fx > .fx-primary,
        .hit-future .rarity-fx > .fx-secondary,
        .hit-future .rarity-fx > .fx-detail,
        .hit-future .rarity-fx > .fx-extra,
        .hit-future .rarity-fx > .fx-flare { display:none; }
        .hit-future .future-interface { position:absolute; inset:0; overflow:hidden; }
        .hit-future .future-grid { position:absolute; inset:0; opacity:.25;
          background-image:linear-gradient(rgba(61,220,255,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(61,220,255,.22) 1px,transparent 1px);
          background-size:29px 29px; transform:perspective(300px) rotateX(8deg) scale(1.15);
          mask-image:linear-gradient(110deg,transparent 8%,black 65%);
        }
        .hit-future .future-scan { position:absolute; left:0; right:0; top:-20%; height:24%;
          background:linear-gradient(180deg,transparent,rgba(46,226,255,.08),rgba(119,238,255,.25),transparent);
          animation:futureScan 5.2s linear infinite;
        }
        .hit-future .future-corner { position:absolute; width:29px; height:29px;
          border-color:#59f1ff; border-style:solid; filter:drop-shadow(0 0 7px rgba(65,238,255,.75));
          animation:futureCornerPulse 3.5s ease-in-out infinite;
        }
        .hit-future .future-corner-tl { top:10px;left:10px;border-width:2px 0 0 2px; }
        .hit-future .future-corner-tr { top:10px;right:10px;border-width:2px 2px 0 0; }
        .hit-future .future-corner-bl { bottom:10px;left:10px;border-width:0 0 2px 2px; }
        .hit-future .future-corner-br { bottom:10px;right:10px;border-width:0 2px 2px 0; }
        .hit-future .future-circuit { position:absolute; width:130px;height:70px; opacity:.6;
          border:1px solid rgba(96,236,255,.65); transform:skewX(-25deg);
          box-shadow:0 0 12px rgba(61,221,255,.25); }
        .hit-future .future-circuit-a { top:-48px;right:17%; }
        .hit-future .future-circuit-b { bottom:-50px;left:19%;border-color:rgba(174,116,255,.7); }
        .hit-future .future-pulse { position:absolute; width:210px;height:210px;right:-90px;top:-95px;
          border:1px solid rgba(74,230,255,.25);border-radius:50%;
          box-shadow:0 0 0 24px rgba(74,230,255,.035),0 0 0 49px rgba(139,92,246,.04);
          animation:futureRadar 5s ease-in-out infinite;
        }
        .hit-future .hit-layout,.hit-future .hit-content { position:relative;z-index:2; }
        .hit-future .hit-break { color:#9af4ff;text-shadow:0 0 12px rgba(55,224,255,.45); }
        .hit-future h3 { text-shadow:0 0 16px rgba(53,231,255,.45),0 4px 14px rgba(0,0,0,.6); }
        .hit-future .break-number { border-color:rgba(94,239,255,.8);background:rgba(5,35,62,.75);
          box-shadow:0 0 14px rgba(59,225,255,.23); }
        .hit-future .hit-card-art { filter:drop-shadow(0 0 14px rgba(45,231,255,.4)) drop-shadow(0 10px 18px rgba(0,0,0,.5)); }
        .hit-future .hit-badge,.hit-future .badge-future {
          background:linear-gradient(110deg,#70f5ff,#80caff 48%,#bd8dff);color:#071229;
          border:1px solid rgba(217,253,255,.85);box-shadow:0 0 17px rgba(48,226,255,.4),inset 0 1px 0 #fff;
        }
        /* Brighter holographic interface, while keeping the artwork and text readable. */
        .hit-future .future-orbit { position:absolute; width:270px;height:270px;right:-92px;top:-112px;
          border:1px dashed rgba(99,241,255,.35);border-radius:50%;
          box-shadow:0 0 20px rgba(63,221,255,.09);animation:futureOrbit 20s linear infinite; }
        .hit-future .future-orbit-two { width:195px;height:195px;right:-53px;top:-74px;
          border-color:rgba(193,116,255,.48);animation-duration:14s;animation-direction:reverse; }
        .hit-future .future-data { position:absolute;left:17%;right:16%;height:2px;
          background:repeating-linear-gradient(90deg,rgba(70,238,255,.8) 0 19px,transparent 19px 27px,rgba(183,111,255,.8) 27px 33px,transparent 33px 53px);
          opacity:.5;filter:drop-shadow(0 0 5px #45eaff);animation:futureData 4s ease-in-out infinite; }
        .hit-future .future-data-top { top:9px; }
        .hit-future .future-data-bottom { bottom:9px;animation-delay:-2s; }
        .hit-future .future-node { position:absolute;width:6px;height:6px;border-radius:50%;background:#8af9ff;
          box-shadow:0 0 8px 3px rgba(54,230,255,.65);animation:futureNode 3s ease-in-out infinite; }
        .hit-future .future-node-a { right:23%;top:21px; }
        .hit-future .future-node-b { left:22%;bottom:21px;animation-delay:-1.5s;background:#c68bff;
          box-shadow:0 0 8px 3px rgba(173,98,255,.6); }
        .hit-card.hit-future .hit-badge.badge-future,
        .showcase-hit-card.hit-future .hit-badge.badge-future,
        .hit-future .hit-badge,
        .hit-future .badge-future {
          background:linear-gradient(115deg,#22e8ff 0%,#72f7ff 23%,#a68aff 58%,#e09aff 82%,#44ecff 100%) !important;
          background-size:220% 100% !important;
          color:#09112c !important;
          border:1px solid #bdfbff !important;
          opacity:1 !important;
          -webkit-text-fill-color:#09112c !important;
          text-shadow:none !important;
          font-weight:950 !important;
          letter-spacing:2px;
          box-shadow:0 0 0 1px rgba(15,245,255,.32),0 0 18px rgba(47,237,255,.65),0 0 32px rgba(163,92,255,.32),inset 0 1px 0 rgba(255,255,255,.85) !important;
          animation:futureBadgeShift 4s ease-in-out infinite;
        }
        @keyframes futureOrbit { to {transform:rotate(360deg)} }
        @keyframes futureData { 0%,100%{opacity:.22} 50%{opacity:.72} }
        @keyframes futureNode { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1.25)} }
        @keyframes futureBadgeShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes futureScan { from{transform:translateY(-60%)} to{transform:translateY(680%)} }
        @keyframes futureGlint { 0%,58%{left:-85%;opacity:0} 66%{opacity:.5} 82%,100%{left:145%;opacity:0} }
        @keyframes futureCardBreath { 0%,100%{box-shadow:0 0 0 1px rgba(57,216,255,.12),0 0 22px rgba(0,225,255,.18),0 16px 45px rgba(3,6,30,.42)} 50%{box-shadow:0 0 0 1px rgba(57,216,255,.3),0 0 38px rgba(0,225,255,.34),0 16px 45px rgba(3,6,30,.42)} }
        @keyframes futureCornerPulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes futureRadar { 0%,100%{opacity:.4;transform:scale(.93)} 50%{opacity:.9;transform:scale(1.08)} }
        @media (prefers-reduced-motion:reduce) {
          .hit-card.hit-future,.showcase-hit-card.hit-future,.hit-future .future-scan,
          .hit-future .future-corner,.hit-future .future-pulse,
          .hit-future .future-orbit,.hit-future .future-data,.hit-future .future-node,
          .hit-future .badge-future { animation:none!important; }
        }

        /* SIR — premium full-art prismatic foil; replaces the old fracture motif. */
        .hit-sir .sir-prismatic-system { position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1; }
        .hit-card.hit-sir,.showcase-hit-card.hit-sir { background:radial-gradient(ellipse at 25% 0%,rgba(255,111,189,.24),transparent 48%),radial-gradient(ellipse at 86% 100%,rgba(67,216,255,.25),transparent 54%),linear-gradient(120deg,#211038 0%,#16264c 42%,#331544 78%,#101b38 100%)!important;border:1px solid rgba(244,203,255,.8)!important;box-shadow:0 0 0 1px rgba(127,219,255,.3),0 0 30px rgba(215,126,255,.25),0 18px 50px rgba(0,0,0,.45)!important; }
        .hit-sir .sir-prism-aura {position:absolute;inset:-60%;background:conic-gradient(from 25deg,transparent 0deg,rgba(250,168,235,.16) 48deg,transparent 85deg,rgba(100,229,255,.22) 135deg,transparent 185deg,rgba(253,220,129,.16) 245deg,transparent 290deg,rgba(191,150,255,.2) 340deg,transparent 360deg);animation:sirFoilTurn 15s linear infinite;}
        .hit-sir .sir-prism-ribbon {position:absolute;inset:-50%;width:65%;transform:rotate(27deg);filter:blur(17px);background:linear-gradient(90deg,transparent,rgba(255,255,255,.13),rgba(128,238,255,.2),rgba(244,152,250,.19),transparent);animation:sirFoilSweep 7s ease-in-out infinite;}
        .hit-sir .sir-prism-ribbon-two {animation-delay:-3.5s;transform:rotate(-28deg);opacity:.65;}
        .hit-sir .sir-prism-shimmer {position:absolute;inset:0;background:repeating-linear-gradient(122deg,transparent 0px,transparent 23px,rgba(255,255,255,.045) 24px,transparent 26px);opacity:.7;mask-image:linear-gradient(90deg,#000,transparent 65%);}
        .hit-sir .sir-prism-stars {position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
        .hit-sir .sir-prism-star {transform-box:fill-box;transform-origin:center;animation:sirStarTwinkle 3.6s ease-in-out infinite;}
        .hit-sir .sir-prism-star-1,.hit-sir .sir-prism-star-4 {animation-delay:-1.2s;}.hit-sir .sir-prism-star-2,.hit-sir .sir-prism-star-5 {animation-delay:-2.4s;}
        .hit-sir .badge-sir {background:linear-gradient(110deg,#fce7f3,#c4b5fd,#9ceaff,#fff1bd,#fbcfe8)!important;background-size:250% 250%!important;color:#191032!important;border:1px solid rgba(255,255,255,.8)!important;box-shadow:0 0 19px rgba(223,161,255,.55)!important;animation:sirBadgeFoil 6s ease-in-out infinite;}
        .hit-sir .hit-content,.hit-sir .hit-layout {position:relative;z-index:3;}
        /* MAR — external electric discharges crawl around the frame and fork inward. */
        .hit-mar .mar-storm-system {position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden;border-radius:inherit;}
        .hit-mar .mar-storm-glow {position:absolute;inset:0;background:radial-gradient(ellipse at 4% 25%,rgba(0,174,255,.17),transparent 32%),radial-gradient(ellipse at 95% 76%,rgba(0,143,255,.18),transparent 35%);animation:marStormBreath 5.4s ease-in-out infinite;}
        .hit-mar .mar-storm-lightning {position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
        .hit-mar .mar-discharge {fill:none;stroke-linejoin:round;stroke-linecap:round;opacity:0;animation:marElectricStrike 7.1s steps(1,end) infinite;}
        .hit-mar .mar-discharge-1 {animation-delay:-.3s;}.hit-mar .mar-discharge-2 {animation-delay:-3.7s;}
        .hit-mar .mar-discharge-3 {animation-delay:-5.1s;}.hit-mar .mar-discharge-4 {animation-delay:-2.1s;}
        .hit-mar .mar-discharge-5 {animation-delay:-6.2s;}.hit-mar .mar-discharge-6 {animation-delay:-4.5s;}
        .hit-mar .mar-arc-halo {stroke:#008dff;stroke-width:13;opacity:.9;}
        .hit-mar .mar-arc-blue {stroke:#00bfff;stroke-width:5.3;filter:drop-shadow(0 0 5px #009dff);}
        .hit-mar .mar-arc-core {stroke:#efffff;stroke-width:1.55;filter:drop-shadow(0 0 2px #fff);}
        .hit-mar .hit-content,.hit-mar .hit-layout {position:relative;z-index:3;}
        @keyframes marElectricStrike {0%,7%,10%,12%,14%,47%,50%,52%,100%{opacity:0}8%,9%,13%,48%,49%,51%{opacity:1}11%{opacity:.42}}
        @keyframes sirFoilTurn {to{transform:rotate(360deg)}}
        @keyframes sirFoilSweep {0%,100%{translate:-55% 0;opacity:.22}50%{translate:135% 0;opacity:.9}}
        @keyframes sirStarTwinkle {0%,100%{opacity:.18;scale:.65}48%{opacity:1;scale:1.12}60%{opacity:.65;scale:1}}
        @keyframes sirBadgeFoil {0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes marStormBreath {0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes marBoltFlicker {0%,8%,13%,25%,29%,65%,69%,100%{opacity:.05}9%,12%,26%,28%,66%,68%{opacity:1}10%,27%,67%{opacity:.45}}
        @media (prefers-reduced-motion:reduce){.hit-sir .sir-prism-aura,.hit-sir .sir-prism-ribbon,.hit-sir .sir-prism-star,.hit-sir .badge-sir,.hit-mar .mar-discharge,.hit-mar .mar-storm-glow{animation:none!important;opacity:.65!important}}

        /* Uniform minimum card height even when a hit has no break-number label. */
        .hit-grid > .hit-card { min-height: 194px; }
        .hit-grid > .hit-card .hit-layout { min-height: 156px; }
        .stats-grid .stat-box.hit-future {
          position: relative; isolation: isolate; overflow: hidden;
          border: 1px solid rgba(65,228,255,.55) !important;
          background: linear-gradient(125deg,#07182c,#101338 70%,#1a0d39) !important;
          box-shadow: inset 0 0 22px rgba(47,208,255,.12),0 0 15px rgba(0,208,255,.12);
        }
        .stats-grid .stat-box.hit-future .rarity-fx {pointer-events:none}
        .stats-grid .stat-box.hit-future .stat-label,
        .stats-grid .stat-box.hit-future .stat-number {position:relative;z-index:2}
                /* MAR CONSTRICTOR: permanent lightning mesh across the entire card.
           Individual coils surge independently; none ever disappear. */
        .hit-mar .mar-storm-system {
          position: absolute; inset: 0; z-index: 4;
          pointer-events: none; overflow: hidden; border-radius: inherit;
        }
        .hit-mar .mar-storm-lightning {
          position: absolute; inset: 0; width: 100%; height: 100%;
        }
        .hit-mar .mar-storm-glow {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 20% 40%,rgba(0,175,255,.19),transparent 60%),
                      radial-gradient(ellipse at 80% 60%,rgba(0,175,255,.19),transparent 60%);
          animation: marCoilAura 5s ease-in-out infinite alternate;
        }
        .hit-mar .mar-coil { opacity: .82; animation: marCoilPulse 5.1s ease-in-out infinite; }
        .hit-mar .mar-coil:nth-of-type(2) {animation-duration:3.7s;animation-delay:-1.4s}
        .hit-mar .mar-coil:nth-of-type(3) {animation-duration:4.3s;animation-delay:-2.2s}
        .hit-mar .mar-coil:nth-of-type(4) {animation-duration:2.9s;animation-delay:-.8s}
        .hit-mar .mar-coil:nth-of-type(5) {animation-duration:4.9s;animation-delay:-3.1s}
        .hit-mar .mar-coil:nth-of-type(6) {animation-duration:3.3s;animation-delay:-1.9s}
        .hit-mar .mar-coil:nth-of-type(7) {animation-duration:4.6s;animation-delay:-2.7s}
        .hit-mar .mar-coil:nth-of-type(8) {animation-duration:3.9s;animation-delay:-.5s}
        .hit-mar .mar-coil path { fill:none; stroke-linejoin:round; stroke-linecap:round; }
        .hit-mar .mar-coil-bloom path {stroke:#00bfff;stroke-width:10;opacity:.9}
        .hit-mar .mar-coil-electric path {stroke:#00caff;stroke-width:3.1;filter:drop-shadow(0 0 4px #00bfff)}
        .hit-mar .mar-coil-white path {stroke:#ecfeff;stroke-width:1.15}
        .hit-mar .mar-coil-white path:last-child {stroke-width:.8}
        .hit-mar::before {opacity:.16!important;animation:none!important}
        .hit-mar::after {opacity:.12!important;animation:none!important}
        @keyframes marCoilPulse {
          0%,100% {opacity:.76;filter:brightness(.94)}
          17% {opacity:.93;filter:brightness(1.22)}
          19% {opacity:.81;filter:brightness(1)}
          21% {opacity:1;filter:brightness(1.9)}
          23% {opacity:.8;filter:brightness(1)}
          58% {opacity:.88;filter:brightness(1.1)}
          61% {opacity:1;filter:brightness(1.65)}
          64% {opacity:.77;filter:brightness(.96)}
        }
        @keyframes marCoilAura {
          from {opacity:.6} to {opacity:1}
        }
        @media (prefers-reduced-motion:reduce) {
          .hit-mar .mar-coil,.hit-mar .mar-storm-glow {animation:none!important;opacity:.86!important}
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
        </div>
		

        {message && message !== 'Loading vault...' && <MessageCard />}

        {message === 'Loading vault...' && <p>Loading vault...</p>}

        {tab === 'latest' && isReady && (
          <section>
            <h2 className="section-title">🌌 Break Archive</h2>

            <div className="break-date-card week-archive">
              <div className="calendar-header week-header">
                <button className="calendar-nav" onClick={() => changeWeek(-1)} aria-label="Previous week">
                  ‹
                </button>

                <div>
                  <div className="calendar-month">Break Archive</div>
                  <div className="week-range">{weekLabel}</div>
                </div>

                <button className="calendar-nav" onClick={() => changeWeek(1)} aria-label="Next week">
                  ›
                </button>
              </div>

              <div className="week-strip">
                {weekItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setSelectedDate(item.date)}
                    className={`week-day ${item.hasBreak ? 'has-break' : ''} ${
                      item.isSelected ? 'selected' : ''
                    }`}
                  >
                    <span className="week-day-name">{item.dayName}</span>
                    <span className="week-day-number">{item.dayNumber}</span>
                    <span className="week-day-month">{item.monthName}</span>
                  </button>
                ))}
              </div>
            </div>

            <h3 className="subsection-title">Your Hits From This Date</h3>

            <HitList items={selectedDateHits} enteredBreak={selectedDateEntered} />
          </section>
        )}

        {tab === 'lifetime' && isReady && (
          <section>
            <h2 className="section-title">🏆 Lifetime Stats</h2>

            <div className="collector-showcase">
              <div className="showcase-header">
                <div>
                  <div className="showcase-topline">Collector Rank</div>
                  <div className="showcase-title">
                    {ranks.overall ? `#${ranks.overall}` : 'Unranked'}
                  </div>
                </div>
              </div>

              <div className="showcase-best-pull">
                <div className="showcase-stat-label">Best Pulls</div>

                {currentBestHit ? (
                  <div className="best-pull-normal-card">
                    <HitCard hit={currentBestHit} />

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
                  <div className="showcase-hit-card hit-default">
                    <div className="hit-content">
                      <h3>No featured rarity pulls yet</h3>
                      <div className="showcase-hit-date">
                        Your best pulls will appear here automatically.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-box stat-total">
                <div className="stat-label">🏆 Total Hits</div>
                <div className="stat-number">{counts.overall}</div>
                <RankPill rank={ranks.overall} />
              </div>

              <div className="stat-box hit-sir">
                <RarityEffects tier="sir" />
                <div className="stat-label">SIR</div>
                <div className="stat-number">{counts.sir}</div>
              </div>

              <div className="stat-box hit-gold">
                <RarityEffects tier="gold" />
                <div className="stat-label">Gold</div>
                <div className="stat-number">{counts.gold}</div>
              </div>

              <div className="stat-box hit-future">
                <RarityEffects tier="future" />
                <div className="stat-label">Future</div>
                <div className="stat-number">{counts.future}</div>
              </div>

              <div className="stat-box hit-mar">
                <RarityEffects tier="mar" />
                <div className="stat-label">MAR</div>
                <div className="stat-number">{counts.mar}</div>
              </div>

              <div className="stat-box hit-clc lifetime-clc-stat">
                <div className="clc-vintage-film" aria-hidden="true">
                  <span className="clc-paper-texture" />
                  <span className="clc-film-grain" />
                  <span className="clc-film-vignette" />
                  <span className="clc-film-line clc-film-line-a" />
                  <span className="clc-film-line clc-film-line-b" />
                </div>
                <div className="stat-label">CLC</div>
                <div className="stat-number">{counts.clc}</div>
              </div>

              <div className="stat-box hit-ir">
                <RarityEffects tier="ir" />
                <div className="stat-label">IR</div>
                <div className="stat-number">{counts.ir}</div>
              </div>

              <div className="stat-box hit-sr">
                <RarityEffects tier="sr" />
                <div className="stat-label">SR</div>
                <div className="stat-number">{counts.sr}</div>
              </div>

              <div className="stat-box hit-ex">
                <RarityEffects tier="ex" />
                <div className="stat-label">EX</div>
                <div className="stat-number">{counts.ex}</div>
              </div>

            </div>
          </section>
        )}


      </div>
    </main>
  )
}