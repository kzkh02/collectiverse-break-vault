'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

type FilterMode = 'all' | 'hits' | 'not_hits' | 'featured'

type TierId = '' | 'reverse_holo' | 'ex' | 'sr' | 'ir' | 'mar' | 'gold' | 'sir' | 'clc'

type EntryRow = {
  id: string
  break_id: string
  collector_id: string
  spot_name: string
  is_hit: boolean
  hit_name: string | null
  hit_tier: TierId | null
  revealed_at: string | null
  featured_hit?: boolean | null
  collector_name?: string
}

type BreakRow = {
  id: string
  break_name: string | null
  status: string | null
  stream_datetime: string | null
}

const tiers: { id: TierId; label: string; emoji: string }[] = [
  { id: '', label: 'Not hit', emoji: '—' },
  { id: 'reverse_holo', label: 'Reverse Holo', emoji: '🌈' },
  { id: 'ex', label: 'EX', emoji: '✨' },
  { id: 'sr', label: 'SR', emoji: '💎' },
  { id: 'ir', label: 'IR', emoji: '⭐' },
  { id: 'mar', label: 'MAR', emoji: '🌌' },
  { id: 'gold', label: 'Gold', emoji: '🥇' },
  { id: 'sir', label: 'SIR', emoji: '👑' },
  { id: 'clc', label: 'CLC', emoji: '🏆' },
]

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

function tierLabel(tier: string | null) {
  return tiers.find((item) => item.id === tier)?.label || 'Not hit'
}

function tierEmoji(tier: string | null) {
  return tiers.find((item) => item.id === tier)?.emoji || '—'
}

function tierClass(tier: string | null) {
  if (!tier) return 'tier-none'
  return `tier-${tier}`
}


const ASCENDED_SPECIAL_CHOICES: Record<string, string[]> = {
  "all other ex's": [
    'Dragapult EX',
    'Mega Lucario EX',
    "Cynthia's Garchomp EX",
    'Cinderace EX',
    "Erika's Vileplume EX",
    'Azumarill EX',
    "Team Rocket's Kangaskhan EX",
    'Mega Gardevoir EX',
    "Ethan's Ho-Oh EX",
    'Zangoose EX',
    'Registeel EX',
    "Larry's Dudunsparce EX",
    "Hop's Pincurchin EX",
    'Koraidon EX',
    'Voltorb EX',
    'Regice EX',
    'Togedemaru EX',
    'Miraidon EX',
    'Mandibuzz EX',
    'Terapagos EX',
    'Regirock EX',
  ],
  'all other exs': [
    'Dragapult EX',
    'Mega Lucario EX',
    "Cynthia's Garchomp EX",
    'Cinderace EX',
    "Erika's Vileplume EX",
    'Azumarill EX',
    "Team Rocket's Kangaskhan EX",
    'Mega Gardevoir EX',
    "Ethan's Ho-Oh EX",
    'Zangoose EX',
    'Registeel EX',
    "Larry's Dudunsparce EX",
    "Hop's Pincurchin EX",
    'Koraidon EX',
    'Voltorb EX',
    'Regice EX',
    'Togedemaru EX',
    'Miraidon EX',
    'Mandibuzz EX',
    'Terapagos EX',
    'Regirock EX',
  ],
  'all items': ['Ultra Ball', "N's PP Up", "Team Rocket's Transceiver", 'Glass Trumpet'],
  'all trainers': ["Boss's Orders", 'Anthea & Concordia', "Black Belt's Training", 'Cheren'],
  'all other trainers': ["Boss's Orders", 'Anthea & Concordia', "Black Belt's Training", 'Cheren'],
}

