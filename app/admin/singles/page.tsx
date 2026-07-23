'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGuard from '../guard'
import { supabase } from '../../../lib/supabase'

type Tab = 'active' | 'sold' | 'ebay' | 'streaming' | 'website' | 'sales' | 'purchases'
type Platform = 'unlisted' | 'ebay' | 'streaming' | 'website'
type CardStatus = 'available' | 'listed' | 'reserved' | 'sold'
type PlatformView = 'active' | 'sold'
type SaleMode = 'streaming' | 'tracked'
type StreamingSaleItem = { kind: 'collection' | 'tracked' | 'sealed'; card_id: string; sealed_id: string; quantity: string }

type Collection = {
  id: string
  name: string
  supplier: string | null
  purchase_date: string
  total_paid: number
  notes: string | null
  created_at?: string
}

type PoolLot = {
  id: string
  collection_id: string
  quantity_bought: number
  quantity_remaining: number
  allocated_cost: number
  unit_cost: number
  collections?: { name?: string; purchase_date?: string } | null
}

type InventoryCard = {
  id: string
  collection_id: string | null
  card_name: string
  set_name: string | null
  card_number: string | null
  condition: string
  allocated_cost: number
  platform: Platform
  listed_price: number | null
  status: CardStatus
  notes: string | null
  created_at?: string
  collections?: { name?: string } | null
}

type Sale = {
  id: string
  inventory_card_id: string | null
  collection_id: string | null
  sale_type: 'individual' | 'pool'
  description: string
  platform: Exclude<Platform, 'unlisted'>
  quantity: number
  sale_price: number
  net_sale: number
  fees: number
  postage: number
  cost_basis: number
  profit: number
  sold_date: string
  notes: string | null
  inventory_cards?: { card_name?: string; set_name?: string; card_number?: string } | null
  collections?: { name?: string } | null
}

type DraftCard = {
  card_name: string
  set_name: string
  card_number: string
  condition: string
  allocated_cost: string
  platform: Platform
  listed_price: string
  notes: string
}

type SealedBatch = {
  id: string
  product_name: string
  product_type: string
  supplier: string | null
  purchase_date: string
  quantity_bought: number
  quantity_remaining: number
  total_cost: number
  unit_cost: number
  notes: string | null
}

type CalendarDay = { key: string; inMonth: boolean }

const PAYRUN_ANCHOR = '2026-07-31'

const platformLabels: Record<Platform, string> = {
  unlisted: 'Unlisted',
  ebay: 'eBay',
  streaming: 'Streaming',
  website: 'Website',
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0))
}

