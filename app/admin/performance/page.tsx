'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import OwnerGuard from '../owner-guard'
import { supabase } from '../../../lib/supabase'

type Tab = 'overview' | 'calendar' | 'breaks' | 'singles'

type BreakStream = {
  id: string
  stream_date: string
  stream_slot?: number
  sales: number
  sales_after_fees: number
  packs_used: number
  total_cost: number
  profit: number
}

type BreakProduct = {
  stream_id: string
  packs_used: number
  stream_sets?: { item_type?: string; name?: string } | null
}

type SinglesSale = {
  id: string
  sold_date: string
  platform: string
  description?: string
  quantity: number
  sale_price: number
  net_sale: number
  postage: number
  cost_basis: number
  profit: number
  notes: string | null
}

type PoolLot = { quantity_remaining: number; unit_cost: number }
type InventoryCard = { status: string; allocated_cost: number }
type SealedBatch = {
  id: string
  product_name?: string
  product_type: string
  quantity_remaining: number
  unit_cost: number
}
type PackBatch = {
  packs_remaining: number
  cost_per_pack: number
  stream_sets?: { item_type?: string } | null
}
type CalendarDay = { key: string; inMonth: boolean }

type BreakSummary = {
  gross: number
  net: number
  cost: number
  profit: number
  streams: number
  packs: number
}

type SinglesSummary = {
  gross: number
  net: number
  cost: number
  profit: number
  transactions: number
  cards: number
  sealed: number
  items: number
}

const PAYRUN_ANCHOR = '2026-07-31'
const OWNER_EMAIL = 'collectiversetcg@gmail.com'

function num(value: unknown) {
  return Number(value || 0)
}

function money(value: unknown) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(num(value))
}

function decimal(value: number, places = 1) {
  return Number.isFinite(value) ? value.toFixed(places) : '0.0'
}

