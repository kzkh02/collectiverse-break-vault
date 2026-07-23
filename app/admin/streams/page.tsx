'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGuard from '../guard'
import { supabase } from '../../../lib/supabase'

type Tab = 'entry' | 'purchased' | 'sales'
type ItemType = 'packs' | 'follower_giveaway' | 'buyer_giveaway' | 'supplies'

type StreamSet = {
  id: string
  name: string
  active: boolean
  item_type?: ItemType | string
}

type PackBatch = {
  id: string
  set_id: string
  purchase_date: string
  packs_bought: number
  packs_remaining: number
  total_cost: number
  cost_per_pack: number
  stream_sets?: { name?: string; item_type?: string } | null
}

type StreamRow = {
  id: string
  stream_date: string
  stream_slot: number
  sales: number
  sales_after_fees: number
  packs_used: number
  packs_only_used?: number
  total_cost: number
  profit: number
}

type ProductInput = {
  set_id: string
  quantity_used: string
}

type CalendarDay = {
  key: string
  inMonth: boolean
}

const TAX_YEAR_START_MONTH = 3 // April, zero-indexed
const TAX_YEAR_START_DAY = 10

function money(value: number | string | null | undefined) {
  const number = Number(value || 0)
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(number)
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

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(value: string, days: number) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function todayKey() {
  return dateKey(new Date())
}

function monthLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

function dayName(value: string) {
  return parseLocalDate(value).toLocaleDateString('en-GB', { weekday: 'short' })
}

function shortDate(value: string) {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function fullDate(value: string) {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getCalendarDays(year: number, monthIndex: number): CalendarDay[] {
  const first = new Date(year, monthIndex, 1)
  const start = new Date(first)
  const firstDay = first.getDay() // Sun = 0

  start.setDate(first.getDate() - firstDay)

  const days: CalendarDay[] = []

  for (let i = 0; i < 35; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)

    days.push({
      key: dateKey(date),
      inMonth: date.getMonth() === monthIndex,
    })
  }

  return days
}

function getTaxYearStartForDate(value: string) {
  const date = parseLocalDate(value)
  const candidate = new Date(date.getFullYear(), TAX_YEAR_START_MONTH, TAX_YEAR_START_DAY)

  if (date < candidate) {
    return dateKey(new Date(date.getFullYear() - 1, TAX_YEAR_START_MONTH, TAX_YEAR_START_DAY))
  }

  return dateKey(candidate)
}

function getTaxYearLabel(start: string) {
  const startDate = parseLocalDate(start)
  return `${startDate.getFullYear()}/${startDate.getFullYear() + 1}`
}

function getPayrunPeriods(taxYearStart: string) {
  return Array.from({ length: 26 }, (_, index) => {
    const start = addDays(taxYearStart, index * 14)
    const end = addDays(start, 13)

    return {
      period: index + 1,
      start,
      end,
      label: `2-Week ${index + 1}`,
    }
  })
}

function getCurrentPayrun(taxYearStart: string) {
  const today = todayKey()
  const periods = getPayrunPeriods(taxYearStart)

  return (
    periods.find((period) => today >= period.start && today <= period.end) ||
    periods[0]
  )
}

function sumStreams(streams: StreamRow[]) {
  return streams.reduce(
    (total, stream) => {
      total.sales += Number(stream.sales || 0)
      total.salesAfterFees += Number(stream.sales_after_fees || 0)
      total.quantity += Number(stream.packs_used || 0)
      total.packsOnly += Number(stream.packs_only_used || 0)
      total.cost += Number(stream.total_cost || 0)
      total.profit += Number(stream.profit || 0)
      total.count += 1
      return total
    },
    { sales: 0, salesAfterFees: 0, quantity: 0, packsOnly: 0, cost: 0, profit: 0, count: 0 }
  )
}

function typeLabel(type?: string) {
  switch (type) {
    case 'follower_giveaway':
      return 'Follower Giveaway'
    case 'buyer_giveaway':
      return 'Buyer Giveaway'
    case 'supplies':
      return 'Supplies'
    default:
      return 'Packs'
  }
}

export default function StreamsPage() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('entry')
  const [message, setMessage] = useState('')
  const [sets, setSets] = useState<StreamSet[]>([])
  const [batches, setBatches] = useState<PackBatch[]>([])
  const [streams, setStreams] = useState<StreamRow[]>([])

  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(todayKey())

  const [taxYearStart, setTaxYearStart] = useState(getTaxYearStartForDate(todayKey()))
  const payrunPeriods = useMemo(() => getPayrunPeriods(taxYearStart), [taxYearStart])
  const currentPeriod = useMemo(() => getCurrentPayrun(taxYearStart), [taxYearStart])
  const [selectedPayrunPeriod, setSelectedPayrunPeriod] = useState(currentPeriod.period)

  const selectedPayrun =
    payrunPeriods.find((period) => period.period === selectedPayrunPeriod) || currentPeriod

  const previousPayrun =
    payrunPeriods.find((period) => period.period === selectedPayrun.period - 1) || null

  const visiblePayrunPeriods = payrunPeriods.filter(
    (period) =>
      period.period >= selectedPayrunPeriod - 1 &&
      period.period <= selectedPayrunPeriod + 1
  )

  const [newSetName, setNewSetName] = useState('')
  const [newSetType, setNewSetType] = useState<ItemType>('packs')

  const [purchaseSetId, setPurchaseSetId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayKey())
  const [purchaseQuantity, setPurchaseQuantity] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('')

  const [streamDate, setStreamDate] = useState(todayKey())
  const [streamSlot, setStreamSlot] = useState('1')
  const [streamSales, setStreamSales] = useState('')
  const [streamSalesAfterFees, setStreamSalesAfterFees] = useState('')
  const [productRows, setProductRows] = useState<ProductInput[]>([
    { set_id: '', quantity_used: '' },
  ])

  const calendarDays = useMemo(
    () => getCalendarDays(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  )

  const streamsByDate = useMemo(() => {
    const map = new Map<string, StreamRow[]>()

    streams.forEach((stream) => {
      const current = map.get(stream.stream_date) || []
      current.push(stream)
      map.set(stream.stream_date, current)
    })

    return map
  }, [streams])

  const selectedDayStreams = streamsByDate.get(selectedDate) || []
  const selectedDayTotals = sumStreams(selectedDayStreams)

  const currentMonthStreams = streams.filter((stream) => {
    const d = parseLocalDate(stream.stream_date)
    return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth
  })

  const monthTotals = sumStreams(currentMonthStreams)

  const selectedPayrunStreams = streams.filter(
    (stream) => stream.stream_date >= selectedPayrun.start && stream.stream_date <= selectedPayrun.end
  )

  const previousPayrunStreams = previousPayrun
    ? streams.filter(
        (stream) =>
          stream.stream_date >= previousPayrun.start && stream.stream_date <= previousPayrun.end
      )
    : []

  const currentPayrun = sumStreams(selectedPayrunStreams)
  const previousPayrunTotals = sumStreams(previousPayrunStreams)
  const allTime = sumStreams(streams)

  const payrunChange =
    previousPayrunTotals.profit > 0
      ? ((currentPayrun.profit - previousPayrunTotals.profit) / previousPayrunTotals.profit) * 100
      : 0

  const payrunHistory = useMemo(() => {
    return payrunPeriods.map((period) => {
      const periodStreams = streams.filter(
        (stream) => stream.stream_date >= period.start && stream.stream_date <= period.end
      )

      return {
        ...period,
        ...sumStreams(periodStreams),
      }
    })
  }, [payrunPeriods, streams])

  const profitByDay = useMemo(() => {
    const groups = new Map<string, { profit: number; count: number }>()

    streams.forEach((stream) => {
      const day = parseLocalDate(stream.stream_date).toLocaleDateString('en-GB', {
        weekday: 'long',
      })
      const current = groups.get(day) || { profit: 0, count: 0 }
      current.profit += Number(stream.profit || 0)
      current.count += 1
      groups.set(day, current)
    })

    const order = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']

    return order
      .filter((day) => groups.has(day))
      .map((day) => {
        const item = groups.get(day)!
        return {
          day,
          average: item.count ? item.profit / item.count : 0,
          total: item.profit,
          count: item.count,
        }
      })
  }, [streams])

  const bestDays = useMemo(() => {
    const rows = Array.from(streamsByDate.entries()).map(([date, dayStreams]) => ({
      date,
      ...sumStreams(dayStreams),
    }))

    return rows.sort((a, b) => b.profit - a.profit).slice(0, 10)
  }, [streamsByDate])

  useEffect(() => {
    setSelectedPayrunPeriod(currentPeriod.period)
  }, [currentPeriod.period])

  async function loadData() {
    setMessage('Loading...')

    const [setsResult, batchesResult, streamsResult, productsResult] = await Promise.all([
      supabase.from('stream_sets').select('*').order('name'),
      supabase
        .from('pack_batches')
        .select('*, stream_sets(name, item_type)')
        .order('purchase_date', { ascending: false }),
      supabase.from('streams').select('*').order('stream_date', { ascending: false }),
      supabase
        .from('stream_products')
        .select('stream_id, packs_used, stream_sets(item_type)'),
    ])

    if (setsResult.error) return setMessage(setsResult.error.message)
    if (batchesResult.error) return setMessage(batchesResult.error.message)
    if (streamsResult.error) return setMessage(streamsResult.error.message)
    if (productsResult.error) return setMessage(productsResult.error.message)

    const packsOnlyByStream = new Map<string, number>()

    ;(productsResult.data || []).forEach((item: any) => {
      const itemType = item.stream_sets?.item_type || 'packs'

      if (itemType !== 'packs') return

      const current = packsOnlyByStream.get(item.stream_id) || 0
      packsOnlyByStream.set(item.stream_id, current + Number(item.packs_used || 0))
    })

    const streamsWithPackTotals = ((streamsResult.data || []) as StreamRow[]).map((stream) => ({
      ...stream,
      packs_only_used: packsOnlyByStream.get(stream.id) || 0,
    }))

    setSets((setsResult.data || []) as StreamSet[])
    setBatches((batchesResult.data || []) as PackBatch[])
    setStreams(streamsWithPackTotals)
    setMessage('')
  }

  useEffect(() => {
    loadData()
  }, [])

  async function addSet() {
    const name = newSetName.trim()

    if (!name) return setMessage('Enter a name first.')

    const { error } = await supabase.from('stream_sets').insert({
      name,
      item_type: newSetType,
    })

    if (error) return setMessage(error.message)

    setNewSetName('')
    setNewSetType('packs')
    setMessage('Item added')
    loadData()
  }

  async function addPurchase() {
    const quantity = Number(purchaseQuantity)
    const totalCost = Number(purchaseCost)

    if (!purchaseSetId || !purchaseDate || quantity <= 0 || totalCost < 0) {
      setMessage('Choose an item, date, quantity bought and total cost.')
      return
    }

    const { error } = await supabase.from('pack_batches').insert({
      set_id: purchaseSetId,
      purchase_date: purchaseDate,
      packs_bought: quantity,
      packs_remaining: quantity,
      total_cost: totalCost,
      cost_per_pack: quantity > 0 ? totalCost / quantity : 0,
    })

    if (error) return setMessage(error.message)

    setPurchaseQuantity('')
    setPurchaseCost('')
    setMessage('Purchase added')
    loadData()
  }

  function updateProductRow(index: number, field: keyof ProductInput, value: string) {
    setProductRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    )
  }

  function addProductRow() {
    setProductRows((current) => [...current, { set_id: '', quantity_used: '' }])
  }

  function removeProductRow(index: number) {
    setProductRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  async function allocateCostForSet(setId: string, quantityNeeded: number) {
    let remainingNeeded = quantityNeeded
    let costUsed = 0

    const { data: fifoBatches, error } = await supabase
      .from('pack_batches')
      .select('*')
      .eq('set_id', setId)
      .gt('packs_remaining', 0)
      .order('purchase_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    const allocations: {
      batch_id: string
      packs_used: number
      cost_per_pack: number
      cost_used: number
    }[] = []

    for (const batch of fifoBatches || []) {
      if (remainingNeeded <= 0) break

      const batchRemaining = Number(batch.packs_remaining || 0)
      const quantityFromBatch = Math.min(batchRemaining, remainingNeeded)
      const costPerUnit = Number(batch.cost_per_pack || 0)
      const batchCost = quantityFromBatch * costPerUnit

      allocations.push({
        batch_id: String(batch.id),
        packs_used: quantityFromBatch,
        cost_per_pack: costPerUnit,
        cost_used: batchCost,
      })

      costUsed += batchCost
      remainingNeeded -= quantityFromBatch
    }

    if (remainingNeeded > 0) {
      const setName = sets.find((item) => item.id === setId)?.name || 'selected item'
      throw new Error(`Not enough quantity remaining for ${setName}. Short by ${remainingNeeded}.`)
    }

    return { costUsed, allocations }
  }

  async function saveStream() {
    const sales = Number(streamSales)
    const salesAfterFees = Number(streamSalesAfterFees)
    const slot = Number(streamSlot)

    const cleanRows = productRows
      .map((row) => ({
        set_id: row.set_id,
        quantity_used: Number(row.quantity_used),
      }))
      .filter((row) => row.set_id && row.quantity_used > 0)

    if (!streamDate || sales < 0 || salesAfterFees < 0 || cleanRows.length === 0) {
      setMessage('Enter stream date, sales, sales after fees and at least one item with quantity used.')
      return
    }

    try {
      setMessage('Saving stream...')

      const productCosts = []

      for (const row of cleanRows) {
        const allocation = await allocateCostForSet(row.set_id, row.quantity_used)
        productCosts.push({
          ...row,
          cost_used: allocation.costUsed,
          allocations: allocation.allocations,
        })
      }

      const totalQuantity = productCosts.reduce((sum, row) => sum + row.quantity_used, 0)
      const totalCost = productCosts.reduce((sum, row) => sum + row.cost_used, 0)
      const profit = salesAfterFees - totalCost

      const { data: stream, error: streamError } = await supabase
        .from('streams')
        .insert({
          stream_date: streamDate,
          stream_slot: slot,
          sales,
          sales_after_fees: salesAfterFees,
          packs_used: totalQuantity,
          total_cost: totalCost,
          profit,
        })
        .select('id')
        .single()

      if (streamError || !stream) {
        throw new Error(streamError?.message || 'Stream could not be created')
      }

      for (const row of productCosts) {
        const { data: streamProduct, error: productError } = await supabase
          .from('stream_products')
          .insert({
            stream_id: stream.id,
            set_id: row.set_id,
            packs_used: row.quantity_used,
            cost_used: row.cost_used,
          })
          .select('id')
          .single()

        if (productError || !streamProduct) {
          throw new Error(productError?.message || 'Stream product could not be created')
        }

        for (const allocation of row.allocations) {
          const { error: allocationError } = await supabase
            .from('stream_allocations')
            .insert({
              stream_product_id: streamProduct.id,
              batch_id: allocation.batch_id,
              packs_used: allocation.packs_used,
              cost_per_pack: allocation.cost_per_pack,
              cost_used: allocation.cost_used,
            })

          if (allocationError) throw new Error(allocationError.message)

          const { data: currentBatch, error: currentBatchError } = await supabase
            .from('pack_batches')
            .select('packs_remaining')
            .eq('id', allocation.batch_id)
            .single()

          if (currentBatchError || !currentBatch) {
            throw new Error(currentBatchError?.message || 'Batch not found')
          }

          const nextRemaining =
            Number(currentBatch.packs_remaining || 0) - allocation.packs_used

          const { error: updateBatchError } = await supabase
            .from('pack_batches')
            .update({ packs_remaining: nextRemaining })
            .eq('id', allocation.batch_id)

          if (updateBatchError) throw new Error(updateBatchError.message)
        }
      }

      setStreamSales('')
      setStreamSalesAfterFees('')
      setProductRows([{ set_id: '', quantity_used: '' }])
      setSelectedDate(streamDate)
      setTab('sales')
      setMessage('Stream saved')
      loadData()
    } catch (error: any) {
      setMessage(error?.message || 'Stream save failed')
    }
  }

  async function deleteBatch(batchId: string) {
    const batch = batches.find((item) => item.id === batchId)

    if (!batch) {
      setMessage('Batch not found.')
      return
    }

    if (Number(batch.packs_remaining) !== Number(batch.packs_bought)) {
      setMessage('This batch has already been used in a stream, so it cannot be deleted safely.')
      return
    }

    const confirmed = window.confirm(
      'Delete this purchase batch? Only do this if it was entered by mistake.'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('pack_batches')
      .delete()
      .eq('id', batchId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Purchase batch deleted')
    loadData()
  }

  async function deleteStream(streamId: string) {
    const confirmed = window.confirm(
      'Delete this stream and restore the quantities back into their purchase batches?'
    )

    if (!confirmed) return

    try {
      const { data: products, error: productsError } = await supabase
        .from('stream_products')
        .select('id')
        .eq('stream_id', streamId)

      if (productsError) throw new Error(productsError.message)

      const productIds = (products || []).map((item: any) => item.id)

      if (productIds.length > 0) {
        const { data: allocations, error: allocationsError } = await supabase
          .from('stream_allocations')
          .select('*')
          .in('stream_product_id', productIds)

        if (allocationsError) throw new Error(allocationsError.message)

        for (const allocation of allocations || []) {
          const { data: batch, error: batchError } = await supabase
            .from('pack_batches')
            .select('packs_remaining')
            .eq('id', allocation.batch_id)
            .single()

          if (batchError || !batch) throw new Error(batchError?.message || 'Batch not found')

          const { error: updateError } = await supabase
            .from('pack_batches')
            .update({
              packs_remaining:
                Number(batch.packs_remaining || 0) + Number(allocation.packs_used || 0),
            })
            .eq('id', allocation.batch_id)

          if (updateError) throw new Error(updateError.message)
        }
      }

      const { error: deleteError } = await supabase
        .from('streams')
        .delete()
        .eq('id', streamId)

      if (deleteError) throw new Error(deleteError.message)

      setMessage('Stream deleted and quantities restored')
      loadData()
    } catch (error: any) {
      setMessage(error?.message || 'Delete failed')
    }
  }

  function changeMonth(amount: number) {
    const next = new Date(selectedYear, selectedMonth + amount, 1)
    setSelectedYear(next.getFullYear())
    setSelectedMonth(next.getMonth())
  }

  function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
      <div className="stat-card">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    )
  }

  return (
    <AdminGuard>
      <main className="page">
        <style jsx global>{`
          .page {
            min-height: 100vh;
            background: radial-gradient(circle at top, #15157a 0%, #06063d 45%, #02021f 100%);
            color: white;
            padding: 24px;
          }

          .wrap {
            max-width: 1220px;
            margin: 0 auto;
          }

          .top {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            align-items: flex-start;
            margin-bottom: 20px;
          }

          h1 {
            margin: 0;
            font-size: clamp(2rem, 5vw, 3.4rem);
            font-weight: 950;
            letter-spacing: -1px;
          }

          h2 {
            margin: 0 0 14px;
            font-size: 1.25rem;
            font-weight: 950;
          }

          h3 {
            margin: 0 0 10px;
            font-size: 1rem;
            font-weight: 950;
            color: rgba(255,255,255,.9);
          }

          .sub {
            color: rgba(255,255,255,.72);
            font-weight: 800;
            margin-top: 6px;
          }

          .eyebrow {
            color: #fde68a;
            font-size: .72rem;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 7px;
            text-shadow: 0 0 18px rgba(250,204,21,.35);
          }

          .hero-panel {
            background:
              radial-gradient(circle at top left, rgba(250,204,21,.13), transparent 28%),
              linear-gradient(135deg, rgba(124,58,237,.22), rgba(255,255,255,.055));
          }


          .actions,
          .tabs,
          .row-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }

          .button,
          .tab {
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.08);
            color: white;
            border-radius: 999px;
            padding: 10px 14px;
            font-weight: 950;
            cursor: pointer;
            text-decoration: none;
            text-shadow: 0 2px 12px rgba(0,0,0,.25);
          }

          .button.primary,
          .tab.active {
            background: linear-gradient(135deg, #7c3aed, #c084fc);
            box-shadow: 0 10px 24px rgba(124,58,237,.32);
          }

          .button.danger {
            background: rgba(239,68,68,.16);
            border-color: rgba(248,113,113,.45);
            color: #fecaca;
          }

          .tabs { margin-bottom: 18px; }

          .message {
            margin: 0 0 16px;
            color: #fde68a;
            font-weight: 950;
          }

          .panel {
            border: 1px solid rgba(255,255,255,.14);
            background: linear-gradient(135deg, rgba(255,255,255,.075), rgba(255,255,255,.045));
            border-radius: 22px;
            padding: 18px;
            margin-bottom: 16px;
            box-shadow: 0 18px 56px rgba(0,0,0,.28);
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
          }

          .stat-card {
            border: 1px solid rgba(255,255,255,.14);
            background:
              radial-gradient(circle at top left, rgba(192,132,252,.12), transparent 40%),
              rgba(255,255,255,.06);
            border-radius: 18px;
            padding: 14px;
          }

          .stat-label {
            color: rgba(255,255,255,.66);
            font-size: .72rem;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .stat-value {
            margin-top: 6px;
            font-size: 1.45rem;
            font-weight: 950;
            color: white;
          }

          .stat-sub {
            margin-top: 4px;
            color: rgba(255,255,255,.66);
            font-size: .8rem;
            font-weight: 850;
          }

          .calendar-head,
          .payrun-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
          }

          .calendar-title {
            font-size: 1.45rem;
            font-weight: 950;
          }

          .weekday-row {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 10px;
          }

          .weekday {
            color: rgba(255,255,255,.58);
            font-size: .72rem;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding-left: 10px;
          }

          .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 10px;
          }

          .day-card {
            min-height: 150px;
            border: 1px solid rgba(255,255,255,.13);
            background: rgba(255,255,255,.055);
            border-radius: 18px;
            padding: 12px;
            cursor: pointer;
            text-align: left;
            color: white;
          }

          .day-card.outside {
            opacity: .38;
          }

          .day-card:hover,
          .day-card.selected {
            border-color: rgba(192,132,252,.55);
            background: rgba(124,58,237,.13);
          }

          .day-date {
            font-weight: 950;
            margin-bottom: 9px;
          }

          .day-stat {
            font-size: .82rem;
            color: rgba(255,255,255,.82);
            font-weight: 850;
            margin-top: 5px;
            letter-spacing: .1px;
          }

          .day-profit {
            color: #bbf7d0;
            font-weight: 950;
          }

          .form-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
          }

          .field label {
            display: block;
            margin-bottom: 7px;
            color: rgba(255,255,255,.68);
            font-size: .72rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 950;
          }

          .input,
          .select {
            width: 100%;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(0,0,0,.28);
            color: white;
            padding: 12px 13px;
            font-weight: 850;
            outline: none;
          }

          .product-row {
            display: grid;
            grid-template-columns: 1fr 180px auto;
            gap: 10px;
            align-items: end;
            margin-top: 10px;
          }

          .table {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .table-row {
            display: grid;
            grid-template-columns: 1fr repeat(5, 130px) auto;
            gap: 10px;
            align-items: center;
            border: 1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05);
            border-radius: 16px;
            padding: 12px;
            font-weight: 850;
          }



          .testing-table {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .testing-head,
          .testing-row {
            display: grid;
            grid-template-columns: minmax(250px, 1.8fr) 150px 160px 100px 150px;
            gap: 16px;
            align-items: center;
          }

          .testing-head {
            padding: 0 14px 4px;
            color: rgba(255,255,255,.58);
            font-size: .7rem;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .testing-row {
            min-height: 74px;
            border: 1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05);
            border-radius: 16px;
            padding: 12px 14px;
          }

          .testing-metric small {
            display: block;
            margin-bottom: 3px;
            color: rgba(255,255,255,.58);
            font-size: .72rem;
            font-weight: 800;
          }

          .testing-metric strong {
            display: block;
            font-size: .98rem;
            font-weight: 950;
          }

          .testing-delete {
            justify-self: end;
            min-width: 130px;
          }

          .payrun-row {
            display: grid;
            grid-template-columns: 130px 1fr repeat(4, 130px);
            gap: 10px;
            align-items: center;
            border: 1px solid rgba(255,255,255,.12);
            background: rgba(255,255,255,.05);
            border-radius: 16px;
            padding: 12px;
            font-weight: 850;
            cursor: pointer;
          }

          .payrun-row.active {
            border-color: rgba(192,132,252,.55);
            background: rgba(124,58,237,.14);
          }

          .table-title { font-weight: 950; }

          .muted {
            color: rgba(255,255,255,.66);
            font-size: .82rem;
            font-weight: 800;
            margin-top: 4px;
          }

          .performance-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
          }

          .payrun-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }

          .payrun-card {
            border: 1px solid rgba(255,255,255,.14);
            background:
              radial-gradient(circle at top left, rgba(192,132,252,.12), transparent 40%),
              rgba(255,255,255,.055);
            color: white;
            border-radius: 20px;
            padding: 16px;
            text-align: left;
            cursor: pointer;
          }

          .payrun-card.active {
            border-color: rgba(250,204,21,.45);
            background:
              radial-gradient(circle at top left, rgba(250,204,21,.16), transparent 38%),
              rgba(124,58,237,.18);
            box-shadow: 0 12px 32px rgba(124,58,237,.20);
          }

          .payrun-card-title {
            font-weight: 950;
            font-size: 1rem;
          }

          .payrun-card-date {
            color: rgba(255,255,255,.64);
            font-size: .82rem;
            font-weight: 850;
            margin-top: 4px;
          }

          .payrun-card-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 14px;
          }

          .payrun-card-grid span {
            display: block;
            color: rgba(255,255,255,.58);
            font-size: .68rem;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: .8px;
          }

          .payrun-card-grid strong {
            display: block;
            margin-top: 4px;
            color: white;
            font-size: .98rem;
            font-weight: 950;
          }

          .profit-text {
            color: #bbf7d0 !important;
          }

          .compact-select {
            max-width: 260px;
          }


          .sales-head,
          .sales-row {
            grid-template-columns: minmax(250px, 1.7fr) 120px 105px 105px 110px 170px 90px;
          }

          .platform-pill {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.08);
            border-radius: 999px;
            padding: 8px 11px;
            font-size: .78rem;
            font-weight: 950;
          }

          .sale-date {
            font-weight: 850;
            color: rgba(255,255,255,.9);
          }

          @media (max-width: 920px) {
            .page { padding: 14px; }
            .top, .calendar-head, .payrun-head { flex-direction: column; align-items: flex-start; }
            .weekday-row { display: none; }
            .calendar-grid, .payrun-strip { grid-template-columns: 1fr; }
            .form-grid, .product-row, .table-row, .payrun-row, .testing-head, .testing-row, .sales-head, .sales-row { grid-template-columns: 1fr; }
            .testing-head { display: none; }
            .testing-delete { justify-self: stretch; width: 100%; }
          }
        `}</style>

        <div className="wrap">
          <header className="top">
            <div>
              <h1>Operations</h1>
              <div className="sub">
                Purchases, stream entry, inventory and sales management.
              </div>
            </div>

            <div className="actions">
              <Link href="/admin" className="button">← Admin</Link>
              <button className="button" onClick={loadData}>Refresh</button>
            </div>
          </header>

          <nav className="tabs">
            <button className={`tab ${tab === 'entry' ? 'active' : ''}`} onClick={() => setTab('entry')}>➕ Add Stream</button>
            <button className={`tab ${tab === 'purchased' ? 'active' : ''}`} onClick={() => setTab('purchased')}>📦 Purchased</button>
            <button className={`tab ${tab === 'sales' ? 'active' : ''}`} onClick={() => setTab('sales')}>💷 Sales</button>
          </nav>

          {message && <div className="message">{message}</div>}

          {tab === 'entry' && (
            <section className="panel">
              <h2>Add Stream</h2>

              <div className="form-grid">
                <div className="field">
                  <label>Stream Date</label>
                  <input className="input" type="date" value={streamDate} onChange={(e) => setStreamDate(e.target.value)} />
                </div>

                <div className="field">
                  <label>Stream Slot</label>
                  <select className="select" value={streamSlot} onChange={(e) => setStreamSlot(e.target.value)}>
                    <option value="1">Stream 1</option>
                    <option value="2">Stream 2</option>
                  </select>
                </div>

                <div className="field">
                  <label>Sales</label>
                  <input className="input" type="number" value={streamSales} onChange={(e) => setStreamSales(e.target.value)} placeholder="0.00" />
                </div>

                <div className="field">
                  <label>Sales After Fees</label>
                  <input className="input" type="number" value={streamSalesAfterFees} onChange={(e) => setStreamSalesAfterFees(e.target.value)} placeholder="0.00" />
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <h3>Items Used</h3>

                {productRows.map((row, index) => (
                  <div className="product-row" key={index}>
                    <div className="field">
                      <label>Item</label>
                      <select className="select" value={row.set_id} onChange={(e) => updateProductRow(index, 'set_id', e.target.value)}>
                        <option value="">Choose item...</option>
                        {sets.map((set) => (
                          <option key={set.id} value={set.id}>{set.name} · {typeLabel(set.item_type)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>Packs Used</label>
                      <input className="input" type="number" value={row.quantity_used} onChange={(e) => updateProductRow(index, 'quantity_used', e.target.value)} />
                    </div>

                    <button className="button danger" onClick={() => removeProductRow(index)}>Remove</button>
                  </div>
                ))}

                <div className="row-actions" style={{ marginTop: 14 }}>
                  <button className="button" onClick={addProductRow}>Add another item</button>
                  <button className="button primary" onClick={saveStream}>Save Stream</button>
                </div>
              </div>
            </section>
          )}


          {tab === 'sales' && (
            <section className="panel">
              <h2>Sales</h2>

              <div className="testing-table">
                <div className="testing-head sales-head">
                  <span>Stream</span>
                  <span>Platform</span>
                  <span>Gross</span>
                  <span>Net</span>
                  <span>Packs Used</span>
                  <span>Date</span>
                  <span></span>
                </div>

                {streams.slice(0, 50).map((stream) => (
                  <div className="testing-row sales-row" key={stream.id}>
                    <div>
                      <div className="table-title">Stream {stream.stream_slot}</div>
                      <div className="muted">Break Operations</div>
                    </div>
                    <div><span className="platform-pill">Streaming</span></div>
                    <div className="testing-metric">
                      <small>Gross</small>
                      <strong>{money(stream.sales)}</strong>
                    </div>
                    <div className="testing-metric">
                      <small>Net</small>
                      <strong>{money(stream.sales_after_fees)}</strong>
                    </div>
                    <div className="testing-metric">
                      <small>Packs Used</small>
                      <strong>{stream.packs_only_used || 0}</strong>
                    </div>
                    <div className="sale-date">{fullDate(stream.stream_date)}</div>
                    <button className="button danger testing-delete" onClick={() => deleteStream(stream.id)}>Delete</button>
                  </div>
                ))}

                {streams.length === 0 && <div className="muted">No stream sales recorded yet.</div>}
              </div>
            </section>
          )}

          {tab === 'purchased' && (
            <>
              <section className="panel">
                <h2>Add Item</h2>
                <div className="product-row">
                  <div className="field">
                    <label>Item Name</label>
                    <input className="input" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="Prismatic Evolutions / Follower Giveaway / Buyer Giveaway" />
                  </div>

                  <div className="field">
                    <label>Item Type</label>
                    <select className="select" value={newSetType} onChange={(e) => setNewSetType(e.target.value as ItemType)}>
                      <option value="packs">Packs</option>
                      <option value="follower_giveaway">Follower Giveaway</option>
                      <option value="buyer_giveaway">Buyer Giveaway</option>
                      <option value="supplies">Supplies</option>
                    </select>
                  </div>

                  <button className="button primary" onClick={addSet}>Add Item</button>
                </div>
              </section>

              <section className="panel">
                <h2>Add Purchase Batch</h2>

                <div className="form-grid">
                  <div className="field">
                    <label>Item</label>
                    <select className="select" value={purchaseSetId} onChange={(e) => setPurchaseSetId(e.target.value)}>
                      <option value="">Choose item...</option>
                      {sets.map((set) => (
                        <option key={set.id} value={set.id}>{set.name} · {typeLabel(set.item_type)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Purchase Date</label>
                    <input className="input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                  </div>

                  <div className="field">
                    <label>Quantity Bought</label>
                    <input className="input" type="number" value={purchaseQuantity} onChange={(e) => setPurchaseQuantity(e.target.value)} />
                  </div>

                  <div className="field">
                    <label>Total Cost</label>
                    <input className="input" type="number" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <button className="button primary" onClick={addPurchase}>Save Purchase</button>
                </div>
              </section>

              <section className="panel">
                <h2>Purchase Batches</h2>

                <div className="table">
                  {batches.map((batch) => (
                    <div className="table-row" key={batch.id}>
                      <div>
                        <div className="table-title">{batch.stream_sets?.name || 'Unknown Item'}</div>
                        <div className="muted">{batch.purchase_date} · {typeLabel(batch.stream_sets?.item_type)}</div>
                      </div>
                      <div>{batch.packs_remaining}/{batch.packs_bought} left</div>
                      <div>Total {money(batch.total_cost)}</div>
                      <div>{money(batch.cost_per_pack)} / unit</div>
                      <div>
                        {Number(batch.packs_remaining) === Number(batch.packs_bought) ? (
                          <button className="button danger" onClick={() => deleteBatch(batch.id)}>
                            Delete Batch
                          </button>
                        ) : (
                          <span className="muted">In use</span>
                        )}
                      </div>
                      <div></div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

        </div>
      </main>
    </AdminGuard>
  )
}