function number(value: number | string | null | undefined) {
  return Number(value || 0)
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
  if (!value) return '—'
  return parseDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fullDate(value: string) {
  return parseDate(value).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
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
  const dayDifference = Math.floor((target - anchor) / 86400000)
  const periodOffset = Math.floor(dayDifference / 14)
  const start = addDays(PAYRUN_ANCHOR, periodOffset * 14)
  return { index: periodOffset + 1, start, end: addDays(start, 13) }
}

function getPayrunByOffset(base: ReturnType<typeof getPayrunForDate>, offset: number) {
  const start = addDays(base.start, offset * 14)
  return { index: base.index + offset, start, end: addDays(start, 13) }
}

function blankDraftCard(): DraftCard {
  return {
    card_name: '', set_name: '', card_number: '', condition: 'NM', allocated_cost: '',
    platform: 'unlisted', listed_price: '', notes: '',
  }
}

function normalisePlatform(value: string): Platform {
  if (value === 'whatnot' || value === 'tiktok') return 'streaming'
  if (value === 'ebay' || value === 'website' || value === 'streaming') return value
  return 'unlisted'
}

export default function SinglesCentrePage() {
  const now = new Date()
  const [tab, setTab] = useState<Tab>('active')
  const [platformView, setPlatformView] = useState<PlatformView>('active')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [collections, setCollections] = useState<Collection[]>([])
  const [poolLots, setPoolLots] = useState<PoolLot[]>([])
  const [cards, setCards] = useState<InventoryCard[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [sealedBatches, setSealedBatches] = useState<SealedBatch[]>([])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CardStatus>('all')

  const [collectionName, setCollectionName] = useState('')
  const [supplier, setSupplier] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(todayKey())
  const [totalPaid, setTotalPaid] = useState('')
  const [poolQuantity, setPoolQuantity] = useState('')
  const [collectionNotes, setCollectionNotes] = useState('')
  const [draftCards, setDraftCards] = useState<DraftCard[]>([blankDraftCard()])
  const [purchaseMode, setPurchaseMode] = useState<'collection' | 'sealed' | 'giveaway'>('collection')
  const [sealedName, setSealedName] = useState('')
  const [sealedType, setSealedType] = useState('Packs')
  const [sealedSupplier, setSealedSupplier] = useState('')
  const [sealedDate, setSealedDate] = useState(todayKey())
  const [sealedQuantity, setSealedQuantity] = useState('')
  const [sealedCost, setSealedCost] = useState('')
  const [sealedNotes, setSealedNotes] = useState('')

  const [editCard, setEditCard] = useState<InventoryCard | null>(null)
  const [showPromoteCard, setShowPromoteCard] = useState(false)
  const [promoteCard, setPromoteCard] = useState<DraftCard>(blankDraftCard())

  const [saleMode, setSaleMode] = useState<SaleMode>('streaming')
  const [saleCardId, setSaleCardId] = useState('')
  const [streamingItems, setStreamingItems] = useState<StreamingSaleItem[]>([
    { kind: 'collection', card_id: '', sealed_id: '', quantity: '' },
  ])
  const [streamItemSearches, setStreamItemSearches] = useState<Record<number, string>>({})
  const [salePlatform, setSalePlatform] = useState<Exclude<Platform, 'unlisted'>>('streaming')
  const [saleQuantity, setSaleQuantity] = useState('1')
  const [grossSale, setGrossSale] = useState('')
  const [netSale, setNetSale] = useState('')
  const [salePostage, setSalePostage] = useState('')
  const [saleDate, setSaleDate] = useState(todayKey())
  const [saleNotes, setSaleNotes] = useState('')

  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [payrunOffset, setPayrunOffset] = useState(0)

  async function loadData() {
    setLoading(true)
    setMessage('')
    const [collectionsResult, poolResult, cardsResult, salesResult, sealedResult] = await Promise.all([
      supabase.from('singles_collections').select('*').order('purchase_date', { ascending: false }),
      supabase.from('singles_pool_lots').select('*, collections:singles_collections(name, purchase_date)').order('created_at', { ascending: false }),
      supabase.from('singles_inventory_cards').select('*, collections:singles_collections(name)').order('created_at', { ascending: false }),
      supabase.from('singles_sales').select('*, inventory_cards:singles_inventory_cards(card_name, set_name, card_number), collections:singles_collections(name)').order('sold_date', { ascending: false }),
      supabase.from('singles_sealed_batches').select('*').order('purchase_date', { ascending: false }),
    ])
    const error = collectionsResult.error || poolResult.error || cardsResult.error || salesResult.error || sealedResult.error
    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }
    setCollections((collectionsResult.data || []) as Collection[])
    setPoolLots((poolResult.data || []) as PoolLot[])
    setCards(((cardsResult.data || []) as any[]).map((card) => ({ ...card, platform: normalisePlatform(card.platform) })) as InventoryCard[])
    setSealedBatches((sealedResult.data || []) as SealedBatch[])
    setSales(((salesResult.data || []) as any[]).map((sale) => ({
      ...sale,
      platform: normalisePlatform(sale.platform) === 'unlisted' ? 'streaming' : normalisePlatform(sale.platform),
      net_sale: sale.net_sale == null ? number(sale.sale_price) - number(sale.fees) : number(sale.net_sale),
    })) as Sale[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const activeCards = useMemo(() => cards.filter((card) => card.status !== 'sold'), [cards])
  const soldCards = useMemo(() => cards.filter((card) => card.status === 'sold'), [cards])
  const poolQuantityRemaining = poolLots.reduce((sum, lot) => sum + number(lot.quantity_remaining), 0)
  const poolBookValue = poolLots.reduce((sum, lot) => sum + number(lot.quantity_remaining) * number(lot.unit_cost), 0)
  const activeCardCost = activeCards.reduce((sum, card) => sum + number(card.allocated_cost), 0)
  const isGiveawayBatch = (batch: SealedBatch) => batch.product_type.toLowerCase().includes('giveaway')
  const sealedInventory = sealedBatches.filter((batch) => !isGiveawayBatch(batch))
  const giveawayInventory = sealedBatches.filter(isGiveawayBatch)
  const collectionRemainingQuantity = poolLots.reduce((sum, lot) => sum + number(lot.quantity_remaining), 0)
  const collectionInventoryValue = poolLots.reduce((sum, lot) => sum + number(lot.quantity_remaining) * number(lot.unit_cost), 0)
  const collectionAverageCost = collectionRemainingQuantity > 0 ? collectionInventoryValue / collectionRemainingQuantity : 0
  const sealedInventoryValue = sealedInventory.reduce((sum, batch) => sum + number(batch.quantity_remaining) * number(batch.unit_cost), 0)
  const giveawayInventoryValue = giveawayInventory.reduce((sum, batch) => sum + number(batch.quantity_remaining) * number(batch.unit_cost), 0)
  const totalInventoryValue = collectionInventoryValue + activeCardCost + sealedInventoryValue + giveawayInventoryValue

  const currentPayrunBase = useMemo(() => getPayrunForDate(todayKey()), [])
  const selectedPayrun = useMemo(() => getPayrunByOffset(currentPayrunBase, payrunOffset), [currentPayrunBase, payrunOffset])
  const previousPayrun = useMemo(() => getPayrunByOffset(selectedPayrun, -1), [selectedPayrun])

  const getSaleStockCount = (sale: Sale) => {
    const metaMatch = sale.notes?.match(/\[\[sale_meta:(.*?)\]\]/s)
    if (!metaMatch) return number(sale.quantity || 1)

    try {
      const meta = JSON.parse(metaMatch[1]) as {
        collectionQuantity?: number
        trackedCardIds?: string[]
        sealedAllocations?: { sealedId: string; quantity: number }[]
      }
      const sealedCount = (meta.sealedAllocations || []).reduce((sum, allocation) => {
        const batch = sealedBatches.find((item) => item.id === allocation.sealedId)
        return batch && !isGiveawayBatch(batch) ? sum + number(allocation.quantity) : sum
      }, 0)

      return number(meta.collectionQuantity) + (meta.trackedCardIds || []).length + sealedCount
    } catch {
      return number(sale.quantity || 1)
    }
  }

  const summariseSales = (rows: Sale[]) => ({
    count: rows.reduce((sum, sale) => sum + getSaleStockCount(sale), 0),
    transactions: rows.length,
    gross: rows.reduce((sum, sale) => sum + number(sale.sale_price), 0),
    net: rows.reduce((sum, sale) => sum + number(sale.net_sale), 0),
    cost: rows.reduce((sum, sale) => sum + number(sale.cost_basis), 0),
    postage: rows.reduce((sum, sale) => sum + number(sale.postage), 0),
    profit: rows.reduce((sum, sale) => sum + number(sale.profit), 0),
  })

  const payrunSales = sales.filter((sale) => sale.sold_date >= selectedPayrun.start && sale.sold_date <= selectedPayrun.end)
  const previousPayrunSales = sales.filter((sale) => sale.sold_date >= previousPayrun.start && sale.sold_date <= previousPayrun.end)
  const payrunTotals = summariseSales(payrunSales)
  const previousPayrunTotals = summariseSales(previousPayrunSales)
  const payrunChange = previousPayrunTotals.profit ? ((payrunTotals.profit - previousPayrunTotals.profit) / Math.abs(previousPayrunTotals.profit)) * 100 : 0

  const salesByDate = useMemo(() => {
    const map = new Map<string, Sale[]>()
    sales.forEach((sale) => map.set(sale.sold_date, [...(map.get(sale.sold_date) || []), sale]))
    return map
  }, [sales])

  const calendarDays = useMemo(() => getCalendarDays(selectedYear, selectedMonth), [selectedYear, selectedMonth])
  const selectedDaySales = salesByDate.get(selectedDate) || []
  const selectedDayTotals = summariseSales(selectedDaySales)

  const salesDayAverages = useMemo(() => {
    const grouped = new Map<string, { days: Set<string>; cards: number; profit: number; net: number }>()
    sales.forEach((sale) => {
      const day = parseDate(sale.sold_date).toLocaleDateString('en-GB', { weekday: 'long' })
      const current = grouped.get(day) || { days: new Set<string>(), cards: 0, profit: 0, net: 0 }
      current.days.add(sale.sold_date)
      current.cards += getSaleStockCount(sale)
      current.profit += number(sale.profit)
      current.net += number(sale.net_sale)
      grouped.set(day, current)
    })
    const order = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
    return order.filter((day) => grouped.has(day)).map((day) => {
      const item = grouped.get(day)!
      const count = item.days.size
      return { day, count, cards: item.cards / count, profit: item.profit / count, net: item.net / count }
    })
  }, [sales])

  const platformTotals = useMemo(() => (['ebay', 'streaming', 'website'] as const).map((platform) => {
    const rows = sales.filter((sale) => sale.platform === platform)
    return { platform, ...summariseSales(rows) }
  }), [sales])

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase()
    return activeCards.filter((card) => {
      const matchesSearch = !query || [card.card_name, card.set_name, card.card_number, card.collections?.name]
        .some((value) => String(value || '').toLowerCase().includes(query))
      return matchesSearch && (statusFilter === 'all' || card.status === statusFilter)
    })
  }, [activeCards, search, statusFilter])

  const assignedTotal = draftCards.reduce((sum, card) => sum + number(card.allocated_cost), 0)
  const remainingPoolCost = Math.max(0, number(totalPaid) - assignedTotal)
  const calculatedPoolUnitCost = number(poolQuantity) > 0 ? remainingPoolCost / number(poolQuantity) : 0

  function updateDraftCard(index: number, field: keyof DraftCard, value: string) {
    setDraftCards((current) => current.map((card, cardIndex) => cardIndex === index ? { ...card, [field]: value } : card))
  }

  async function saveCollection() {
    const cleanCards = draftCards.filter((card) => card.card_name.trim())
    const paid = number(totalPaid)
    const quantity = number(poolQuantity)
    const individualCost = cleanCards.reduce((sum, card) => sum + number(card.allocated_cost), 0)
    const poolCost = paid - individualCost

    if (!collectionName.trim() || !purchaseDate || paid < 0) return setMessage('Enter a collection name, purchase date and total paid.')
    if (individualCost > paid) return setMessage('Tracked-card costs cannot exceed the collection total.')
    if (poolCost > 0 && quantity <= 0) return setMessage('Enter the total collection card quantity receiving the remaining cost.')

    setMessage('Saving collection...')
    const { data: collection, error: collectionError } = await supabase.from('singles_collections').insert({
      name: collectionName.trim(), supplier: supplier.trim() || null, purchase_date: purchaseDate,
      total_paid: paid, notes: collectionNotes.trim() || null,
    }).select('id').single()
    if (collectionError || !collection) return setMessage(collectionError?.message || 'Collection could not be created.')

    if (cleanCards.length) {
      const { error } = await supabase.from('singles_inventory_cards').insert(cleanCards.map((card) => ({
        collection_id: collection.id, card_name: card.card_name.trim(), set_name: card.set_name.trim() || null,
        card_number: card.card_number.trim() || null, condition: card.condition || 'NM', allocated_cost: number(card.allocated_cost),
        platform: card.platform, listed_price: card.listed_price ? number(card.listed_price) : null,
        status: card.platform === 'unlisted' ? 'available' : 'listed', notes: card.notes.trim() || null,
      })))
      if (error) return setMessage(`Collection created, but tracked cards failed: ${error.message}`)
    }

    if (quantity > 0) {
      const { error } = await supabase.from('singles_pool_lots').insert({
        collection_id: collection.id, quantity_bought: quantity, quantity_remaining: quantity,
        allocated_cost: poolCost, unit_cost: quantity ? poolCost / quantity : 0,
      })
      if (error) return setMessage(`Collection created, but collection inventory failed: ${error.message}`)
    }

    setCollectionName(''); setSupplier(''); setPurchaseDate(todayKey()); setTotalPaid(''); setPoolQuantity('')
    setCollectionNotes(''); setDraftCards([blankDraftCard()]); setMessage('Collection saved'); loadData()
  }

  async function promoteCollectionCard() {
    const cardCost = number(promoteCard.allocated_cost)
    if (!promoteCard.card_name.trim()) return setMessage('Enter the card name.')
    if (cardCost <= 0) return setMessage('Enter the exact amount allocated to this card.')
    if (collectionRemainingQuantity < 1) return setMessage('There are no collection cards remaining to move into tracked inventory.')
    if (cardCost > collectionInventoryValue + 0.0001) {
      return setMessage(`Only ${money(collectionInventoryValue)} remains in Collection Inventory.`)
    }

    const fifoLots = [...poolLots]
      .filter((lot) => number(lot.quantity_remaining) > 0)
      .sort((a, b) => {
        const aDate = a.collections?.purchase_date || ''
        const bDate = b.collections?.purchase_date || ''
        return aDate.localeCompare(bDate)
      })

    const sourceLot = fifoLots[0]
    if (!sourceLot) return setMessage('No collection inventory batch could be found.')

    // Remove exactly one card and rebalance the remaining batches so the
    // combined inventory value falls by the exact cost entered.
    const targetBookValue = collectionInventoryValue - cardCost
    const remainingQuantityAfter = collectionRemainingQuantity - 1
    if (remainingQuantityAfter === 0 && Math.abs(targetBookValue) > 0.0001) {
      return setMessage(`This is the final collection card, so its cost must be ${money(collectionInventoryValue)}.`)
    }

    const baseBookValueAfterQuantityChange = fifoLots.reduce((sum, lot) => {
      const quantity = lot.id === sourceLot.id
        ? number(lot.quantity_remaining) - 1
        : number(lot.quantity_remaining)
      return sum + Math.max(0, quantity) * number(lot.unit_cost)
    }, 0)
    const scale = baseBookValueAfterQuantityChange > 0
      ? targetBookValue / baseBookValueAfterQuantityChange
      : 0

    const updates: { id: string; oldQuantity: number; oldUnitCost: number; quantity: number; unitCost: number }[] = fifoLots.map((lot) => {
      const oldQuantity = number(lot.quantity_remaining)
      const oldUnitCost = number(lot.unit_cost)
      const quantity = lot.id === sourceLot.id ? oldQuantity - 1 : oldQuantity
      return {
        id: lot.id,
        oldQuantity,
        oldUnitCost,
        quantity,
        unitCost: quantity > 0 ? oldUnitCost * scale : 0,
      }
    }).filter((update) => update.id === sourceLot.id || Math.abs(update.unitCost - update.oldUnitCost) > 0.000001)

    setMessage('Moving card into tracked inventory...')
    const applied: typeof updates = []
    for (const update of updates) {
      const { error } = await supabase.from('singles_pool_lots').update({
        quantity_remaining: update.quantity,
        unit_cost: update.unitCost,
      }).eq('id', update.id)
      if (error) {
        for (const rollback of applied.reverse()) {
          await supabase.from('singles_pool_lots').update({
            quantity_remaining: rollback.oldQuantity,
            unit_cost: rollback.oldUnitCost,
          }).eq('id', rollback.id)
        }
        return setMessage(error.message)
      }
      applied.push(update)
    }

    const { error: cardError } = await supabase.from('singles_inventory_cards').insert({
      collection_id: sourceLot.collection_id,
      card_name: promoteCard.card_name.trim(),
      set_name: promoteCard.set_name.trim() || null,
      card_number: promoteCard.card_number.trim() || null,
      condition: promoteCard.condition || 'NM',
      allocated_cost: cardCost,
      platform: promoteCard.platform,
      listed_price: promoteCard.listed_price ? number(promoteCard.listed_price) : null,
      status: promoteCard.platform === 'unlisted' ? 'available' : 'listed',
      notes: [promoteCard.notes.trim(), 'Moved from Collection Inventory'].filter(Boolean).join(' · ') || null,
    })

    if (cardError) {
      for (const rollback of applied.reverse()) {
        await supabase.from('singles_pool_lots').update({
          quantity_remaining: rollback.oldQuantity,
          unit_cost: rollback.oldUnitCost,
        }).eq('id', rollback.id)
      }
      return setMessage(cardError.message)
    }

    setPromoteCard(blankDraftCard())
    setShowPromoteCard(false)
    setMessage(`${promoteCard.card_name.trim()} moved into tracked inventory. Collection Inventory reduced by 1 card and ${money(cardCost)}.`)
    loadData()
  }

  async function saveSealedPurchase() {
    const quantity = number(sealedQuantity)
    const cost = number(sealedCost)
    if (!sealedName.trim() || !sealedDate || quantity <= 0 || cost < 0) {
      return setMessage('Enter a product name, purchase date, quantity and total cost.')
    }
    const { error } = await supabase.from('singles_sealed_batches').insert({
      product_name: sealedName.trim(), product_type: sealedType, supplier: sealedSupplier.trim() || null,
      purchase_date: sealedDate, quantity_bought: quantity, quantity_remaining: quantity,
      total_cost: cost, unit_cost: quantity ? cost / quantity : 0, notes: sealedNotes.trim() || null,
    })
    if (error) return setMessage(error.message)
    setSealedName(''); setSealedType('Packs'); setSealedSupplier(''); setSealedDate(todayKey())
    setSealedQuantity(''); setSealedCost(''); setSealedNotes(''); setMessage('Sealed product saved'); loadData()
  }

  async function deleteSealedPurchase(batch: SealedBatch) {
    if (number(batch.quantity_remaining) !== number(batch.quantity_bought)) {
      return setMessage('This sealed purchase has already been used, so it cannot be deleted safely.')
    }
    if (!window.confirm(`Delete ${batch.product_name}?`)) return
    const { error } = await supabase.from('singles_sealed_batches').delete().eq('id', batch.id)
    if (error) return setMessage(error.message)
    setMessage('Sealed purchase deleted'); loadData()
  }

  async function deleteCollection(collection: Collection) {
    const linkedCards = cards.filter((card) => card.collection_id === collection.id)
    const linkedPoolLot = poolLots.find((lot) => lot.collection_id === collection.id)
    const linkedSales = sales.filter((sale) => sale.collection_id === collection.id)
    const hasSoldCard = linkedCards.some((card) => card.status === 'sold')
    const poolHasBeenUsed = linkedPoolLot
      ? number(linkedPoolLot.quantity_remaining) !== number(linkedPoolLot.quantity_bought)
      : false

    if (linkedSales.length > 0 || hasSoldCard || poolHasBeenUsed) {
      setMessage('This collection already has sales or used collection inventory, so it cannot be deleted safely.')
      return
    }

    const confirmed = window.confirm(
      `Delete ${collection.name}? This will also remove its tracked cards and collection inventory.`
    )

    if (!confirmed) return

    setMessage('Deleting collection...')

    if (linkedCards.length > 0) {
      const { error: cardsError } = await supabase
        .from('singles_inventory_cards')
        .delete()
        .eq('collection_id', collection.id)

      if (cardsError) {
        setMessage(cardsError.message)
        return
      }
    }

    const { error: collectionError } = await supabase
      .from('singles_collections')
      .delete()
      .eq('id', collection.id)

    if (collectionError) {
      setMessage(collectionError.message)
      return
    }

    setMessage('Collection deleted')
    loadData()
  }

  async function saveCardEdit() {
    if (!editCard?.card_name.trim()) return
    const { error } = await supabase.from('singles_inventory_cards').update({
      card_name: editCard.card_name.trim(), set_name: editCard.set_name?.trim() || null,
      card_number: editCard.card_number?.trim() || null, condition: editCard.condition,
      allocated_cost: number(editCard.allocated_cost), platform: editCard.platform,
      listed_price: editCard.listed_price == null ? null : number(editCard.listed_price),
      status: editCard.status, notes: editCard.notes?.trim() || null,
    }).eq('id', editCard.id)
    if (error) return setMessage(error.message)
    setEditCard(null); setMessage('Card updated'); loadData()
  }


  async function deleteTrackedCard(card: InventoryCard) {
    if (card.status === 'sold') {
      return setMessage('Sold cards cannot be deleted from tracked inventory. Delete the sale first.')
    }

    const { data: linkedSales, error: salesError } = await supabase
      .from('singles_sales')
      .select('id')
      .eq('inventory_card_id', card.id)
      .limit(1)

    if (salesError) return setMessage(salesError.message)
    if ((linkedSales || []).length > 0) {
      return setMessage('This card is linked to a sale. Delete the sale first.')
    }

    const cardCost = number(card.allocated_cost)
    const confirmed = window.confirm(
      `Delete ${card.card_name}? This will return 1 card and ${money(cardCost)} to Collection Inventory.`
    )
    if (!confirmed) return

    setMessage('Returning card to Collection Inventory...')

    let restoredLot: {
      id: string
      quantity_bought: number
      quantity_remaining: number
      allocated_cost: number
      unit_cost: number
    } | null = null
    let createdLotId: string | null = null

    if (card.collection_id) {
      const sourceLot = poolLots.find((lot) => lot.collection_id === card.collection_id)

      if (sourceLot) {
        restoredLot = {
          id: sourceLot.id,
          quantity_bought: number(sourceLot.quantity_bought),
          quantity_remaining: number(sourceLot.quantity_remaining),
          allocated_cost: number(sourceLot.allocated_cost),
          unit_cost: number(sourceLot.unit_cost),
        }

        const wasMovedFromPool = String(card.notes || '').includes('Moved from Collection Inventory')
        const nextQuantityRemaining = restoredLot.quantity_remaining + 1
        const nextQuantityBought = restoredLot.quantity_bought + (wasMovedFromPool ? 0 : 1)
        const nextBookValue = restoredLot.quantity_remaining * restoredLot.unit_cost + cardCost
        const nextUnitCost = nextQuantityRemaining > 0 ? nextBookValue / nextQuantityRemaining : 0

        const { error: restoreError } = await supabase
          .from('singles_pool_lots')
          .update({
            quantity_bought: nextQuantityBought,
            quantity_remaining: nextQuantityRemaining,
            allocated_cost: restoredLot.allocated_cost + cardCost,
            unit_cost: nextUnitCost,
          })
          .eq('id', sourceLot.id)

        if (restoreError) return setMessage(restoreError.message)
      } else {
        const { data: createdLot, error: createLotError } = await supabase
          .from('singles_pool_lots')
          .insert({
            collection_id: card.collection_id,
            quantity_bought: 1,
            quantity_remaining: 1,
            allocated_cost: cardCost,
            unit_cost: cardCost,
          })
          .select('id')
          .single()

        if (createLotError || !createdLot) {
          return setMessage(createLotError?.message || 'Collection Inventory could not be restored.')
        }
        createdLotId = String(createdLot.id)
      }
    }

    const { error: deleteError } = await supabase
      .from('singles_inventory_cards')
      .delete()
      .eq('id', card.id)

    if (deleteError) {
      if (createdLotId) {
        await supabase.from('singles_pool_lots').delete().eq('id', createdLotId)
      } else if (restoredLot) {
        await supabase.from('singles_pool_lots').update({
          quantity_bought: restoredLot.quantity_bought,
          quantity_remaining: restoredLot.quantity_remaining,
          allocated_cost: restoredLot.allocated_cost,
          unit_cost: restoredLot.unit_cost,
        }).eq('id', restoredLot.id)
      }
      return setMessage(deleteError.message)
    }

    setMessage(
      card.collection_id
        ? `${card.card_name} deleted. 1 card and ${money(cardCost)} returned to Collection Inventory.`
        : `${card.card_name} deleted. It was not linked to a collection, so no pool quantity was restored.`
    )
    loadData()
  }

  function resetSaleForm() {
    setSaleCardId(''); setStreamingItems([{ kind: 'collection', card_id: '', sealed_id: '', quantity: '' }]); setSaleQuantity('0'); setGrossSale(''); setNetSale('')
    setSalePostage(''); setSaleNotes(''); setSaleDate(todayKey())
  }

  function openTrackedSale(card: InventoryCard) {
    const listed = card.listed_price == null ? '' : String(card.listed_price)
    setSaleMode('tracked')
    setSaleCardId(card.id)
    setSalePlatform(card.platform === 'unlisted' ? 'streaming' : card.platform)
    setGrossSale(listed)
    setNetSale(listed)
    setSalePostage('')
    setSaleNotes('')
    setSaleDate(todayKey())
    setTab('sales')
  }

  function updateStreamingItem(index: number, field: keyof StreamingSaleItem, value: string) {
    setStreamingItems((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item
    ))
  }

  function addStreamingItem() {
    setStreamingItems((current) => [...current, { kind: 'collection', card_id: '', sealed_id: '', quantity: '' }])
  }

  function removeStreamingItem(index: number) {
    setStreamingItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  async function saveStreamingSale() {
    const gross = number(grossSale)
    const net = number(netSale)
    const postage = number(salePostage)

    const collectionQuantity = streamingItems
      .filter((item) => item.kind === 'collection')
      .reduce((sum, item) => sum + number(item.quantity), 0)

    const trackedCardIds = Array.from(new Set(
      streamingItems.filter((item) => item.kind === 'tracked' && item.card_id).map((item) => item.card_id)
    ))
    const sealedRows = streamingItems
      .filter((item) => item.kind === 'sealed' && item.sealed_id && number(item.quantity) > 0)
      .map((item) => ({ sealed_id: item.sealed_id, quantity: number(item.quantity) }))
    const selectedCards = activeCards.filter((card) => trackedCardIds.includes(card.id))
    const totalCollectionRemaining = poolLots.reduce((sum, lot) => sum + number(lot.quantity_remaining), 0)

    if (!saleDate || gross < 0 || net < 0) return setMessage('Enter the sale date, gross sales and net sales.')
    if (net > gross) return setMessage('Net sales cannot be higher than gross sales.')
    if (collectionQuantity <= 0 && selectedCards.length === 0 && sealedRows.length === 0) {
      return setMessage('Add at least one collection quantity, sealed product or tracked card.')
    }
    if (collectionQuantity > totalCollectionRemaining) {
      return setMessage(`Only ${totalCollectionRemaining} collection cards remain.`)
    }
    if (trackedCardIds.length !== selectedCards.length) {
      return setMessage('One of the selected tracked cards is no longer available.')
    }

    let quantityNeeded = collectionQuantity
    let collectionCost = 0
    const lotAllocations: { lotId: string; quantity: number }[] = []
    const fifoLots = [...poolLots]
      .filter((lot) => number(lot.quantity_remaining) > 0)
      .sort((a, b) => {
        const aDate = a.collections?.purchase_date || ''
        const bDate = b.collections?.purchase_date || ''
        return aDate.localeCompare(bDate)
      })

    for (const lot of fifoLots) {
      if (quantityNeeded <= 0) break
      const used = Math.min(number(lot.quantity_remaining), quantityNeeded)
      if (used <= 0) continue
      lotAllocations.push({ lotId: lot.id, quantity: used })
      collectionCost += used * number(lot.unit_cost)
      quantityNeeded -= used
    }

    if (quantityNeeded > 0) return setMessage('Not enough collection inventory remains.')

    let sealedCostTotal = 0
    const sealedAllocations: { sealedId: string; quantity: number }[] = []
    for (const row of sealedRows) {
      const batch = sealedBatches.find((item) => item.id === row.sealed_id)
      if (!batch) return setMessage('One of the selected sealed products no longer exists.')
      if (row.quantity > number(batch.quantity_remaining)) {
        return setMessage(`Only ${batch.quantity_remaining} ${batch.product_name} remain.`)
      }
      sealedCostTotal += row.quantity * number(batch.unit_cost)
      sealedAllocations.push({ sealedId: batch.id, quantity: row.quantity })
    }

    const trackedCost = selectedCards.reduce((sum, card) => sum + number(card.allocated_cost), 0)
    const totalCost = collectionCost + trackedCost + sealedCostTotal
    const totalQuantity = collectionQuantity + selectedCards.length + sealedRows.reduce((sum, row) => sum + row.quantity, 0)
    const profit = net - postage - totalCost
    const parts = [
      collectionQuantity > 0 ? `${collectionQuantity} collection card${collectionQuantity === 1 ? '' : 's'}` : '',
      ...sealedRows.map((row) => { const batch = sealedBatches.find((item) => item.id === row.sealed_id); return batch ? `${row.quantity} × ${batch.product_name}` : '' }),
      ...selectedCards.map((card) => card.card_name),
    ].filter(Boolean)
    const meta = JSON.stringify({
      collectionQuantity,
      lotAllocations,
      trackedCardIds: selectedCards.map((card) => card.id),
      sealedAllocations,
    })
    const notes = `${saleNotes.trim()}${saleNotes.trim() ? '\n' : ''}[[sale_meta:${meta}]]`

    const { error } = await supabase.from('singles_sales').insert({
      inventory_card_id: selectedCards.length === 1 && collectionQuantity === 0 ? selectedCards[0].id : null,
      collection_id: null,
      sale_type: collectionQuantity > 0 ? 'pool' : 'individual',
      description: parts.join(' + '),
      platform: 'streaming',
      quantity: totalQuantity,
      sale_price: gross,
      net_sale: net,
      fees: Math.max(0, gross - net),
      postage,
      cost_basis: totalCost,
      profit,
      sold_date: saleDate,
      notes,
    })
    if (error) return setMessage(error.message)

    if (selectedCards.length > 0) {
      const { error: cardsError } = await supabase
        .from('singles_inventory_cards')
        .update({ status: 'sold', platform: 'streaming' })
        .in('id', selectedCards.map((card) => card.id))
      if (cardsError) return setMessage(cardsError.message)
    }

    for (const allocation of lotAllocations) {
      const lot = poolLots.find((item) => item.id === allocation.lotId)
      if (!lot) continue
      const { error: lotError } = await supabase
        .from('singles_pool_lots')
        .update({ quantity_remaining: number(lot.quantity_remaining) - allocation.quantity })
        .eq('id', lot.id)
      if (lotError) return setMessage(lotError.message)
    }

    for (const allocation of sealedAllocations) {
      const batch = sealedBatches.find((item) => item.id === allocation.sealedId)
      if (!batch) continue
      const { error: sealedError } = await supabase.from('singles_sealed_batches')
        .update({ quantity_remaining: number(batch.quantity_remaining) - allocation.quantity })
        .eq('id', batch.id)
      if (sealedError) return setMessage(sealedError.message)
    }

    resetSaleForm(); setMessage('Streaming sale recorded'); loadData()
  }

  async function saveTrackedSale() {
    const card = activeCards.find((item) => item.id === saleCardId)
    const gross = number(grossSale)
    const net = number(netSale)
    const postage = number(salePostage)

    if (!card) return setMessage('Choose the tracked card that sold.')
    if (!saleDate || gross < 0 || net < 0) return setMessage('Enter the sale date, gross sales and net sales.')
    if (net > gross) return setMessage('Net sales cannot be higher than gross sales.')

    const cost = number(card.allocated_cost)
    const profit = net - postage - cost
    const { error } = await supabase.from('singles_sales').insert({
      inventory_card_id: card.id,
      collection_id: card.collection_id,
      sale_type: 'individual',
      description: card.card_name,
      platform: salePlatform,
      quantity: 1,
      sale_price: gross,
      net_sale: net,
      fees: Math.max(0, gross - net),
      postage,
      cost_basis: cost,
      profit,
      sold_date: saleDate,
      notes: saleNotes.trim() || null,
    })
    if (error) return setMessage(error.message)

    const { error: cardError } = await supabase
      .from('singles_inventory_cards')
      .update({ status: 'sold', platform: salePlatform })
      .eq('id', card.id)
    if (cardError) return setMessage(cardError.message)

    resetSaleForm(); setMessage('Tracked card sale recorded'); loadData()
  }

  async function deleteSale(sale: Sale) {
    if (!window.confirm('Delete this sale and restore its stock?')) return

    const marker = sale.notes?.match(/\[\[sale_meta:(\{.*\})\]\]/)
    let trackedCardIds: string[] = sale.inventory_card_id ? [sale.inventory_card_id] : []
    let lotAllocations: { lotId: string; quantity: number }[] = []
    let sealedAllocations: { sealedId: string; quantity: number }[] = []

    if (marker) {
      try {
        const meta = JSON.parse(marker[1])
        trackedCardIds = Array.isArray(meta.trackedCardIds) ? meta.trackedCardIds : trackedCardIds
        lotAllocations = Array.isArray(meta.lotAllocations) ? meta.lotAllocations : []
        sealedAllocations = Array.isArray(meta.sealedAllocations) ? meta.sealedAllocations : []
      } catch {}
    }

    if (trackedCardIds.length > 0) {
      await supabase.from('singles_inventory_cards').update({ status: 'available' }).in('id', trackedCardIds)
    }

    for (const allocation of lotAllocations) {
      const lot = poolLots.find((item) => item.id === allocation.lotId)
      if (!lot) continue
      await supabase.from('singles_pool_lots').update({
        quantity_remaining: number(lot.quantity_remaining) + number(allocation.quantity),
      }).eq('id', lot.id)
    }

    for (const allocation of sealedAllocations) {
      const batch = sealedBatches.find((item) => item.id === allocation.sealedId)
      if (!batch) continue
      await supabase.from('singles_sealed_batches').update({
        quantity_remaining: number(batch.quantity_remaining) + number(allocation.quantity),
      }).eq('id', batch.id)
    }

    const { error } = await supabase.from('singles_sales').delete().eq('id', sale.id)
    if (error) return setMessage(error.message)
    setMessage('Sale deleted and stock restored'); loadData()
  }

  function changeMonth(amount: number) {
    const next = new Date(selectedYear, selectedMonth + amount, 1)
    setSelectedYear(next.getFullYear()); setSelectedMonth(next.getMonth())
  }

  function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>
  }

  function SaleTable({ rows }: { rows: Sale[] }) {
    return <div className="table-list">
      <div className="table-head"><span>Sale</span><span>Platform</span><span>Gross</span><span>Net</span><span>Date</span><span></span></div>
      {rows.length === 0 ? <div className="empty">No sales recorded.</div> : rows.map((sale) => <div className="sale-row" key={sale.id}>
        <div><strong>{sale.description}</strong><small>{sale.sale_type === 'pool' ? `${sale.quantity} collection cards · ${sale.collections?.name || 'Collection'}` : [sale.inventory_cards?.set_name, sale.inventory_cards?.card_number].filter(Boolean).join(' · ') || 'Tracked card'}</small></div>
        <div><span className="pill">{platformLabels[sale.platform]}</span></div>
        <div><small>Gross</small><strong>{money(sale.sale_price)}</strong></div>
        <div><small>Net</small><strong>{money(sale.net_sale)}</strong></div>
        <div>{shortDate(sale.sold_date)}</div>
        <div><button className="mini danger" onClick={() => deleteSale(sale)}>Delete</button></div>
      </div>)}
    </div>
  }

  function PlatformTab({ platform }: { platform: Exclude<Platform, 'unlisted'> }) {
    const active = activeCards.filter((card) => card.platform === platform)
    const sold = sales.filter((sale) => sale.platform === platform)
    return <>
      <section className="panel slim"><div className="panel-head"><div><h2>{platformLabels[platform]}</h2><p>Active listings and completed sales.</p></div><div className="segmented"><button className={platformView === 'active' ? 'selected' : ''} onClick={() => setPlatformView('active')}>Active</button><button className={platformView === 'sold' ? 'selected' : ''} onClick={() => setPlatformView('sold')}>Sold</button></div></div></section>
      {platformView === 'active' ? <CardRows rows={active} /> : <SaleTable rows={sold} />}
    </>
  }

  function CardRows({ rows }: { rows: InventoryCard[] }) {
    return <section className="panel"><div className="card-table-head"><span>Card</span><span>Collection</span><span>Cost</span><span>Platform</span><span>Listed</span><span>Status</span><span>Actions</span></div>
      {rows.length === 0 ? <div className="empty">No tracked cards here.</div> : rows.map((card) => <div className="card-row" key={card.id}>
        <div className="card-main"><strong>{card.card_name}</strong><small>{[card.set_name, card.card_number, card.condition].filter(Boolean).join(' · ')}</small></div>
        <div><small>Collection</small><span>{card.collections?.name || 'Manual add'}</span></div>
        <div><small>Cost</small><strong>{money(card.allocated_cost)}</strong></div>
        <div><span className="pill">{platformLabels[card.platform]}</span></div>
        <div><small>Listed</small><strong>{card.listed_price == null ? '—' : money(card.listed_price)}</strong></div>
        <div><span className={`status-pill ${card.status}`}>{card.status}</span></div>
        <div className="row-actions"><button className="action edit" onClick={() => setEditCard(card)}>Edit</button><button className="action sold" onClick={() => openTrackedSale(card)}>Mark Sold</button><button className="action danger" onClick={() => deleteTrackedCard(card)}>Delete</button></div>
      </div>)}
    </section>
  }

  return <AdminGuard><main className="page"><style jsx global>{`
    .page{min-height:100vh;background:radial-gradient(circle at top,#15157a 0%,#06063d 45%,#02021f 100%);color:white;padding:24px}.wrap{max-width:1280px;margin:0 auto}h1{margin:0;font-size:clamp(2rem,5vw,3.4rem);font-weight:950;letter-spacing:-1px}h2{margin:0;font-size:1.3rem;font-weight:950}p{margin:7px 0 0;color:rgba(255,255,255,.68);font-weight:750}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}.eyebrow{color:#fde68a;font-size:.75rem;letter-spacing:1.5px;text-transform:uppercase;font-weight:950;margin-bottom:7px}.button,.tab,.action,.mini{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:white;border-radius:999px;font-weight:900;cursor:pointer;text-decoration:none}.button{padding:11px 15px}.button.primary{background:linear-gradient(135deg,#7c3aed,#c084fc);border-color:rgba(216,180,254,.65)}.tabs{display:flex;gap:9px;flex-wrap:wrap;margin:18px 0}.tab{padding:11px 15px}.tab.active{background:linear-gradient(135deg,#7c3aed,#c084fc);border-color:rgba(216,180,254,.68)}.panel{border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.045));border-radius:22px;padding:18px;margin-bottom:16px;box-shadow:0 18px 56px rgba(0,0,0,.28)}.panel.slim{padding:16px 20px}.panel>.card-row:first-of-type,.panel>.sale-row:first-of-type{margin-top:0}.panel-head{display:flex;justify-content:space-between;gap:16px;align-items:center}.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stat-card{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);border-radius:18px;padding:16px}.stat-label{text-transform:uppercase;letter-spacing:.8px;font-size:.7rem;font-weight:950;color:rgba(255,255,255,.62)}.stat-value{font-size:1.35rem;font-weight:950;margin-top:7px}.stat-sub{font-size:.78rem;color:rgba(255,255,255,.62);margin-top:5px;font-weight:750}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:7px}.field label{font-size:.72rem;text-transform:uppercase;letter-spacing:.7px;font-weight:950;color:rgba(255,255,255,.68)}.input,.select,.textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);background:#0c0c43;color:white;border-radius:14px;padding:12px 13px;font-weight:800}.textarea{min-height:88px;resize:vertical}.span-2{grid-column:span 2}.span-4{grid-column:span 4}.message{margin:0 0 16px;border:1px solid rgba(250,204,21,.28);background:rgba(250,204,21,.1);color:#fde68a;border-radius:14px;padding:12px 14px;font-weight:850}.card-table-head,.card-row{display:grid;grid-template-columns:minmax(220px,1.7fr) minmax(140px,1.15fr) 100px 120px 110px 110px minmax(280px,1.55fr);gap:12px;align-items:center}.card-table-head,.table-head{padding:0 14px 10px;color:rgba(255,255,255,.58);font-size:.7rem;text-transform:uppercase;font-weight:950;letter-spacing:1px}.card-row{padding:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:16px;margin-top:8px;transition:transform .15s ease,border-color .15s ease,background .15s ease}.card-row:hover{transform:translateY(-1px);border-color:rgba(192,132,252,.34);background:rgba(124,58,237,.08)}.card-row small,.sale-row small{display:block;color:rgba(255,255,255,.58);font-size:.75rem;font-weight:750;margin-bottom:3px}.card-row strong,.card-row span{display:block}.card-main strong{font-size:1rem}.pill,.status-pill{display:inline-flex!important;width:max-content;padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);font-size:.76rem;font-weight:900;text-transform:capitalize}.status-pill.listed{color:#bfdbfe}.status-pill.reserved{color:#fde68a}.row-actions{display:flex;gap:8px}.action{padding:11px 15px;border-radius:12px;min-width:78px;text-align:center}.action.edit{background:rgba(59,130,246,.18);border-color:rgba(96,165,250,.35)}.action.sold{background:linear-gradient(135deg,#7c3aed,#a855f7);border-color:rgba(216,180,254,.4)}.table-head,.sale-row{display:grid;grid-template-columns:minmax(260px,1.8fr) 110px 110px 110px 130px 80px;gap:12px;align-items:center}.sale-row{padding:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:16px;margin-top:8px}.profit{color:#86efac}.loss{color:#fca5a5}.mini{padding:7px 10px}.danger{background:rgba(239,68,68,.14);border-color:rgba(248,113,113,.35)}.empty{padding:28px;text-align:center;color:rgba(255,255,255,.58);font-weight:800}.segmented{display:flex;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:3px}.segmented button{border:0;background:transparent;color:white;padding:8px 13px;border-radius:999px;font-weight:900;cursor:pointer}.segmented button.selected{background:#7c3aed}.purchase-card{border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:15px;background:rgba(255,255,255,.04);margin-top:10px}.draft-row{display:grid;grid-template-columns:1.3fr 1fr .7fr .6fr .7fr .8fr .8fr auto;gap:8px;margin-top:10px}.summary-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.summary-item{border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px}.summary-item small{display:block;color:rgba(255,255,255,.58);font-weight:800}.summary-item strong{display:block;margin-top:5px}.calendar-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:7px}.weekday{text-align:center;color:rgba(255,255,255,.54);font-size:.7rem;font-weight:950;padding:6px}.day{min-height:142px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.035);border-radius:14px;padding:10px;color:white;text-align:left;cursor:pointer}.day.out{opacity:.34}.day.selected{border-color:#c084fc;background:rgba(124,58,237,.2)}.day-number{font-size:.92rem;font-weight:950;margin-bottom:10px}.day-metric{font-size:.68rem;line-height:1.45;color:rgba(255,255,255,.9);font-weight:850;margin-top:4px}.day-profit-line{font-size:.72rem;line-height:1.45;color:#86efac;font-weight:950;margin-top:4px}.day-profit-line.loss{color:#fca5a5}.day-streams{font-size:.65rem;line-height:1.45;color:rgba(255,255,255,.58);font-weight:850;margin-top:4px}.stream-picker{position:relative}.stream-picker-button{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;border:1px solid rgba(255,255,255,.16);background:#0c0c43;color:white;border-radius:14px;padding:12px 13px;font-weight:850;cursor:pointer}.stream-picker-menu{display:none;position:absolute;z-index:40;top:calc(100% + 6px);left:0;width:240px;border:1px solid rgba(255,255,255,.18);background:#09093e;border-radius:14px;padding:6px;box-shadow:0 20px 50px rgba(0,0,0,.45)}.stream-picker:hover .stream-picker-menu,.stream-picker:focus-within .stream-picker-menu{display:block}.picker-category{position:relative}.picker-category-button,.picker-option{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;background:transparent;color:white;border-radius:10px;padding:10px 11px;text-align:left;font-weight:850;cursor:pointer}.picker-category-button:hover,.picker-option:hover{background:rgba(124,58,237,.2)}.picker-submenu{display:none;position:absolute;z-index:41;left:calc(100% + 7px);top:-6px;width:380px;max-height:330px;overflow:auto;border:1px solid rgba(255,255,255,.18);background:#09093e;border-radius:14px;padding:7px;box-shadow:0 20px 50px rgba(0,0,0,.45)}.picker-category:hover>.picker-submenu,.picker-category:focus-within>.picker-submenu{display:block}.picker-search{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);background:#101052;color:white;border-radius:10px;padding:10px 11px;font-weight:800;margin-bottom:6px}.picker-empty{padding:12px;color:rgba(255,255,255,.56);font-size:.76rem;font-weight:800}.picker-option small{color:rgba(255,255,255,.55);font-weight:750}.picker-selected{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.payrun-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:15px}.payrun-nav{display:flex;gap:8px}.platform-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.inventory-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.inventory-card{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);border-radius:18px;padding:16px}.inventory-card small{display:block;color:rgba(255,255,255,.58);font-weight:900;text-transform:uppercase;letter-spacing:.7px}.inventory-card strong{display:block;font-size:1.25rem;margin-top:7px}.inventory-card span{display:block;color:rgba(255,255,255,.64);font-size:.78rem;font-weight:750;margin-top:5px}.platform-card{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);border-radius:18px;padding:16px}.platform-card h3{margin:0 0 10px}.platform-card strong{display:block;font-size:1.25rem}.platform-card small{display:block;color:rgba(255,255,255,.58);margin-top:4px}.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:18px;z-index:20}.modal{width:min(760px,100%);max-height:90vh;overflow:auto;background:#0a0a42;border:1px solid rgba(255,255,255,.18);border-radius:24px;padding:20px}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}
.stream-items{margin-top:18px;border-top:1px solid rgba(255,255,255,.12);padding-top:18px}.stream-item-row{display:grid;grid-template-columns:minmax(0,1fr) 180px auto;gap:10px;align-items:end;margin-top:10px}.tracked-picker{margin-top:18px;border-top:1px solid rgba(255,255,255,.12);padding-top:18px}.tracked-picker-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.tracked-choice{display:flex;justify-content:space-between;align-items:center;gap:14px;text-align:left;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.045);color:white;border-radius:15px;padding:13px;cursor:pointer}.tracked-choice:hover{border-color:rgba(192,132,252,.4);background:rgba(124,58,237,.09)}.tracked-choice.selected{border-color:#c084fc;background:rgba(124,58,237,.2)}.tracked-choice strong,.tracked-choice small{display:block}.tracked-choice small{color:rgba(255,255,255,.58);margin-top:4px}.tracked-choice>span{white-space:nowrap;font-weight:900;color:#ddd6fe}

    .combined-list{display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)}
    .combined-row{display:grid;grid-template-columns:minmax(220px,1fr) 110px 140px auto;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);font-weight:850}
    .combined-row small{display:block;margin-top:3px;color:rgba(255,255,255,.62)}
    @media(max-width:980px){.stats-grid,.grid,.platform-grid{grid-template-columns:repeat(2,1fr)}.card-table-head{display:none}.card-row{grid-template-columns:repeat(2,1fr);border:1px solid rgba(255,255,255,.1);border-radius:16px;margin-top:10px}.table-head{display:none}.sale-row{grid-template-columns:repeat(2,1fr);border:1px solid rgba(255,255,255,.1);border-radius:16px;margin-top:10px}.draft-row,.tracked-picker-grid,.stream-item-row{grid-template-columns:repeat(2,1fr)}.combined-row{grid-template-columns:1fr 100px 130px auto}}
    @media(max-width:640px){.page{padding:14px}.top,.panel-head,.payrun-head{flex-direction:column;align-items:flex-start}.stats-grid,.grid,.platform-grid,.summary-strip{grid-template-columns:1fr}.span-2,.span-4{grid-column:span 1}.card-row,.sale-row,.draft-row,.tracked-picker-grid,.combined-row,.stream-item-row{grid-template-columns:1fr}.calendar-grid{gap:4px}.day{min-height:118px;padding:6px}.day-metric,.day-profit-line,.day-streams{font-size:.58rem}.picker-submenu{position:static;width:auto;max-height:260px;margin:4px 0 6px}.stream-picker-menu{width:min(240px,calc(100vw - 48px))}.row-actions{width:100%}.action{flex:1}}
  `}</style><div className="wrap">
    <div className="top"><div><div className="eyebrow">Collectiverse Admin</div><h1>🛒 Singles Centre</h1><p>Collections, tracked cards, stock management and sales entry.</p></div><Link className="button" href="/admin">← Admin Home</Link></div>
    <div className="tabs">
      {([['active','⭐ Active'],['sold','💰 Sold'],['ebay','🛒 eBay'],['streaming','🎥 Streaming'],['website','🌐 Website'],['sales','📅 Sales'],['purchases','📥 Purchases']] as [Tab,string][]).map(([id,label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {message && <div className="message">{message}</div>}
    {loading ? <section className="panel">Loading Singles Centre…</section> : <>
      {tab === 'active' && <><section className="panel slim"><div className="panel-head"><div><h2>Active Individually Tracked Cards</h2><p>Available, listed and reserved singles.</p></div><div className="row-actions"><button className="button primary" onClick={() => setShowPromoteCard(true)}>+ Add Tracked Card from Collection</button><div className="grid" style={{width:'min(520px,100%)'}}><input className="input span-2" placeholder="Search card, set, number or collection…" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="select span-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}><option value="all">All statuses</option><option value="available">Available</option><option value="listed">Listed</option><option value="reserved">Reserved</option></select></div></div></div></section><CardRows rows={filteredCards} /></>}
      {tab === 'sold' && <section className="panel"><h2>All Sold Cards</h2><div style={{marginTop:14}}><SaleTable rows={sales} /></div></section>}
      {tab === 'ebay' && <PlatformTab platform="ebay" />}
      {tab === 'streaming' && <PlatformTab platform="streaming" />}
      {tab === 'website' && <PlatformTab platform="website" />}
      {tab === 'sales' && <>
        <section className="panel"><h2>Record Sale</h2><p>Record a full stream sale, or a separately sold tracked card.</p>
          <div className="segmented" style={{width:'max-content',marginTop:14}}>
            <button className={saleMode === 'streaming' ? 'selected' : ''} onClick={() => { setSaleMode('streaming'); resetSaleForm(); setSalePlatform('streaming') }}>Streaming</button>
            <button className={saleMode === 'tracked' ? 'selected' : ''} onClick={() => { setSaleMode('tracked'); resetSaleForm() }}>Tracked Card</button>
          </div>

          {saleMode === 'streaming' ? <>
            <div className="grid" style={{marginTop:14}}>
              <div className="field"><label>Sale Date</label><input className="input" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></div>
              <div className="field"><label>Gross Sales</label><input className="input" type="number" step="0.01" min="0" value={grossSale} onChange={(e) => setGrossSale(e.target.value)} /></div>
              <div className="field"><label>Net Sales</label><input className="input" type="number" step="0.01" min="0" value={netSale} onChange={(e) => setNetSale(e.target.value)} /></div>
              <div className="field"><label>Postage</label><input className="input" type="number" step="0.01" min="0" value={salePostage} onChange={(e) => setSalePostage(e.target.value)} /></div>
            </div>

            <div className="stream-items">
              <div className="panel-head"><div><h3>Items Sold</h3><p>Add collection cards and tracked cards from any purchase.</p></div><strong>{poolLots.reduce((sum, lot) => sum + number(lot.quantity_remaining), 0)} collection cards remaining</strong></div>
              {streamingItems.map((item, index) => <div className="stream-item-row" key={index}>
                <div className="field"><label>Item</label><div className="stream-picker">
                  <button className="stream-picker-button" type="button"><span className="picker-selected">{item.kind === 'collection' ? 'Collection Inventory' : item.kind === 'sealed' ? (sealedBatches.find((batch) => batch.id === item.sealed_id)?.product_name || 'Choose stock item…') : (activeCards.find((card) => card.id === item.card_id)?.card_name || 'Choose tracked card…')}</span><span>⌄</span></button>
                  <div className="stream-picker-menu">
                    <button className="picker-option" type="button" onClick={() => setStreamingItems((current) => current.map((row, rowIndex) => rowIndex === index ? { kind:'collection', card_id:'', sealed_id:'', quantity:'' } : row))}><span>Collection</span><span>›</span></button>
                    <div className="picker-category"><button className="picker-category-button" type="button"><span>Giveaways</span><span>›</span></button><div className="picker-submenu">{giveawayInventory.filter((batch) => number(batch.quantity_remaining) > 0).length ? giveawayInventory.filter((batch) => number(batch.quantity_remaining) > 0).map((batch) => <button className="picker-option" type="button" key={batch.id} onClick={() => setStreamingItems((current) => current.map((row, rowIndex) => rowIndex === index ? { kind:'sealed', card_id:'', sealed_id:batch.id, quantity:'' } : row))}><span>{batch.product_name}</span><small>{batch.quantity_remaining} left · {money(batch.unit_cost)}</small></button>) : <div className="picker-empty">No giveaway stock available.</div>}</div></div>
                    <div className="picker-category"><button className="picker-category-button" type="button"><span>Sealed</span><span>›</span></button><div className="picker-submenu">{sealedInventory.filter((batch) => number(batch.quantity_remaining) > 0).length ? sealedInventory.filter((batch) => number(batch.quantity_remaining) > 0).map((batch) => <button className="picker-option" type="button" key={batch.id} onClick={() => setStreamingItems((current) => current.map((row, rowIndex) => rowIndex === index ? { kind:'sealed', card_id:'', sealed_id:batch.id, quantity:'' } : row))}><span>{batch.product_name}</span><small>{batch.quantity_remaining} left · {money(batch.unit_cost)}</small></button>) : <div className="picker-empty">No sealed stock available.</div>}</div></div>
                    <div className="picker-category"><button className="picker-category-button" type="button"><span>Tracked</span><span>›</span></button><div className="picker-submenu"><input className="picker-search" placeholder="Search tracked cards…" value={streamItemSearches[index] || ''} onChange={(e) => setStreamItemSearches((current) => ({...current,[index]:e.target.value}))} onClick={(e) => e.stopPropagation()} />{activeCards.filter((card) => { const query=(streamItemSearches[index] || '').trim().toLowerCase(); return !query || [card.card_name,card.set_name,card.card_number].some((value) => String(value || '').toLowerCase().includes(query)) }).slice(0,100).map((card) => <button className="picker-option" type="button" key={card.id} onClick={() => setStreamingItems((current) => current.map((row, rowIndex) => rowIndex === index ? { kind:'tracked', card_id:card.id, sealed_id:'', quantity:'1' } : row))}><span>{card.card_name}</span><small>{[card.set_name,card.card_number].filter(Boolean).join(' · ')}</small></button>)}{activeCards.length === 0 && <div className="picker-empty">No tracked cards available.</div>}</div></div>
                  </div>
                </div></div>
                <div className="field"><label>Quantity</label><input className="input" type="number" min="1" disabled={item.kind === 'tracked'} value={item.kind === 'tracked' ? '1' : item.quantity} onChange={(e) => updateStreamingItem(index,'quantity',e.target.value)} /></div>
                <button className="button danger" type="button" onClick={() => removeStreamingItem(index)}>Remove</button>
              </div>)}
              <div className="row-actions" style={{marginTop:14}}><button className="button" type="button" onClick={addStreamingItem}>Add another item</button></div>
            </div>

            <div className="field" style={{marginTop:16}}><label>Notes</label><textarea className="textarea" value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} /></div>
            <button className="button primary" style={{marginTop:14}} onClick={saveStreamingSale}>Save Streaming Sale</button>
          </> : <>
            <div className="grid" style={{marginTop:14}}>
              <div className="field span-2"><label>Tracked Card</label><select className="select" value={saleCardId} onChange={(e) => { const id = e.target.value; const card = activeCards.find((item) => item.id === id); setSaleCardId(id); if (card) { const listed = card.listed_price == null ? '' : String(card.listed_price); setSalePlatform(card.platform === 'unlisted' ? 'streaming' : card.platform); setGrossSale(listed); setNetSale(listed) } }}><option value="">Choose card…</option>{activeCards.map((card) => <option key={card.id} value={card.id}>{card.card_name}{card.set_name ? ` — ${card.set_name}` : ''}{card.listed_price != null ? ` — listed ${money(card.listed_price)}` : ''}</option>)}</select></div>
              <div className="field"><label>Platform</label><select className="select" value={salePlatform} onChange={(e) => setSalePlatform(e.target.value as Exclude<Platform,'unlisted'>)}><option value="ebay">eBay</option><option value="streaming">Streaming</option><option value="website">Website</option></select></div>
              <div className="field"><label>Sale Date</label><input className="input" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} /></div>
              <div className="field"><label>Gross Sales</label><input className="input" type="number" step="0.01" min="0" value={grossSale} onChange={(e) => setGrossSale(e.target.value)} /></div>
              <div className="field"><label>Net Sales</label><input className="input" type="number" step="0.01" min="0" value={netSale} onChange={(e) => setNetSale(e.target.value)} /></div>
              <div className="field"><label>Postage</label><input className="input" type="number" step="0.01" min="0" value={salePostage} onChange={(e) => setSalePostage(e.target.value)} /></div>
              <div className="field span-4"><label>Notes</label><input className="input" value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} /></div>
            </div>
            <button className="button primary" style={{marginTop:14}} onClick={saveTrackedSale}>Save Tracked Card Sale</button>
          </>}
        </section>
      </>}
      {tab === 'purchases' && <>
        <section className="panel"><h2>Add Purchase</h2><p>Add collection inventory, individually tracked cards, or sealed products for streams and giveaways.</p>
          <div className="segmented" style={{width:'max-content',marginTop:14}}><button className={purchaseMode === 'collection' ? 'selected' : ''} onClick={() => setPurchaseMode('collection')}>Collection</button><button className={purchaseMode === 'sealed' ? 'selected' : ''} onClick={() => { setPurchaseMode('sealed'); setSealedType('Packs') }}>Sealed Product</button><button className={purchaseMode === 'giveaway' ? 'selected' : ''} onClick={() => { setPurchaseMode('giveaway'); setSealedType('Buyer Giveaway') }}>Giveaway</button></div>
          {purchaseMode === 'collection' ? <><div className="grid" style={{marginTop:14}}><div className="field span-2"><label>Collection Name</label><input className="input" value={collectionName} onChange={(e) => setCollectionName(e.target.value)} /></div><div className="field"><label>Supplier</label><input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div><div className="field"><label>Purchase Date</label><input className="input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></div><div className="field"><label>Total Paid</label><input className="input" type="number" step="0.01" min="0" value={totalPaid} onChange={(e) => setTotalPaid(e.target.value)} /></div><div className="field"><label>Collection Quantity</label><input className="input" type="number" min="0" value={poolQuantity} onChange={(e) => setPoolQuantity(e.target.value)} /></div><div className="field span-2"><label>Notes</label><input className="input" value={collectionNotes} onChange={(e) => setCollectionNotes(e.target.value)} /></div></div>
          <div style={{marginTop:18}}><div className="panel-head"><div><h2>Individually Tracked Cards</h2><p>Leave the row blank when the collection contains no cards worth tracking separately.</p></div><button className="button" onClick={() => setDraftCards((current) => [...current, blankDraftCard()])}>+ Add Card</button></div>{draftCards.map((card,index) => <div className="draft-row" key={index}><input className="input" placeholder="Card name" value={card.card_name} onChange={(e) => updateDraftCard(index,'card_name',e.target.value)} /><input className="input" placeholder="Set" value={card.set_name} onChange={(e) => updateDraftCard(index,'set_name',e.target.value)} /><input className="input" placeholder="Number" value={card.card_number} onChange={(e) => updateDraftCard(index,'card_number',e.target.value)} /><select className="select" value={card.condition} onChange={(e) => updateDraftCard(index,'condition',e.target.value)}><option>NM</option><option>LP</option><option>MP</option><option>HP</option><option>DMG</option></select><input className="input" type="number" step="0.01" placeholder="Cost" value={card.allocated_cost} onChange={(e) => updateDraftCard(index,'allocated_cost',e.target.value)} /><select className="select" value={card.platform} onChange={(e) => updateDraftCard(index,'platform',e.target.value)}><option value="unlisted">Unlisted</option><option value="ebay">eBay</option><option value="streaming">Streaming</option><option value="website">Website</option></select><input className="input" type="number" step="0.01" placeholder="Listed £" value={card.listed_price} onChange={(e) => updateDraftCard(index,'listed_price',e.target.value)} /><button className="mini danger" onClick={() => setDraftCards((current) => current.filter((_,i) => i !== index))}>Remove</button></div>)}</div>
          <div className="summary-strip"><div className="summary-item"><small>Total Paid</small><strong>{money(totalPaid)}</strong></div><div className="summary-item"><small>Tracked Card Cost</small><strong>{money(assignedTotal)}</strong></div><div className="summary-item"><small>Collection Cost</small><strong>{money(remainingPoolCost)}</strong></div><div className="summary-item"><small>Price Per Card</small><strong>{money(calculatedPoolUnitCost)}</strong></div></div><button className="button primary" style={{marginTop:16}} onClick={saveCollection}>Save Collection</button></> : <>
          <div className="grid" style={{marginTop:14}}><div className="field span-2"><label>{purchaseMode === 'giveaway' ? 'Giveaway Name' : 'Product Name'}</label><input className="input" value={sealedName} onChange={(e) => setSealedName(e.target.value)} placeholder={purchaseMode === 'giveaway' ? 'Buyer giveaway booster / follower ETB' : 'Booster box / ETB / collection box'} /></div><div className="field"><label>{purchaseMode === 'giveaway' ? 'Giveaway Type' : 'Product Type'}</label><select className="select" value={sealedType} onChange={(e) => setSealedType(e.target.value)}>{purchaseMode === 'giveaway' ? <><option>Buyer Giveaway</option><option>Follower Giveaway</option><option>Milestone Giveaway</option><option>Other Giveaway</option></> : <><option>Packs</option><option>Booster Box</option><option>ETB</option><option>Collection Box</option><option>Supplies</option><option>Other</option></>}</select></div><div className="field"><label>Supplier</label><input className="input" value={sealedSupplier} onChange={(e) => setSealedSupplier(e.target.value)} /></div><div className="field"><label>Purchase Date</label><input className="input" type="date" value={sealedDate} onChange={(e) => setSealedDate(e.target.value)} /></div><div className="field"><label>Quantity Bought</label><input className="input" type="number" min="1" value={sealedQuantity} onChange={(e) => setSealedQuantity(e.target.value)} /></div><div className="field"><label>Total Cost</label><input className="input" type="number" min="0" step="0.01" value={sealedCost} onChange={(e) => setSealedCost(e.target.value)} /></div><div className="field"><label>Cost Per Unit</label><input className="input" disabled value={money(number(sealedQuantity) > 0 ? number(sealedCost) / number(sealedQuantity) : 0)} /></div><div className="field span-4"><label>Notes</label><input className="input" value={sealedNotes} onChange={(e) => setSealedNotes(e.target.value)} /></div></div><button className="button primary" style={{marginTop:16}} onClick={saveSealedPurchase}>{purchaseMode === 'giveaway' ? 'Save Giveaway Item' : 'Save Sealed Product'}</button></>}
        </section>
        <section className="panel">
          <h2>Purchase History</h2>
          {collections.length === 0 ? <div className="empty">No collections added.</div> : <>
            {(() => {
              const allLots = poolLots.filter((lot) => collections.some((collection) => collection.id === lot.collection_id))
              const totalBought = allLots.reduce((sum, lot) => sum + number(lot.quantity_bought), 0)
              const totalRemaining = allLots.reduce((sum, lot) => sum + number(lot.quantity_remaining), 0)
              const remainingValue = allLots.reduce((sum, lot) => sum + number(lot.quantity_remaining) * number(lot.unit_cost), 0)
              const averagePrice = totalRemaining > 0 ? remainingValue / totalRemaining : 0
              const totalCollectionCost = allLots.reduce((sum, lot) => sum + number(lot.quantity_bought) * number(lot.unit_cost), 0)

              return <div className="purchase-card combined-collection">
                <div className="panel-head"><div><strong>Combined Collection Inventory</strong><p>Every purchase merges into this one balance · tracked cards excluded</p></div><strong>{money(totalCollectionCost)}</strong></div>
                <div className="summary-strip"><div className="summary-item"><small>Purchase Batches</small><strong>{collections.length}</strong></div><div className="summary-item"><small>Amount Remaining</small><strong>{totalRemaining}/{totalBought}</strong></div><div className="summary-item"><small>Average Price Per Card</small><strong>{money(averagePrice)}</strong></div><div className="summary-item"><small>Remaining Cost</small><strong>{money(remainingValue)}</strong></div></div>
                <div className="combined-list">{collections.map((collection) => {
                  const lot = poolLots.find((item) => item.collection_id === collection.id)
                  const collectionCards = cards.filter((card) => card.collection_id === collection.id)
                  const canDelete = !sales.some((sale) => sale.collection_id === collection.id) && !collectionCards.some((card) => card.status === 'sold') && (!lot || number(lot.quantity_remaining) === number(lot.quantity_bought))
                  return <div className="combined-row" key={collection.id}><div><strong>{collection.name}</strong><small>{shortDate(collection.purchase_date)}{collection.supplier ? ` · ${collection.supplier}` : ''}{collectionCards.length ? ` · ${collectionCards.length} tracked card${collectionCards.length === 1 ? '' : 's'}` : ''}</small></div><div>{lot?.quantity_remaining || 0}/{lot?.quantity_bought || 0}</div><div>{money(lot?.unit_cost || 0)} / card</div><button className="mini danger" disabled={!canDelete} title={canDelete ? 'Delete collection' : 'Collections with sales, sold tracked cards or used inventory cannot be deleted'} onClick={() => deleteCollection(collection)}>Delete</button></div>
                })}</div>
              </div>
            })()}
          </>}
        </section>
        <section className="panel"><h2>Sealed Product Inventory</h2>{sealedInventory.length === 0 ? <div className="empty">No sealed products added.</div> : <div className="combined-list">{sealedInventory.map((batch) => <div className="combined-row" key={batch.id}><div><strong>{batch.product_name}</strong><small>{batch.product_type} · {shortDate(batch.purchase_date)}{batch.supplier ? ` · ${batch.supplier}` : ''}</small></div><div>{batch.quantity_remaining}/{batch.quantity_bought}</div><div>{money(batch.unit_cost)} / unit</div><button className="mini danger" disabled={number(batch.quantity_remaining) !== number(batch.quantity_bought)} onClick={() => deleteSealedPurchase(batch)}>Delete</button></div>)}</div>}</section>
        <section className="panel"><h2>Giveaway Stock</h2>{giveawayInventory.length === 0 ? <div className="empty">No giveaway items added.</div> : <div className="combined-list">{giveawayInventory.map((batch) => <div className="combined-row" key={batch.id}><div><strong>{batch.product_name}</strong><small>{batch.product_type} · {shortDate(batch.purchase_date)}{batch.supplier ? ` · ${batch.supplier}` : ''}</small></div><div>{batch.quantity_remaining}/{batch.quantity_bought}</div><div>{money(batch.unit_cost)} / unit</div><button className="mini danger" disabled={number(batch.quantity_remaining) !== number(batch.quantity_bought)} onClick={() => deleteSealedPurchase(batch)}>Delete</button></div>)}</div>}</section>
      </>}
    </>}
    {showPromoteCard && <div className="modal-backdrop"><div className="modal"><div className="panel-head"><div><h2>Add Tracked Card from Collection</h2><p>This removes exactly 1 card and the entered cost from Combined Collection Inventory.</p></div><div style={{textAlign:'right'}}><small className="stat-label">Collection Remaining</small><div className="stat-value" style={{fontSize:'1.3rem'}}>{collectionRemainingQuantity} cards · {money(collectionInventoryValue)}</div></div></div><div className="grid" style={{marginTop:14}}><div className="field span-2"><label>Card Name</label><input className="input" value={promoteCard.card_name} onChange={(e) => setPromoteCard({...promoteCard,card_name:e.target.value})} placeholder="Articuno" /></div><div className="field"><label>Set</label><input className="input" value={promoteCard.set_name} onChange={(e) => setPromoteCard({...promoteCard,set_name:e.target.value})} /></div><div className="field"><label>Card Number</label><input className="input" value={promoteCard.card_number} onChange={(e) => setPromoteCard({...promoteCard,card_number:e.target.value})} /></div><div className="field"><label>Condition</label><select className="select" value={promoteCard.condition} onChange={(e) => setPromoteCard({...promoteCard,condition:e.target.value})}><option>NM</option><option>LP</option><option>MP</option><option>HP</option><option>DMG</option></select></div><div className="field"><label>Allocated Cost</label><input className="input" type="number" min="0.01" step="0.01" value={promoteCard.allocated_cost} onChange={(e) => setPromoteCard({...promoteCard,allocated_cost:e.target.value})} placeholder="11.00" /></div><div className="field"><label>Platform</label><select className="select" value={promoteCard.platform} onChange={(e) => setPromoteCard({...promoteCard,platform:e.target.value as Platform})}><option value="unlisted">Unlisted</option><option value="ebay">eBay</option><option value="streaming">Streaming</option><option value="website">Website</option></select></div><div className="field"><label>Listed Price</label><input className="input" type="number" min="0" step="0.01" value={promoteCard.listed_price} onChange={(e) => setPromoteCard({...promoteCard,listed_price:e.target.value})} /></div><div className="field span-4"><label>Notes</label><textarea className="textarea" value={promoteCard.notes} onChange={(e) => setPromoteCard({...promoteCard,notes:e.target.value})} /></div></div><div className="summary-strip"><div className="summary-item"><small>Collection Quantity Change</small><strong>-1 card</strong></div><div className="summary-item"><small>Collection Cost Change</small><strong>-{money(promoteCard.allocated_cost)}</strong></div><div className="summary-item"><small>New Tracked Card Cost</small><strong>{money(promoteCard.allocated_cost)}</strong></div><div className="summary-item"><small>New Remaining Value</small><strong>{money(Math.max(0, collectionInventoryValue - number(promoteCard.allocated_cost)))}</strong></div></div><div className="modal-actions"><button className="button" onClick={() => { setShowPromoteCard(false); setPromoteCard(blankDraftCard()) }}>Cancel</button><button className="button primary" onClick={promoteCollectionCard}>Move into Tracked Inventory</button></div></div></div>}
    {editCard && <div className="modal-backdrop"><div className="modal"><h2>Edit Tracked Card</h2><div className="grid" style={{marginTop:14}}><div className="field span-2"><label>Card Name</label><input className="input" value={editCard.card_name} onChange={(e) => setEditCard({...editCard,card_name:e.target.value})} /></div><div className="field"><label>Set</label><input className="input" value={editCard.set_name || ''} onChange={(e) => setEditCard({...editCard,set_name:e.target.value})} /></div><div className="field"><label>Number</label><input className="input" value={editCard.card_number || ''} onChange={(e) => setEditCard({...editCard,card_number:e.target.value})} /></div><div className="field"><label>Condition</label><select className="select" value={editCard.condition} onChange={(e) => setEditCard({...editCard,condition:e.target.value})}><option>NM</option><option>LP</option><option>MP</option><option>HP</option><option>DMG</option></select></div><div className="field"><label>Cost</label><input className="input" type="number" step="0.01" value={editCard.allocated_cost} onChange={(e) => setEditCard({...editCard,allocated_cost:number(e.target.value)})} /></div><div className="field"><label>Platform</label><select className="select" value={editCard.platform} onChange={(e) => setEditCard({...editCard,platform:e.target.value as Platform})}><option value="unlisted">Unlisted</option><option value="ebay">eBay</option><option value="streaming">Streaming</option><option value="website">Website</option></select></div><div className="field"><label>Listed Price</label><input className="input" type="number" step="0.01" value={editCard.listed_price ?? ''} onChange={(e) => setEditCard({...editCard,listed_price:e.target.value ? number(e.target.value) : null})} /></div><div className="field"><label>Status</label><select className="select" value={editCard.status} onChange={(e) => setEditCard({...editCard,status:e.target.value as CardStatus})}><option value="available">Available</option><option value="listed">Listed</option><option value="reserved">Reserved</option></select></div><div className="field span-4"><label>Notes</label><textarea className="textarea" value={editCard.notes || ''} onChange={(e) => setEditCard({...editCard,notes:e.target.value})} /></div></div><div className="modal-actions"><button className="button" onClick={() => setEditCard(null)}>Cancel</button><button className="button primary" onClick={saveCardEdit}>Save Changes</button></div></div></div>}
  </div></main></AdminGuard>
}