function percent(value: number) {
  if (!Number.isFinite(value)) return '0.0%'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(value: string, days: number) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function todayKey() {
  return dateKey(new Date())
}

function shortDate(value: string) {
  return parseDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function fullDate(value: string) {
  return parseDate(value).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

function getCalendarDays(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { key: dateKey(date), inMonth: date.getMonth() === month }
  })
}

function getPayrunForDate(value: string) {
  const anchor = parseDate(PAYRUN_ANCHOR).getTime()
  const target = parseDate(value).getTime()
  const offset = Math.floor(Math.floor((target - anchor) / 86400000) / 14)
  const start = addDays(PAYRUN_ANCHOR, offset * 14)
  return { index: offset + 1, start, end: addDays(start, 13) }
}

function getPayrunByOffset(base: ReturnType<typeof getPayrunForDate>, offset: number) {
  const start = addDays(base.start, offset * 14)
  return { index: base.index + offset, start, end: addDays(start, 13) }
}

function isGiveawayType(value?: string) {
  return String(value || '').toLowerCase().includes('giveaway')
}

function getSinglesBreakdown(sale: SinglesSale, sealedBatches: SealedBatch[]) {
  const fallback = { cards: num(sale.quantity || 1), sealed: 0 }
  const match = sale.notes?.match(/\[\[sale_meta:(.*?)\]\]/s)
  if (!match) return fallback

  try {
    const meta = JSON.parse(match[1]) as {
      collectionQuantity?: number
      trackedCardIds?: string[]
      sealedAllocations?: { sealedId: string; quantity: number }[]
    }

    const sealed = (meta.sealedAllocations || []).reduce((sum, row) => {
      const batch = sealedBatches.find((item) => item.id === row.sealedId)
      return batch && !isGiveawayType(batch.product_type)
        ? sum + num(row.quantity)
        : sum
    }, 0)

    return {
      cards: num(meta.collectionQuantity) + (meta.trackedCardIds || []).length,
      sealed,
    }
  } catch {
    return fallback
  }
}

export default function OwnerPerformancePage() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [breaks, setBreaks] = useState<BreakStream[]>([])
  const [breakProducts, setBreakProducts] = useState<BreakProduct[]>([])
  const [singles, setSingles] = useState<SinglesSale[]>([])
  const [poolLots, setPoolLots] = useState<PoolLot[]>([])
  const [cards, setCards] = useState<InventoryCard[]>([])
  const [sealed, setSealed] = useState<SealedBatch[]>([])
  const [packBatches, setPackBatches] = useState<PackBatch[]>([])

  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [payrunOffset, setPayrunOffset] = useState(0)

  async function loadData() {
    setLoading(true)
    setMessage('')

    const [breakResult, productResult, singlesResult, poolResult, cardsResult, sealedResult, batchesResult] =
      await Promise.all([
        supabase.from('streams').select('*').order('stream_date', { ascending: false }),
        supabase.from('stream_products').select('stream_id,packs_used,stream_sets(item_type,name)'),
        supabase.from('singles_sales').select('*').order('sold_date', { ascending: false }),
        supabase.from('singles_pool_lots').select('quantity_remaining,unit_cost'),
        supabase.from('singles_inventory_cards').select('status,allocated_cost'),
        supabase.from('singles_sealed_batches').select('*'),
        supabase.from('pack_batches').select('packs_remaining,cost_per_pack,stream_sets(item_type)'),
      ])

    const error =
      breakResult.error ||
      productResult.error ||
      singlesResult.error ||
      poolResult.error ||
      cardsResult.error ||
      sealedResult.error ||
      batchesResult.error

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setBreaks((breakResult.data || []) as BreakStream[])
    setBreakProducts((productResult.data || []) as BreakProduct[])
    setSingles((singlesResult.data || []) as SinglesSale[])
    setPoolLots((poolResult.data || []) as PoolLot[])
    setCards((cardsResult.data || []) as InventoryCard[])
    setSealed((sealedResult.data || []) as SealedBatch[])
    setPackBatches((batchesResult.data || []) as PackBatch[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const packsOnlyByStream = useMemo(() => {
    const map = new Map<string, number>()

    breakProducts.forEach((row) => {
      if ((row.stream_sets?.item_type || 'packs') !== 'packs') return
      map.set(row.stream_id, (map.get(row.stream_id) || 0) + num(row.packs_used))
    })

    return map
  }, [breakProducts])

  const summariseBreaks = (rows: BreakStream[]): BreakSummary => ({
    gross: rows.reduce((sum, row) => sum + num(row.sales), 0),
    net: rows.reduce((sum, row) => sum + num(row.sales_after_fees), 0),
    cost: rows.reduce((sum, row) => sum + num(row.total_cost), 0),
    profit: rows.reduce((sum, row) => sum + num(row.profit), 0),
    streams: rows.length,
    packs: rows.reduce((sum, row) => sum + (packsOnlyByStream.get(row.id) || 0), 0),
  })

  const summariseSingles = (rows: SinglesSale[]): SinglesSummary => {
    let cardsSold = 0
    let sealedSold = 0

    rows.forEach((row) => {
      const breakdown = getSinglesBreakdown(row, sealed)
      cardsSold += breakdown.cards
      sealedSold += breakdown.sealed
    })

    return {
      gross: rows.reduce((sum, row) => sum + num(row.sale_price), 0),
      net: rows.reduce((sum, row) => sum + num(row.net_sale), 0),
      cost: rows.reduce((sum, row) => sum + num(row.cost_basis) + num(row.postage), 0),
      profit: rows.reduce((sum, row) => sum + num(row.profit), 0),
      transactions: rows.length,
      cards: cardsSold,
      sealed: sealedSold,
      items: cardsSold + sealedSold,
    }
  }

  const allBreaks = summariseBreaks(breaks)
  const allSingles = summariseSingles(singles)
  const totalProfit = allBreaks.profit + allSingles.profit

  const payrunBase = useMemo(() => getPayrunForDate(todayKey()), [])
  const selectedPayrun = useMemo(
    () => getPayrunByOffset(payrunBase, payrunOffset),
    [payrunBase, payrunOffset]
  )
  const previousPayrun = useMemo(
    () => getPayrunByOffset(selectedPayrun, -1),
    [selectedPayrun]
  )
  const nextPayrun = useMemo(
    () => getPayrunByOffset(selectedPayrun, 1),
    [selectedPayrun]
  )

  function payrunSummary(period: ReturnType<typeof getPayrunForDate>) {
    const breakSummary = summariseBreaks(
      breaks.filter((row) => row.stream_date >= period.start && row.stream_date <= period.end)
    )
    const singlesSummary = summariseSingles(
      singles.filter((row) => row.sold_date >= period.start && row.sold_date <= period.end)
    )

    return {
      period,
      breaks: breakSummary,
      singles: singlesSummary,
      gross: breakSummary.gross + singlesSummary.gross,
      net: breakSummary.net + singlesSummary.net,
      profit: breakSummary.profit + singlesSummary.profit,
    }
  }

  const previousPayrunSummary = payrunSummary(previousPayrun)
  const currentPayrunSummary = payrunSummary(selectedPayrun)
  const nextPayrunSummary = payrunSummary(nextPayrun)

  const currentPayrunStreamCount =
    currentPayrunSummary.breaks.streams + currentPayrunSummary.singles.transactions



  const collectionValue = poolLots.reduce(
    (sum, row) => sum + num(row.quantity_remaining) * num(row.unit_cost),
    0
  )
  const trackedValue = cards
    .filter((row) => row.status !== 'sold')
    .reduce((sum, row) => sum + num(row.allocated_cost), 0)
  const sealedValue = sealed
    .filter((row) => !isGiveawayType(row.product_type))
    .reduce((sum, row) => sum + num(row.quantity_remaining) * num(row.unit_cost), 0)
  const giveawayValue = sealed
    .filter((row) => isGiveawayType(row.product_type))
    .reduce((sum, row) => sum + num(row.quantity_remaining) * num(row.unit_cost), 0)
  const breakStockValue = packBatches.reduce(
    (sum, row) => sum + num(row.packs_remaining) * num(row.cost_per_pack),
    0
  )
  const inventoryValue =
    collectionValue + trackedValue + sealedValue + giveawayValue + breakStockValue

  const calendarDays = useMemo(
    () => getCalendarDays(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  )

  const dayBreaks = summariseBreaks(breaks.filter((row) => row.stream_date === selectedDate))
  const daySingles = summariseSingles(singles.filter((row) => row.sold_date === selectedDate))

  const combinedDailyRows = useMemo(() => {
    const dates = new Set([
      ...breaks.map((row) => row.stream_date),
      ...singles.map((row) => row.sold_date),
    ])

    return Array.from(dates)
      .map((date) => {
        const breakSummary = summariseBreaks(
          breaks.filter((row) => row.stream_date === date)
        )
        const singlesSummary = summariseSingles(
          singles.filter((row) => row.sold_date === date)
        )

        return {
          date,
          gross: breakSummary.gross + singlesSummary.gross,
          net: breakSummary.net + singlesSummary.net,
          profit: breakSummary.profit + singlesSummary.profit,
          streams: breakSummary.streams,
          packs: breakSummary.packs,
          cards: singlesSummary.cards,
          sealed: singlesSummary.sealed,
        }
      })
      .sort((a, b) => b.profit - a.profit)
  }, [breaks, singles, packsOnlyByStream, sealed])

  const bestBreakStream = useMemo(
    () => [...breaks].sort((a, b) => num(b.profit) - num(a.profit))[0],
    [breaks]
  )
  const bestSinglesSale = useMemo(
    () => [...singles].sort((a, b) => num(b.profit) - num(a.profit))[0],
    [singles]
  )

  const platformRows = useMemo(
    () =>
      ['streaming', 'ebay', 'website'].map((platform) => {
        const rows = singles.filter((row) => row.platform === platform)
        return { platform, ...summariseSingles(rows) }
      }),
    [singles, sealed]
  )

  const payrunProfitChange = previousPayrunSummary.profit
    ? ((currentPayrunSummary.profit - previousPayrunSummary.profit) /
        Math.abs(previousPayrunSummary.profit)) *
      100
    : 0

  function StatCard({
    label,
    value,
    sub,
    positive,
  }: {
    label: string
    value: string
    sub?: string
    positive?: boolean
  }) {
    return (
      <div className="stat-card">
        <div className="stat-label">{label}</div>
        <div className={`stat-value ${positive ? 'positive' : ''}`}>{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    )
  }

  function PayrunCard({
    title,
    data,
    active,
    onClick,
  }: {
    title: string
    data: ReturnType<typeof payrunSummary>
    active?: boolean
    onClick: () => void
  }) {
    return (
      <button className={`payrun-card ${active ? 'active' : ''}`} onClick={onClick}>
        <div className="payrun-card-head">
          <div>
            <div className="payrun-name">{title}</div>
            <div className="payrun-dates">
              {shortDate(data.period.start)} → {shortDate(data.period.end)}
            </div>
          </div>
          {active && <span className="current-badge">Selected</span>}
        </div>
        <div className="payrun-numbers">
          <div><span>Sales</span><strong>{money(data.gross)}</strong></div>
          <div><span>Net Sales</span><strong>{money(data.net)}</strong></div>
          <div><span>Profit</span><strong className="positive">{money(data.profit)}</strong></div>
        </div>
      </button>
    )
  }

  return (
    <OwnerGuard>
      <main className="page">
        <style jsx global>{`
          .page {
            min-height: 100vh;
            background: radial-gradient(circle at top, #17177d 0%, #07073e 46%, #02021e 100%);
            color: white;
            padding: 24px;
          }

          .wrap {
            max-width: 1320px;
            margin: 0 auto;
          }

          .top,
          .section-head,
          .calendar-head,
          .payrun-card-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: center;
          }

          .top {
            margin-bottom: 18px;
          }

          .eyebrow {
            color: #fde68a;
            font-size: .72rem;
            font-weight: 950;
            letter-spacing: 1.4px;
            text-transform: uppercase;
          }

          h1 {
            margin: 5px 0 0;
            font-size: clamp(2rem, 4vw, 3rem);
            font-weight: 950;
            letter-spacing: -1px;
          }

          h2 {
            margin: 0;
            font-size: 1.3rem;
            font-weight: 950;
          }

          h3 {
            margin: 0;
            font-size: 1rem;
            font-weight: 950;
          }

          .sub,
          .muted {
            color: rgba(255,255,255,.66);
            font-weight: 750;
          }

          .actions,
          .tabs {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
          }

          .button,
          .tab {
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.08);
            color: white;
            border-radius: 999px;
            padding: 10px 14px;
            font-weight: 900;
            text-decoration: none;
            cursor: pointer;
          }

          .tab.active {
            background: linear-gradient(135deg, #7c3aed, #c084fc);
            box-shadow: 0 10px 24px rgba(124,58,237,.30);
          }

          .tabs {
            margin-bottom: 18px;
          }

          .panel {
            border: 1px solid rgba(255,255,255,.14);
            background: linear-gradient(135deg, rgba(255,255,255,.075), rgba(255,255,255,.045));
            border-radius: 22px;
            padding: 20px;
            margin-bottom: 16px;
            box-shadow: 0 18px 50px rgba(0,0,0,.24);
          }

          .hero {
            background:
              radial-gradient(circle at top left, rgba(250,204,21,.16), transparent 35%),
              rgba(124,58,237,.14);
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
            gap: 12px;
            margin-top: 15px;
          }

          .stat-card {
            min-width: 0;
            border: 1px solid rgba(255,255,255,.14);
            background:
              radial-gradient(circle at top left, rgba(192,132,252,.11), transparent 42%),
              rgba(255,255,255,.055);
            border-radius: 18px;
            padding: 16px;
          }

          .stat-label {
            color: rgba(255,255,255,.60);
            font-weight: 950;
            text-transform: uppercase;
            font-size: .68rem;
            letter-spacing: .8px;
          }

          .stat-value {
            display: block;
            font-size: 1.45rem;
            line-height: 1.15;
            margin-top: 8px;
            font-weight: 950;
            overflow-wrap: anywhere;
          }

          .stat-value.positive,
          .positive {
            color: #86efac;
          }

          .stat-sub {
            color: rgba(255,255,255,.58);
            margin-top: 5px;
            font-size: .8rem;
            font-weight: 800;
          }

          .payrun-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-top: 16px;
          }

          .payrun-card {
            color: white;
            text-align: left;
            border: 1px solid rgba(255,255,255,.13);
            background: rgba(255,255,255,.05);
            border-radius: 19px;
            padding: 16px;
            cursor: pointer;
          }

          .payrun-card.active {
            border-color: rgba(250,204,21,.48);
            background:
              radial-gradient(circle at top left, rgba(250,204,21,.13), transparent 38%),
              rgba(124,58,237,.16);
            box-shadow: 0 14px 30px rgba(0,0,0,.20);
          }

          .payrun-name {
            font-size: 1rem;
            font-weight: 950;
          }

          .payrun-dates {
            margin-top: 4px;
            color: rgba(255,255,255,.60);
            font-size: .78rem;
            font-weight: 800;
          }

          .current-badge {
            border: 1px solid rgba(250,204,21,.32);
            color: #fde68a;
            background: rgba(250,204,21,.10);
            border-radius: 999px;
            padding: 6px 9px;
            font-size: .66rem;
            font-weight: 950;
            text-transform: uppercase;
          }

          .payrun-numbers {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-top: 15px;
          }

          .payrun-numbers span {
            display: block;
            color: rgba(255,255,255,.56);
            font-size: .68rem;
            font-weight: 950;
            text-transform: uppercase;
          }

          .payrun-numbers strong {
            display: block;
            margin-top: 5px;
            font-size: 1rem;
            font-weight: 950;
          }

          .grid-2 {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }

          .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 8px;
            margin-top: 14px;
          }

          .weekday {
            font-size: .7rem;
            color: rgba(255,255,255,.55);
            font-weight: 900;
            text-align: center;
          }

          .day {
            min-height: 150px;
            text-align: left;
            border: 1px solid rgba(255,255,255,.11);
            background: rgba(255,255,255,.045);
            color: white;
            border-radius: 16px;
            padding: 11px;
            cursor: pointer;
          }

          .day.out {
            opacity: .34;
          }

          .day.selected {
            border-color: #c084fc;
            background: rgba(124,58,237,.17);
          }

          .day strong,
          .day span {
            display: block;
          }

          .day .profit {
            color: #86efac;
            font-size: 1.05rem;
            margin: 7px 0;
          }

          .day span {
            font-size: .72rem;
            color: rgba(255,255,255,.72);
            margin-top: 3px;
          }

          .table {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 14px;
          }

          .table-row {
            display: grid;
            grid-template-columns: 1.25fr repeat(5, minmax(0, 1fr));
            gap: 12px;
            align-items: center;
            padding: 13px;
            border: 1px solid rgba(255,255,255,.10);
            border-radius: 15px;
            background: rgba(255,255,255,.045);
            font-weight: 800;
          }

          .table-row.compact {
            grid-template-columns: 1.2fr repeat(4, minmax(0, 1fr));
          }

          .table-row span {
            color: rgba(255,255,255,.76);
          }

          .rank {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            border-radius: 10px;
            background: rgba(124,58,237,.20);
            border: 1px solid rgba(192,132,252,.25);
            margin-right: 9px;
          }

          .message {
            color: #fde68a;
            font-weight: 900;
            margin-bottom: 14px;
          }

          @media (max-width: 900px) {
            .page { padding: 14px; }
            .top, .section-head, .calendar-head { align-items: flex-start; flex-direction: column; }
            .grid-2, .payrun-grid { grid-template-columns: 1fr; }
            .calendar-grid { grid-template-columns: 1fr; }
            .weekday { display: none; }
            .day { min-height: auto; }
            .table-row, .table-row.compact { grid-template-columns: 1fr; }
            .payrun-numbers { grid-template-columns: 1fr; }
          }
        `}</style>

        <div className="wrap">
          <header className="top">
            <div>
              <div className="eyebrow">Owner only · {OWNER_EMAIL}</div>
              <h1>Business Performance</h1>
              <div className="sub">One private dashboard for Breaks and Singles.</div>
            </div>

            <div className="actions">
              <Link className="button" href="/admin">← Admin</Link>
              <Link className="button" href="/admin/streams">Break Operations</Link>
              <Link className="button" href="/admin/singles-centre">Singles Centre</Link>
              <button className="button" onClick={loadData}>Refresh</button>
            </div>
          </header>

          <nav className="tabs">
            <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Dashboard</button>
            <button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>Combined Calendar</button>
            <button className={`tab ${tab === 'breaks' ? 'active' : ''}`} onClick={() => setTab('breaks')}>Break Performance</button>
            <button className={`tab ${tab === 'singles' ? 'active' : ''}`} onClick={() => setTab('singles')}>Singles Performance</button>
          </nav>

          {message && <div className="message">{message}</div>}

          {loading ? (
            <section className="panel">Loading owner dashboard…</section>
          ) : (
            <>
              {tab === 'overview' && (
                <>
                  <section className="panel hero">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">All-time business overview</div>
                        <h2>Complete Performance</h2>
                      </div>
                      <div className="muted">Break Operations + Singles Centre</div>
                    </div>

                    <div className="stats-grid">
                      <StatCard label="Gross Sales" value={money(allBreaks.gross + allSingles.gross)} sub={`Breaks ${money(allBreaks.gross)} · Singles ${money(allSingles.gross)}`} />
                      <StatCard label="Net Sales" value={money(allBreaks.net + allSingles.net)} sub={`After platform fees`} />
                      <StatCard label="Total Profit" value={money(totalProfit)} positive sub={`Breaks ${money(allBreaks.profit)} · Singles ${money(allSingles.profit)}`} />
                      <StatCard label="Inventory Value" value={money(inventoryValue)} />
                      <StatCard label="Streams" value={String(allBreaks.streams)} sub={`${allBreaks.packs} packs used`} />
                      <StatCard label="Cards Sold" value={String(allSingles.cards)} />
                      <StatCard label="Sealed Sold" value={String(allSingles.sealed)} />
                      <StatCard label="Average Profit / Stream" value={money(allBreaks.streams ? allBreaks.profit / allBreaks.streams : 0)} />
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-head">
                      <div>
                        <div className="eyebrow">Selected payrun</div>
                        <h2>{shortDate(selectedPayrun.start)} → {shortDate(selectedPayrun.end)}</h2>
                      </div>
                      <div className="muted">{percent(payrunProfitChange)} vs previous payrun</div>
                    </div>

                    <div className="stats-grid">
                      <StatCard label="Gross Sales" value={money(currentPayrunSummary.gross)} />
                      <StatCard label="Net Sales" value={money(currentPayrunSummary.net)} />
                      <StatCard label="Profit" value={money(currentPayrunSummary.profit)} positive />
                      <StatCard label="Break Streams" value={String(currentPayrunSummary.breaks.streams)} />
                      <StatCard label="Singles Sales" value={String(currentPayrunSummary.singles.transactions)} />
                      <StatCard label="Packs Used" value={String(currentPayrunSummary.breaks.packs)} />
                      <StatCard label="Cards Sold" value={String(currentPayrunSummary.singles.cards)} />
                      <StatCard label="Sealed Sold" value={String(currentPayrunSummary.singles.sealed)} />
                    </div>

                    <div className="section-head" style={{ marginTop: 18 }}>
                      <div>
                        <div className="eyebrow">Average per stream</div>
                        <h2>Current Payrun Averages</h2>
                      </div>
                      <div className="muted">{currentPayrunStreamCount} recorded stream / sale entries</div>
                    </div>

                    <div className="stats-grid">
                      <StatCard label="Average Gross / Stream" value={money(currentPayrunStreamCount ? currentPayrunSummary.gross / currentPayrunStreamCount : 0)} />
                      <StatCard label="Average Net / Stream" value={money(currentPayrunStreamCount ? currentPayrunSummary.net / currentPayrunStreamCount : 0)} />
                      <StatCard label="Average Profit / Stream" value={money(currentPayrunStreamCount ? currentPayrunSummary.profit / currentPayrunStreamCount : 0)} positive />
                      <StatCard label="Average Packs / Break Stream" value={decimal(currentPayrunSummary.breaks.streams ? currentPayrunSummary.breaks.packs / currentPayrunSummary.breaks.streams : 0)} />
                      <StatCard label="Average Cards / Singles Sale" value={decimal(currentPayrunSummary.singles.transactions ? currentPayrunSummary.singles.cards / currentPayrunSummary.singles.transactions : 0)} />
                      <StatCard label="Average Sealed / Singles Sale" value={decimal(currentPayrunSummary.singles.transactions ? currentPayrunSummary.singles.sealed / currentPayrunSummary.singles.transactions : 0)} />
                    </div>

                    <div className="payrun-grid">
                      <PayrunCard title="Previous" data={previousPayrunSummary} onClick={() => setPayrunOffset((value) => value - 1)} />
                      <PayrunCard title="Current" data={currentPayrunSummary} active onClick={() => {}} />
                      <PayrunCard title="Next" data={nextPayrunSummary} onClick={() => setPayrunOffset((value) => value + 1)} />
                    </div>

                    {payrunOffset !== 0 && (
                      <div className="actions" style={{ marginTop: 12 }}>
                        <button className="button" onClick={() => setPayrunOffset(0)}>Return to Current Payrun</button>
                      </div>
                    )}
                  </section>

                  <div className="grid-2">
                    <section className="panel">
                      <div className="eyebrow">Inventory snapshot</div>
                      <h2>Current Stock Value</h2>
                      <div className="stats-grid">
                        <StatCard label="Collection Inventory" value={money(collectionValue)} />
                        <StatCard label="Tracked Cards" value={money(trackedValue)} />
                        <StatCard label="Sealed Products" value={money(sealedValue)} />
                        <StatCard label="Giveaway Stock" value={money(giveawayValue)} />
                        <StatCard label="Break Stock" value={money(breakStockValue)} />
                        <StatCard label="Total Inventory" value={money(inventoryValue)} />
                      </div>
                    </section>

                    <section className="panel">
                      <div className="eyebrow">Best performing</div>
                      <h2>Business Records</h2>
                      <div className="stats-grid">
                        <StatCard label="Best Combined Day" value={combinedDailyRows[0] ? money(combinedDailyRows[0].profit) : money(0)} positive sub={combinedDailyRows[0] ? fullDate(combinedDailyRows[0].date) : 'No data'} />
                        <StatCard label="Best Break Stream" value={bestBreakStream ? money(bestBreakStream.profit) : money(0)} positive sub={bestBreakStream ? fullDate(bestBreakStream.stream_date) : 'No data'} />
                        <StatCard label="Best Singles Sale" value={bestSinglesSale ? money(bestSinglesSale.profit) : money(0)} positive sub={bestSinglesSale ? bestSinglesSale.description || fullDate(bestSinglesSale.sold_date) : 'No data'} />
                        <StatCard label="Break Profit Share" value={`${totalProfit ? decimal((allBreaks.profit / totalProfit) * 100) : '0.0'}%`} />
                        <StatCard label="Singles Profit Share" value={`${totalProfit ? decimal((allSingles.profit / totalProfit) * 100) : '0.0'}%`} />
                      </div>
                    </section>
                  </div>
                </>
              )}

              {tab === 'calendar' && (
                <>
                  <section className="panel">
                    <div className="calendar-head">
                      <button className="button" onClick={() => { const date = new Date(selectedYear, selectedMonth - 1, 1); setSelectedYear(date.getFullYear()); setSelectedMonth(date.getMonth()) }}>←</button>
                      <div style={{ textAlign: 'center' }}>
                        <div className="eyebrow">Combined calendar</div>
                        <h2>{monthLabel(selectedYear, selectedMonth)}</h2>
                      </div>
                      <button className="button" onClick={() => { const date = new Date(selectedYear, selectedMonth + 1, 1); setSelectedYear(date.getFullYear()); setSelectedMonth(date.getMonth()) }}>→</button>
                    </div>

                    <div className="calendar-grid">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div className="weekday" key={day}>{day}</div>)}
                      {calendarDays.map((day) => {
                        const breakSummary = summariseBreaks(breaks.filter((row) => row.stream_date === day.key))
                        const singlesSummary = summariseSingles(singles.filter((row) => row.sold_date === day.key))
                        return (
                          <button key={day.key} className={`day ${day.inMonth ? '' : 'out'} ${selectedDate === day.key ? 'selected' : ''}`} onClick={() => setSelectedDate(day.key)}>
                            <strong>{parseDate(day.key).getDate()}</strong>
                            <strong className="profit">{money(breakSummary.profit + singlesSummary.profit)}</strong>
                            <span>Breaks: {money(breakSummary.profit)}</span>
                            <span>Singles: {money(singlesSummary.profit)}</span>
                            <span>{breakSummary.streams} streams · {breakSummary.packs} packs</span>
                            <span>{singlesSummary.cards} cards · {singlesSummary.sealed} sealed</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="eyebrow">Selected day</div>
                    <h2>{fullDate(selectedDate)}</h2>
                    <div className="stats-grid">
                      <StatCard label="Combined Gross" value={money(dayBreaks.gross + daySingles.gross)} />
                      <StatCard label="Combined Net" value={money(dayBreaks.net + daySingles.net)} />
                      <StatCard label="Combined Profit" value={money(dayBreaks.profit + daySingles.profit)} positive />
                      <StatCard label="Break Profit" value={money(dayBreaks.profit)} sub={`${dayBreaks.streams} streams · ${dayBreaks.packs} packs`} />
                      <StatCard label="Singles Profit" value={money(daySingles.profit)} sub={`${daySingles.cards} cards · ${daySingles.sealed} sealed`} />
                      <StatCard label="Total Items" value={String(dayBreaks.packs + daySingles.items)} />
                    </div>
                  </section>
                </>
              )}

              {tab === 'breaks' && (
                <>
                  <section className="panel hero">
                    <div className="section-head">
                      <div><div className="eyebrow">Break performance</div><h2>All-Time Break Operations</h2></div>
                      <div className="muted">Giveaways excluded from packs used</div>
                    </div>
                    <div className="stats-grid">
                      <StatCard label="Gross Sales" value={money(allBreaks.gross)} />
                      <StatCard label="Net Sales" value={money(allBreaks.net)} />
                      <StatCard label="Profit" value={money(allBreaks.profit)} positive />
                      <StatCard label="Margin" value={`${allBreaks.net ? decimal((allBreaks.profit / allBreaks.net) * 100) : '0.0'}%`} />
                      <StatCard label="Streams" value={String(allBreaks.streams)} />
                      <StatCard label="Packs Used" value={String(allBreaks.packs)} />
                      <StatCard label="Average Sales / Stream" value={money(allBreaks.streams ? allBreaks.gross / allBreaks.streams : 0)} />
                      <StatCard label="Average Net / Stream" value={money(allBreaks.streams ? allBreaks.net / allBreaks.streams : 0)} />
                      <StatCard label="Average Profit / Stream" value={money(allBreaks.streams ? allBreaks.profit / allBreaks.streams : 0)} />
                      <StatCard label="Average Packs / Stream" value={decimal(allBreaks.streams ? allBreaks.packs / allBreaks.streams : 0)} />
                    </div>
                  </section>

                  <section className="panel">
                    <div className="eyebrow">Best streams ever</div>
                    <h2>Highest Profit Break Streams</h2>
                    <div className="table">
                      {[...breaks].sort((a, b) => num(b.profit) - num(a.profit)).slice(0, 15).map((row, index) => (
                        <div className="table-row" key={row.id}>
                          <strong><span className="rank">{index + 1}</span>{fullDate(row.stream_date)}{row.stream_slot ? ` · Stream ${row.stream_slot}` : ''}</strong>
                          <span>Sales {money(row.sales)}</span>
                          <span>Net {money(row.sales_after_fees)}</span>
                          <span>Cost {money(row.total_cost)}</span>
                          <span className="positive">Profit {money(row.profit)}</span>
                          <span>{packsOnlyByStream.get(row.id) || 0} packs</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {tab === 'singles' && (
                <>
                  <section className="panel hero">
                    <div className="section-head">
                      <div><div className="eyebrow">Singles performance</div><h2>All-Time Singles Centre</h2></div>
                      <div className="muted">Giveaways excluded from cards and sealed sold</div>
                    </div>
                    <div className="stats-grid">
                      <StatCard label="Gross Sales" value={money(allSingles.gross)} />
                      <StatCard label="Net Sales" value={money(allSingles.net)} />
                      <StatCard label="Profit" value={money(allSingles.profit)} positive />
                      <StatCard label="Margin" value={`${allSingles.net ? decimal((allSingles.profit / allSingles.net) * 100) : '0.0'}%`} />
                      <StatCard label="Transactions" value={String(allSingles.transactions)} />
                      <StatCard label="Cards Sold" value={String(allSingles.cards)} />
                      <StatCard label="Sealed Sold" value={String(allSingles.sealed)} />
                      <StatCard label="Average Gross / Transaction" value={money(allSingles.transactions ? allSingles.gross / allSingles.transactions : 0)} />
                      <StatCard label="Average Net / Transaction" value={money(allSingles.transactions ? allSingles.net / allSingles.transactions : 0)} />
                      <StatCard label="Average Profit / Transaction" value={money(allSingles.transactions ? allSingles.profit / allSingles.transactions : 0)} />
                    </div>
                  </section>

                  <section className="panel">
                    <div className="eyebrow">Platform performance</div>
                    <h2>Singles by Platform</h2>
                    <div className="table">
                      {platformRows.map((row) => (
                        <div className="table-row" key={row.platform}>
                          <strong>{row.platform.charAt(0).toUpperCase() + row.platform.slice(1)}</strong>
                          <span>Gross {money(row.gross)}</span>
                          <span>Net {money(row.net)}</span>
                          <span className="positive">Profit {money(row.profit)}</span>
                          <span>{row.transactions} transactions</span>
                          <span>{row.cards} cards · {row.sealed} sealed</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="eyebrow">Best streams ever</div>
                    <h2>Highest Profit Singles Streams / Sales</h2>
                    <div className="table">
                      {[...singles].sort((a, b) => num(b.profit) - num(a.profit)).slice(0, 15).map((row, index) => {
                        const breakdown = getSinglesBreakdown(row, sealed)
                        return (
                          <div className="table-row" key={row.id}>
                            <strong><span className="rank">{index + 1}</span>{row.description || 'Singles sale'}<div className="muted">{shortDate(row.sold_date)}</div></strong>
                            <span>{row.platform.charAt(0).toUpperCase() + row.platform.slice(1)}</span>
                            <span>Gross {money(row.sale_price)}</span>
                            <span>Net {money(row.net_sale)}</span>
                            <span className="positive">Profit {money(row.profit)}</span>
                            <span>{breakdown.cards} cards · {breakdown.sealed} sealed</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </OwnerGuard>
  )
}