function cleanSpotLabel(value: string) {
  return String(value || '')
    .replace(/ · Extra Hit \d+$/i, '')
    .replace(/^[^\p{L}\p{N}'’]+/u, '')
    .trim()
}

function spotChoiceKey(value: string) {
  return cleanSpotLabel(value).toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim()
}

function isAscendedBreak(name: string | null | undefined) {
  return String(name || '').toLowerCase().includes('ascended')
}

function choicesForAscendedSpot(spotName: string): string[] {
  const key = spotChoiceKey(spotName)

  if (
    key === "all other ex's" ||
    key === 'all other exs' ||
    key.startsWith("all other ex's ") ||
    key.startsWith('all other exs ')
  ) {
    return ASCENDED_SPECIAL_CHOICES["all other ex's"]
  }

  if (key === 'all items' || key.startsWith('all items ')) {
    return ASCENDED_SPECIAL_CHOICES['all items']
  }

  if (
    key === 'all trainers' ||
    key === 'all other trainers' ||
    key.startsWith('all trainers ') ||
    key.startsWith('all other trainers ')
  ) {
    return ASCENDED_SPECIAL_CHOICES['all other trainers']
  }

  // 30th Anniversary: the source spot is "Pikachu (SIR, EX)".
  // SIR has Day/Night artwork choices; EX remains the normal Pikachu EX hit.
  if (key === 'pikachu (sir, ex)' || key === 'pikachu (sir,ex)') {
    return ['Pikachu Day', 'Pikachu Night']
  }

  // 30th Anniversary: RGB Mew has three separate colour artworks/hits.
  if (key === 'rgb mew') {
    return ['Red RGB Mew', 'Green RGB Mew', 'Blue RGB Mew']
  }

  // 30th Anniversary: Pikachu & Zekrom CLC remains one card/spot.
  if (
    key === 'pikachu & zekrom' ||
    key === 'pikachu & zekrom (clc)'
  ) {
    return []
  }

  // Darkrai & Cresselia CLC has two separate artworks: Top and Bottom.
  if (
    key === 'darkrai & cresselia' ||
    key === 'darkrai & cresselia (clc)'
  ) {
    return ['Darkrai & Cresselia Top', 'Darkrai & Cresselia Bottom']
  }

  // 30th Celebration: this is one purchased spot with three separate IR hits.
  // Supports both the current "Galarian/Alolan/Meowth IR" wording and legacy Meowth wording.
  if (
    key === 'galarian/alolan/meowth ir' ||
    key === 'galarian/alolan/meowth (ir)' ||
    key === 'galarian meowth/alolan meowth/meowth ir' ||
    key === 'meowth ir & alolan meowth ir' ||
    key === 'meowth & alolan meowth' ||
    (
      key.includes('galarian') &&
      key.includes('alolan') &&
      key.includes('meowth')
    ) ||
    (key.includes('meowth') && key.includes('alolan meowth'))
  ) {
    return ['Galarian Meowth', 'Alolan Meowth', 'Meowth']
  }

  // 30th Anniversary: N / Misty is one purchased spot with two separate CLC hits.
  // Match the real source label even when CLC is written beside each name.
  if (/\bn\b/i.test(key) && /\bmisty\b/i.test(key)) {
    return ['N', 'Misty']
  }

  // Mega Audino / Stunfisk is a combined purchased spot.
  // Breaks only chooses the Pokémon; SR vs EX is handled by the tier dropdown.
  if (key.includes('mega audino') && key.includes('stunfisk')) {
    return ['Mega Audino', 'Stunfisk']
  }

  if (key.includes(' & ')) {
    return cleanSpotLabel(spotName)
      .split(/\s*&\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

export default function BreakPage() {
  const params = useParams()
  const router = useRouter()
  const breakId = params.id as string

  const [breakData, setBreakData] = useState<BreakRow | null>(null)
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [message, setMessage] = useState('Loading break...')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [bulkTier, setBulkTier] = useState<TierId>('')
  const [bulkMode, setBulkMode] = useState(false)
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null)
  const [selectedHitNames, setSelectedHitNames] = useState<Record<string, string[]>>({})

  const totalSpots = entries.length
  const hitsMarked = entries.filter((entry) => entry.is_hit).length
  const featuredHits = entries.filter((entry) => entry.featured_hit)
  const featuredCount = featuredHits.length
  const breakStatus = breakData?.status || 'open'

  const collectorSummary = useMemo(() => {
    const summary = new Map<string, { name: string; spots: number; hits: number }>()

    entries.forEach((entry) => {
      const key = entry.collector_id
      const current = summary.get(key) || {
        name: entry.collector_name || 'Unknown',
        spots: 0,
        hits: 0,
      }

      current.spots += 1
      if (entry.is_hit) current.hits += 1
      summary.set(key, current)
    })

    return Array.from(summary.values()).sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits
      if (b.spots !== a.spots) return b.spots - a.spots
      return a.name.localeCompare(b.name)
    })
  }, [entries])

  const filteredEntries = useMemo(() => {
    const query = search.toLowerCase().trim()

    return entries.filter((entry) => {
      const matchesSearch =
        !query ||
        entry.spot_name.toLowerCase().includes(query) ||
        String(entry.collector_name || '').toLowerCase().includes(query)

      const matchesFilter =
        filter === 'all' ||
        (filter === 'hits' && entry.is_hit) ||
        (filter === 'not_hits' && !entry.is_hit) ||
        (filter === 'featured' && entry.featured_hit)

      return matchesSearch && matchesFilter
    })
  }, [entries, search, filter])

  async function loadData() {
    setMessage('Loading break...')

    const { data: loadedBreak, error: breakError } = await supabase
      .from('breaks')
      .select('*')
      .eq('id', breakId)
      .single()

    if (breakError || !loadedBreak) {
      setMessage(`Break error: ${breakError?.message || 'Break not found'}`)
      return
    }

    setBreakData(loadedBreak as BreakRow)

    const { data: entriesData, error: entriesError } = await supabase
      .from('entries')
      .select('*')
      .eq('break_id', breakId)
      .order('spot_name')

    if (entriesError) {
      setMessage(`Entries error: ${entriesError.message}`)
      return
    }

    const collectorIds = [
      ...new Set((entriesData || []).map((entry: any) => entry.collector_id).filter(Boolean)),
    ]

    const { data: collectorsData } =
      collectorIds.length > 0
        ? await supabase
            .from('collectors')
            .select('id, whatnot_name')
            .in('id', collectorIds)
        : { data: [] }

    const collectorsById = new Map<string, string>(
      (collectorsData || []).map((collector: any) => [
        String(collector.id),
        String(collector.whatnot_name),
      ])
    )

    const entriesWithCollectors = (entriesData || []).map((entry: any) => ({
      ...entry,
      collector_name: collectorsById.get(String(entry.collector_id)) || 'Unknown',
    }))

    setEntries(entriesWithCollectors as EntryRow[])

    const restoredSelections: Record<string, string[]> = {}
    ;(entriesWithCollectors as EntryRow[]).forEach((entry) => {
      const choices = choicesForAscendedSpot(entry.spot_name)
      if (!choices.length || !entry.hit_name) return
      const saved = String(entry.hit_name)
        .split(' + ')
        .map((item) => item.replace(/\s*\((Reverse Holo|EX|SR|IR|MAR|Gold|SIR|CLC)\)\s*$/i, '').trim())
      restoredSelections[entry.id] = saved.filter((item) => choices.includes(item))
    })
    setSelectedHitNames(restoredSelections)
    setMessage('')
  }

  async function updateHit(entryId: string, spotName: string, tier: TierId, explicitHitNames?: string[]) {
    setSavingEntryId(entryId)

    // 30th source data labels Umbreon/Espeon as IR, but the cards are EX.
    // Force the saved tier to EX so image lookup matches Umbreon EX / Espeon EX.
    const spotKey = spotChoiceKey(spotName)
    const correctedTier: TierId =
      spotKey === 'umbreon (ir)' || spotKey === 'espeon (ir)'
        ? (tier === '' ? '' : 'ex')
        : tier

    const isHit = correctedTier !== ''
    const availableChoices =
      choicesForAscendedSpot(spotName)
    const chosenNames = (explicitHitNames || selectedHitNames[entryId] || [])
      .filter(Boolean)
      .map((name) => {
        // Split/grouped spots save the actual selected card name.
        // Tier is stored separately in hit_tier, so don't duplicate it in hit_name.
        if (availableChoices.length > 0) {
          return String(name)
            .replace(/\s+(SIR|GOLD|MAR|IR|SR|CLC)$/i, '')
            .trim()
        }
        return name
      })

    // For a grouped Ascended spot, don't save the generic parent label.
    // The user must choose the actual card(s) pulled first.
    const pikachuSirExSpot =
      spotChoiceKey(spotName) === 'pikachu (sir, ex)' ||
      spotChoiceKey(spotName) === 'pikachu (sir,ex)'

    if (
      isHit &&
      availableChoices.length > 0 &&
      chosenNames.length === 0 &&
      !(pikachuSirExSpot && correctedTier === 'ex')
    ) {
      setSavingEntryId(null)
      setMessage('Choose the actual card pulled from this spot first.')
      return
    }

    const isPikachuSirExSpot =
      spotChoiceKey(spotName) === 'pikachu (sir, ex)' ||
      spotChoiceKey(spotName) === 'pikachu (sir,ex)'

    const hitName = isHit
      ? (
          isPikachuSirExSpot && tier === 'ex'
            ? 'Pikachu EX'
            : availableChoices.length > 0
            ? chosenNames
                .map((name) => {
                  // All Other EX choices already contain EX and use that exact
                  // image name. For split "&" cards, preserve the old working
                  // format used by existing Vault hits: "Card Name (IR)" etc.
                  const isAllOtherEx = spotChoiceKey(spotName).startsWith('all other ex')
                  if (isAllOtherEx || !correctedTier) return name

                  const label = tierLabel(correctedTier)
                  return `${name} (${label})`
                })
                .join(' + ')
            : spotName
        )
      : null

    const { error } = await supabase
      .from('entries')
      .update({
        is_hit: isHit,
        hit_name: hitName,
        hit_tier: isHit ? correctedTier : null,
        revealed_at: isHit ? new Date().toISOString() : null,
        featured_hit: isHit ? undefined : false,
      })
      .eq('id', entryId)

    setSavingEntryId(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              is_hit: isHit,
              hit_name: hitName,
              hit_tier: isHit ? correctedTier : null,
              revealed_at: isHit ? new Date().toISOString() : null,
              featured_hit: isHit ? entry.featured_hit : false,
            }
          : entry
      )
    )

    if (!isHit) {
      setSelectedHitNames((current) => {
        const next = { ...current }
        delete next[entryId]
        return next
      })
    }

    setMessage('Saved')
  }

  async function addExtraHit(entry: EntryRow) {
    if (!entry.is_hit || !entry.hit_tier) {
      setMessage('Mark the original card as a hit first.')
      return
    }

    const choices = choicesForAscendedSpot(entry.spot_name)
    const chosenNames = (selectedHitNames[entry.id] || []).filter(Boolean)

    if (choices.length > 0 && chosenNames.length === 0) {
      setMessage('Choose the actual card pulled before adding an extra hit.')
      return
    }

    const existingExtraCount = entries.filter((item) =>
      item.spot_name.startsWith(`${cleanSpotLabel(entry.spot_name)} · Extra Hit `)
    ).length

    const extraNumber = existingExtraCount + 1
    const extraSpotName = `${cleanSpotLabel(entry.spot_name)} · Extra Hit ${extraNumber}`

    const isPikachuSirExSpot =
      spotChoiceKey(entry.spot_name) === 'pikachu (sir, ex)' ||
      spotChoiceKey(entry.spot_name) === 'pikachu (sir,ex)'

    const correctedTier: TierId =
      spotChoiceKey(entry.spot_name) === 'umbreon (ir)' ||
      spotChoiceKey(entry.spot_name) === 'espeon (ir)'
        ? 'ex'
        : entry.hit_tier

    const hitName =
      isPikachuSirExSpot && correctedTier === 'ex'
        ? 'Pikachu EX'
        : choices.length > 0
        ? chosenNames
            .map((name) => {
              const cleanName = String(name).replace(/\s+(SIR|GOLD|MAR|IR|SR|CLC)$/i, '').trim()
              const isAllOtherEx = spotChoiceKey(entry.spot_name).startsWith('all other ex')
              if (isAllOtherEx || !correctedTier) return cleanName
              return `${cleanName} (${tierLabel(correctedTier)})`
            })
            .join(' + ')
        : entry.hit_name || entry.spot_name

    setSavingEntryId(entry.id)

    const { data: inserted, error } = await supabase
      .from('entries')
      .insert({
        break_id: entry.break_id,
        collector_id: entry.collector_id,
        spot_name: extraSpotName,
        is_hit: true,
        hit_name: hitName,
        hit_tier: correctedTier,
        revealed_at: new Date().toISOString(),
        featured_hit: false,
      })
      .select('*')
      .single()

    setSavingEntryId(null)

    if (error || !inserted) {
      setMessage(`Extra hit error: ${error?.message || 'No entry returned'}`)
      return
    }

    const newEntry = {
      ...inserted,
      collector_name: entry.collector_name || 'Unknown',
    } as EntryRow

    setEntries((current) => [...current, newEntry])

    if (choices.length > 0) {
      setSelectedHitNames((current) => ({
        ...current,
        [newEntry.id]: [...chosenNames],
      }))
    }

    setMessage(`Extra hit added for ${cleanSpotLabel(entry.spot_name)}`)
  }

  async function applyBulkTier(entry: EntryRow) {
    if (!bulkMode) return
    await updateHit(entry.id, entry.spot_name, bulkTier)
  }

  async function featureHit(entryId: string) {
    const entry = entries.find((item) => item.id === entryId)
    if (!entry?.is_hit) {
      setMessage('Only marked hits can be featured.')
      return
    }

    if (entry.featured_hit) {
      const { error } = await supabase
        .from('entries')
        .update({ featured_hit: false })
        .eq('id', entryId)

      if (error) {
        setMessage(error.message)
        return
      }

      setEntries((current) =>
        current.map((item) =>
          item.id === entryId ? { ...item, featured_hit: false } : item
        )
      )
      setMessage('Featured hit removed from the homepage')
      return
    }

    const { data: currentFeatured, error: featuredError } = await supabase
      .from('entries')
      .select('id, revealed_at')
      .eq('featured_hit', true)
      .eq('is_hit', true)
      .order('revealed_at', { ascending: true })

    if (featuredError) {
      setMessage(featuredError.message)
      return
    }

    const featuredNow = currentFeatured || []
    const confirmed = window.confirm(
      featuredNow.length >= 5
        ? 'The homepage already has 5 featured hits. Add this one and automatically remove the oldest featured hit?'
        : `Add this to the homepage featured carousel? ${featuredNow.length + 1}/5 slots will be used.`
    )
    if (!confirmed) return

    let removedEntryId: string | null = null

    if (featuredNow.length >= 5 && featuredNow[0]?.id) {
      removedEntryId = String(featuredNow[0].id)

      const { error: removeError } = await supabase
        .from('entries')
        .update({ featured_hit: false })
        .eq('id', removedEntryId)

      if (removeError) {
        setMessage(removeError.message)
        return
      }
    }

    const { error } = await supabase
      .from('entries')
      .update({ featured_hit: true })
      .eq('id', entryId)

    if (error) {
      if (removedEntryId) {
        await supabase
          .from('entries')
          .update({ featured_hit: true })
          .eq('id', removedEntryId)
      }
      setMessage(error.message)
      return
    }

    setEntries((current) =>
      current.map((item) => {
        if (item.id === entryId) return { ...item, featured_hit: true }
        if (removedEntryId && item.id === removedEntryId) return { ...item, featured_hit: false }
        return item
      })
    )

    setMessage(
      removedEntryId
        ? 'Hit added and the oldest featured hit was removed automatically'
        : 'Hit added to the homepage featured carousel'
    )
  }

  async function clearFeaturedHit() {
    const confirmed = window.confirm('Clear all homepage featured hits?')
    if (!confirmed) return

    const { error } = await supabase
      .from('entries')
      .update({ featured_hit: false })
      .eq('featured_hit', true)

    if (error) {
      setMessage(error.message)
      return
    }

    setEntries((current) => current.map((entry) => ({ ...entry, featured_hit: false })))
    setMessage('All featured hits cleared')
  }

  async function completeBreak() {
    const confirmed = window.confirm('Mark this break as completed?')
    if (!confirmed) return

    const { error } = await supabase
      .from('breaks')
      .update({ status: 'completed' })
      .eq('id', breakId)

    if (error) {
      setMessage(error.message)
      return
    }

    setBreakData((current) => (current ? { ...current, status: 'completed' } : current))
    setMessage('Break marked as completed')
  }

  async function reopenBreak() {
    const confirmed = window.confirm('Reopen this break?')
    if (!confirmed) return

    const { error } = await supabase
      .from('breaks')
      .update({ status: 'open' })
      .eq('id', breakId)

    if (error) {
      setMessage(error.message)
      return
    }

    setBreakData((current) => (current ? { ...current, status: 'open' } : current))
    setMessage('Break reopened')
  }

  async function duplicateBreak() {
    if (!breakData) return

    const confirmed = window.confirm(
      'Duplicate this break and copy all spots as fresh unhit entries?'
    )

    if (!confirmed) return

    const { data: newBreak, error: breakError } = await supabase
      .from('breaks')
      .insert({
        break_name: `${breakData.break_name || 'Break'} Copy`,
        status: 'open',
        stream_datetime: breakData.stream_datetime,
      })
      .select('id')
      .single()

    if (breakError || !newBreak) {
      setMessage(`Duplicate error: ${breakError?.message || 'No break returned'}`)
      return
    }

    const newBreakId = String(newBreak.id)

    const copiedEntries = entries.map((entry) => ({
      break_id: newBreakId,
      collector_id: entry.collector_id,
      spot_name: entry.spot_name,
      is_hit: false,
      hit_name: null,
      hit_tier: null,
      revealed_at: null,
      featured_hit: false,
    }))

    if (copiedEntries.length > 0) {
      const { error: entriesError } = await supabase.from('entries').insert(copiedEntries)

      if (entriesError) {
        setMessage(`Duplicate entries error: ${entriesError.message}`)
        return
      }
    }

    router.push(`/admin/breaks/${newBreakId}`)
  }

  async function deleteBreak() {
    const confirmed = window.confirm(
      'Delete this break permanently? This will also delete all entries/spots in this break. This cannot be undone.'
    )

    if (!confirmed) return

    const doubleConfirmed = window.confirm('Are you absolutely sure?')
    if (!doubleConfirmed) return

    const { error: entriesError } = await supabase
      .from('entries')
      .delete()
      .eq('break_id', breakId)

    if (entriesError) {
      setMessage(`Delete entries error: ${entriesError.message}`)
      return
    }

    const { error: breakError } = await supabase
      .from('breaks')
      .delete()
      .eq('id', breakId)

    if (breakError) {
      setMessage(`Delete break error: ${breakError.message}`)
      return
    }

    router.push('/admin/breaks')
  }

  useEffect(() => {
    if (breakId) loadData()
  }, [breakId])

  return (
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
          max-width: 1180px;
          margin: 0 auto;
        }

        .admin-back {
          display: inline-flex;
          color: rgba(255,255,255,.78);
          text-decoration: none;
          margin-bottom: 18px;
          font-weight: 800;
        }

        .admin-header {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          margin-bottom: 18px;
        }

        .admin-title h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3.2rem);
          font-weight: 950;
          letter-spacing: -1px;
        }

        .admin-meta {
          margin-top: 8px;
          color: rgba(255,255,255,.72);
          font-weight: 700;
        }

        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .admin-button {
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.08);
          color: white;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .admin-button.primary {
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 10px 24px rgba(124,58,237,.32);
        }

        .admin-button.gold {
          background: linear-gradient(135deg, #facc15, #f97316);
          color: #120900;
        }

        .admin-button.danger {
          background: rgba(239,68,68,.16);
          border-color: rgba(248,113,113,.45);
          color: #fecaca;
        }

        .message {
          margin: 14px 0 18px;
          color: rgba(255,255,255,.78);
          font-weight: 800;
        }

        .panel {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 22px;
          padding: 18px;
          margin-bottom: 18px;
          box-shadow: 0 18px 52px rgba(0,0,0,.28);
        }

        .panel-title {
          font-weight: 950;
          font-size: 1.05rem;
          margin-bottom: 12px;
        }

        .featured-panel {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          border-color: rgba(250,204,21,.34);
          background:
            radial-gradient(circle at top left, rgba(250,204,21,.14), transparent 32%),
            rgba(255,255,255,.06);
        }

        .featured-name {
          font-size: 1.2rem;
          font-weight: 950;
        }

        .featured-sub {
          margin-top: 4px;
          color: rgba(255,255,255,.72);
          font-weight: 750;
        }

        .tools {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
        }

        .search-input,
        .tier-select {
          width: 100%;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.25);
          color: white;
          border-radius: 14px;
          padding: 12px 14px;
          font-weight: 800;
          outline: none;
        }

        .filter-row,
        .bulk-row {
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

        .collector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
        }

        .collector-chip {
          border: 1px solid rgba(255,255,255,.13);
          background: rgba(255,255,255,.055);
          border-radius: 16px;
          padding: 12px;
        }

        .collector-chip strong {
          display: block;
          margin-bottom: 5px;
        }

        .collector-chip span {
          color: rgba(255,255,255,.72);
          font-size: .82rem;
          font-weight: 750;
        }

        .entries-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .entry-card {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: center;
          border: 1px solid rgba(255,255,255,.13);
          background: rgba(255,255,255,.055);
          border-radius: 18px;
          padding: 14px;
        }

        .entry-card.bulk-enabled {
          cursor: pointer;
        }

        .entry-card.bulk-enabled:hover {
          border-color: rgba(192,132,252,.6);
          background: rgba(124,58,237,.12);
        }

        .spot-name {
          font-size: 1rem;
          font-weight: 950;
        }

        .spot-owner {
          color: rgba(255,255,255,.72);
          font-weight: 750;
          margin-top: 4px;
        }

        .status-row {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .tier-pill {
          display: inline-flex;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: .75rem;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
        }

        .featured-pill {
          color: #facc15;
          font-weight: 950;
        }

        .entry-actions {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .hit-choice-box {
          margin-top: 10px;
          padding: 10px;
          border: 1px solid rgba(192,132,252,.30);
          border-radius: 14px;
          background: rgba(124,58,237,.10);
        }

        .hit-choice-title {
          margin-bottom: 8px;
          color: #e9ddff;
          font-size: .78rem;
          font-weight: 950;
        }

        .hit-choice-list {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .hit-choice {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 9px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 10px;
          background: rgba(0,0,0,.18);
          color: white;
          font-size: .78rem;
          font-weight: 850;
          cursor: pointer;
        }

        .hit-choice.selected {
          border-color: rgba(192,132,252,.72);
          background: rgba(124,58,237,.30);
        }

        .hit-choice input { accent-color: #a855f7; }

        .tier-sir { border-color: rgba(255,255,255,.38); box-shadow: 0 0 22px rgba(250,204,21,.18); }
        .tier-clc { border-color: rgba(212,175,55,.78); box-shadow: 0 0 22px rgba(212,175,55,.24); }
        .tier-gold { border-color: rgba(250,204,21,.48); box-shadow: 0 0 22px rgba(250,204,21,.16); }
        .tier-mar { border-color: rgba(56,189,248,.42); }
        .tier-ir { border-color: rgba(251,113,133,.42); }
        .tier-sr { border-color: rgba(192,132,252,.42); }
        .tier-ex { border-color: rgba(96,165,250,.42); }

        @media (max-width: 760px) {
          .admin-page { padding: 14px; }
          .admin-header { flex-direction: column; }
          .action-row { justify-content: flex-start; }
          .tools { grid-template-columns: 1fr; }
          .entry-card { grid-template-columns: 1fr; }
          .entry-actions { flex-direction: column; align-items: stretch; }
        }
      `}</style>

      <div className="admin-wrap">
        <Link className="admin-back" href="/admin/breaks">
          ← Back to Breaks
        </Link>

        <header className="admin-header">
          <div className="admin-title">
            <h1>{breakData?.break_name || 'Break'}</h1>
            <div className="admin-meta">
              {formatStreamDateTime(breakData?.stream_datetime || null)} · Status:{' '}
              {breakStatus} · {totalSpots} spots · {hitsMarked} hits marked
            </div>
          </div>

          <div className="action-row">
            {breakStatus === 'completed' ? (
              <button className="admin-button" onClick={reopenBreak}>
                Reopen
              </button>
            ) : (
              <button className="admin-button primary" onClick={completeBreak}>
                Mark Complete
              </button>
            )}

            <button className="admin-button" onClick={duplicateBreak}>
              Duplicate
            </button>

            <button className="admin-button danger" onClick={deleteBreak}>
              Delete Break
            </button>
          </div>
        </header>

        {message && <div className="message">{message}</div>}

        <section className="panel featured-panel">
          <div>
            <div className="panel-title">⭐ Homepage Featured Hits ({featuredCount}/5)</div>
            {featuredHits.length > 0 ? (
              <div className="featured-sub">
                {featuredHits.map((hit) => hit.spot_name).join(' · ')}
              </div>
            ) : (
              <div className="featured-sub">No featured hits selected.</div>
            )}
          </div>

          {featuredHits.length > 0 && (
            <button className="admin-button" onClick={clearFeaturedHit}>
              Clear All Featured
            </button>
          )}
        </section>

        <section className="panel">
          <div className="tools">
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search collector or spot..."
            />

            <div className="filter-row">
              <button className={`filter-button ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All
              </button>
              <button className={`filter-button ${filter === 'hits' ? 'active' : ''}`} onClick={() => setFilter('hits')}>
                Hits
              </button>
              <button className={`filter-button ${filter === 'not_hits' ? 'active' : ''}`} onClick={() => setFilter('not_hits')}>
                Not Hit
              </button>
              <button className={`filter-button ${filter === 'featured' ? 'active' : ''}`} onClick={() => setFilter('featured')}>
                Featured
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">⚡ Bulk Hit Mode</div>
          <div className="bulk-row">
            <select
              className="tier-select"
              value={bulkTier}
              onChange={(event) => setBulkTier(event.target.value as TierId)}
            >
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.emoji} {tier.label}
                </option>
              ))}
            </select>

            <button
              className={`admin-button ${bulkMode ? 'gold' : ''}`}
              onClick={() => setBulkMode((current) => !current)}
            >
              {bulkMode ? 'Bulk Mode On' : 'Enable Bulk Mode'}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">Collectors In This Break</div>
          <div className="collector-grid">
            {collectorSummary.map((collector) => (
              <div key={collector.name} className="collector-chip">
                <strong>{collector.name}</strong>
                <span>
                  {collector.spots} spots · {collector.hits} hits
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="entries-list">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className={`entry-card ${tierClass(entry.hit_tier)} ${bulkMode ? 'bulk-enabled' : ''}`}
              onClick={() => applyBulkTier(entry)}
            >
              <div>
                <div className="spot-name">{entry.spot_name}</div>
                <div className="spot-owner">Owner: {entry.collector_name}</div>

                <div className="status-row">
                  <span className="tier-pill">
                    {entry.is_hit ? `${tierEmoji(entry.hit_tier)} ${tierLabel(entry.hit_tier)}` : 'Not hit'}
                  </span>

                  {entry.is_hit && entry.hit_name && entry.hit_name !== entry.spot_name && (
                    <span className="tier-pill">{entry.hit_name}</span>
                  )}

                  {entry.featured_hit && <span className="featured-pill">⭐ Featured Hit</span>}

                  {savingEntryId === entry.id && <span className="tier-pill">Saving...</span>}
                </div>

                {choicesForAscendedSpot(entry.spot_name).length > 0 && (
                  <div className="hit-choice-box" onClick={(event) => event.stopPropagation()}>
                    <div className="hit-choice-title">Choose actual card(s) pulled</div>
                    <div className="hit-choice-list">
                      {choicesForAscendedSpot(entry.spot_name).map((choice) => {
                        const selected = (selectedHitNames[entry.id] || []).includes(choice)
                        return (
                          <label className={`hit-choice ${selected ? 'selected' : ''}`} key={choice}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                setSelectedHitNames((current) => {
                                  const existing = current[entry.id] || []
                                  const nextChoices = selected
                                    ? existing.filter((item) => item !== choice)
                                    : [...existing, choice]
                                  return { ...current, [entry.id]: nextChoices }
                                })
                              }}
                            />
                            {spotChoiceKey(entry.spot_name).startsWith('all other ex')
                              ? choice.replace(/\s+EX$/i, '')
                              : choice}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="entry-actions" onClick={(event) => event.stopPropagation()}>
                <select
                  className="tier-select"
                  value={entry.hit_tier || ''}
                  onChange={(event) =>
                    updateHit(
                      entry.id,
                      entry.spot_name,
                      event.target.value as TierId,
                      selectedHitNames[entry.id] || []
                    )
                  }
                >
                  {tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.emoji} {tier.label}
                    </option>
                  ))}
                </select>

                {entry.is_hit && choicesForAscendedSpot(entry.spot_name).length > 0 && (
                  <button
                    className="admin-button"
                    onClick={() =>
                      updateHit(
                        entry.id,
                        entry.spot_name,
                        (entry.hit_tier || 'ex') as TierId,
                        selectedHitNames[entry.id] || []
                      )
                    }
                  >
                    Save Cards
                  </button>
                )}

                {entry.is_hit && (
                  <>
                    <button className="admin-button" onClick={() => addExtraHit(entry)}>
                      ＋ Extra Hit
                    </button>

                    <button className="admin-button gold" onClick={() => featureHit(entry.id)}>
                      ⭐ Feature
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
