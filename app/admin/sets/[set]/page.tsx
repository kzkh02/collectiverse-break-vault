'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import AdminGuard from '../../guard'

type BreakRow = {
  id: string
  break_name: string | null
  stream_datetime?: string | null
  created_at?: string | null
}

type EntryRow = { break_id: string; spot_name: string }
type ImageRow = { hit_name: string; hit_name_normalized: string; image_url: string }
type CardVariant = {
  spotName: string
  baseName: string
  variant: string
  cardName: string
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

function getSetName(name: string | null) {
  return canonicalSetName(name)
}

function normalise(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
}

function canonicalSpotKey(value: string) {
  return normalise(
    String(value || '')
      .replace(/ · Extra Hit \d+$/i, '')
      .replace(/^[^\p{L}\p{N}'’]+/u, '')
      .trim()
  )
}


type CollapsibleCardGroup = {
  parent: string
  cards: string[]
}

const ASCENDED_GROUPS: CollapsibleCardGroup[] = [
  {
    parent: "All Other EX's",
    cards: [
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
  },
  {
    parent: 'All Items',
    cards: [
      'Ultra Ball',
      "N's PP Up",
      "Team Rocket's Transceiver",
      'Glass Trumpet',
    ],
  },
  {
    parent: 'All Trainers',
    cards: [
      "Boss's Orders",
      'Anthea & Concordia',
      "Black Belt's Training",
      'Cheren',
    ],
  },
]

function isAscendedSet(value: string) {
  const key = normalise(value)
  return key.includes('ascended')
}

function getAscendedGroup(spotName: string) {
  const key = canonicalSpotKey(spotName)

  if (key === "all other ex's" || key === 'all other exs') {
    return ASCENDED_GROUPS.find((group) => group.parent === "All Other EX's")
  }
  if (key === 'all items') {
    return ASCENDED_GROUPS.find((group) => group.parent === 'All Items')
  }
  if (key === 'all trainers' || key === 'all other trainers') {
    return ASCENDED_GROUPS.find((group) => group.parent === 'All Trainers')
  }

  return ASCENDED_GROUPS.find((group) => normalise(group.parent) === key)
}

function safePath(value: string) {
  return normalise(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card'
}

function cleanDisplayCardName(value: string) {
  return String(value || '')
    .replace(/^[^\p{L}\p{N}'’]+/u, '')
    .replace(/\s+\((?:SIR|IR|SR|MAR|Future|Gold|EX)\)\s*$/i, '')
    .trim()
}


function removeRedundant151Ex(cardName: string) {
  const value = String(cardName || '').trim()
  // Only collapse EX when it is immediately before the terminal rarity.
  // Zapdos EX SIR -> Zapdos SIR
  // Zapdos EX EX  -> Zapdos EX
  return value.replace(/\s+EX\s+(SIR|IR|SR|MAR|GOLD|EX)$/i, ' $1')
}


function parseSpotVariants(spotName: string): CardVariant[] {
  const clean = String(spotName || '').replace(/ · Extra Hit \d+$/i, '').trim()
  const displayClean = cleanDisplayCardName(clean)

  // Special Ascended Heroes spot: Mega Audino and Stunfisk each have SR + EX images.
  if (
    /mega audino/i.test(displayClean) &&
    /stunfisk/i.test(displayClean)
  ) {
    return [
      { spotName: clean, baseName: 'Mega Audino', variant: 'SR', cardName: 'Mega Audino SR' },
      { spotName: clean, baseName: 'Mega Audino', variant: 'EX', cardName: 'Mega Audino EX' },
      { spotName: clean, baseName: 'Stunfisk', variant: 'SR', cardName: 'Stunfisk SR' },
      { spotName: clean, baseName: 'Stunfisk', variant: 'EX', cardName: 'Stunfisk EX' },
    ]
  }

  // 30th Anniversary special image structure.
  // IMPORTANT: inspect the ORIGINAL spot text (`clean`) because cleanDisplayCardName()
  // strips terminal rarity brackets such as "(CLC)".

  // 30th: Umbreon and Espeon are EX cards. Force the final card/image key too.
  if (/^umbreon\s*\(\s*(?:IR|EX)\s*\)$/i.test(clean)) {
    return [{ spotName: 'Umbreon (EX)', baseName: 'Umbreon', variant: 'EX', cardName: 'Umbreon EX' }]
  }

  if (/^espeon\s*\(\s*(?:IR|EX)\s*\)$/i.test(clean)) {
    return [{ spotName: 'Espeon (EX)', baseName: 'Espeon', variant: 'EX', cardName: 'Espeon EX' }]
  }

  // These two CLC "&" names are ONE spot/card each and must never be split.
  if (/^pikachu\s*&\s*zekrom\s*\(\s*CLC\s*\)$/i.test(clean)) {
    return [{
      spotName: clean,
      baseName: 'Pikachu & Zekrom',
      variant: 'CLC',
      cardName: 'Pikachu & Zekrom CLC',
    }]
  }

  if (/^darkrai\s*&\s*cresselia\s*\(\s*CLC\s*\)$/i.test(clean)) {
    return [
      {
        spotName: clean,
        baseName: 'Darkrai & Cresselia Top',
        variant: 'CLC',
        cardName: 'Darkrai & Cresselia Top CLC',
      },
      {
        spotName: clean,
        baseName: 'Darkrai & Cresselia Bottom',
        variant: 'CLC',
        cardName: 'Darkrai & Cresselia Bottom CLC',
      },
    ]
  }

  // The actual source spot is "Pikachu (SIR, EX)".
  // Keep the EX image, but split the SIR artwork into Day + Night.
  if (/^pikachu\s*\(\s*SIR\s*,\s*EX\s*\)$/i.test(clean)) {
    return [
      { spotName: clean, baseName: 'Pikachu Day', variant: 'SIR', cardName: 'Pikachu Day SIR' },
      { spotName: clean, baseName: 'Pikachu Night', variant: 'SIR', cardName: 'Pikachu Night SIR' },
      { spotName: clean, baseName: 'Pikachu', variant: 'EX', cardName: 'Pikachu EX' },
    ]
  }

  // RGB Mew is three separate colour artworks.
  if (/^rgb\s+mew$/i.test(displayClean)) {
    return [
      { spotName: clean, baseName: 'Red RGB Mew', variant: '', cardName: 'Red RGB Mew' },
      { spotName: clean, baseName: 'Green RGB Mew', variant: '', cardName: 'Green RGB Mew' },
      { spotName: clean, baseName: 'Blue RGB Mew', variant: '', cardName: 'Blue RGB Mew' },
    ]
  }

  // 30th Celebration: Galarian/Alolan/Meowth is one purchased spot,
  // but it contains three separate physical IR cards/images.
  if (
    (/galarian/i.test(displayClean) && /alolan/i.test(displayClean) && /meowth/i.test(displayClean)) ||
    (/meowth/i.test(displayClean) && /alolan\s+meowth/i.test(displayClean))
  ) {
    return [
      { spotName: clean, baseName: 'Galarian Meowth', variant: 'IR', cardName: 'Galarian Meowth IR' },
      { spotName: clean, baseName: 'Alolan Meowth', variant: 'IR', cardName: 'Alolan Meowth IR' },
      { spotName: clean, baseName: 'Meowth', variant: 'IR', cardName: 'Meowth IR' },
    ]
  }

  // 30th Anniversary: N / Misty is one purchased spot with two separate CLC cards.
  // Match N & Misty, N & Misty (CLC), or N (CLC) & Misty (CLC).
  if (/\bN\b/i.test(clean) && /\bMisty\b/i.test(clean)) {
    return [
      { spotName: clean, baseName: 'N', variant: 'CLC', cardName: 'N CLC' },
      { spotName: clean, baseName: 'Misty', variant: 'CLC', cardName: 'Misty CLC' },
    ]
  }

  // 30th: Umbreon & Espeon is an EX combined spot.
  // Do this BEFORE the generic "&" splitter below, which correctly treats
  // Ascended combined spots as IR.
  if (/^umbreon\s*&\s*espeon\s*\(\s*EX\s*\)$/i.test(clean)) {
    return [
      { spotName: clean, baseName: 'Umbreon', variant: 'EX', cardName: 'Umbreon EX' },
      { spotName: clean, baseName: 'Espeon', variant: 'EX', cardName: 'Espeon EX' },
    ]
  }

  // Ascended Heroes combined "&" spots are IR cards.
  // Store/upload each child using its full canonical image key (e.g. "Togekiss IR")
  // so newly uploaded images match hit_name + hit_tier on the public pages.
  if (displayClean.includes(' & ')) {
    return displayClean
      .split(/\s*&\s*/)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        spotName: clean,
        baseName: name,
        variant: 'IR',
        cardName: `${name} IR`,
      }))
  }

  // English 151 source data sometimes stores Blastoise + Venusaur together.
  // They are two physical cards, so expose two independent image entries.
  if (
    normalise(displayClean).includes('blastoise ex') &&
    normalise(displayClean).includes('venusaur ex')
  ) {
    return [
      {
        spotName: 'Blastoise EX (SIR)',
        baseName: 'Blastoise EX',
        variant: 'SIR',
        cardName: 'Blastoise EX SIR',
      },
      {
        spotName: 'Venusaur EX (SIR)',
        baseName: 'Venusaur EX',
        variant: 'SIR',
        cardName: 'Venusaur EX SIR',
      },
    ]
  }

  const match = clean.match(/^(.*?)\s*\(([^)]+)\)\s*$/)

  if (!match) {
    const cardName = cleanDisplayCardName(clean)
    return [{ spotName: clean, baseName: cardName, variant: '', cardName }]
  }

  const baseName = cleanDisplayCardName(match[1])
  const inside = match[2].trim()

  // A lone rarity in brackets is metadata, not part of the card's image name.
  // e.g. "Erika's Invitation (SIR)" -> "Erika's Invitation".
  if (/^(SIR|IR|SR|MAR|Future|Gold|EX)$/i.test(inside)) {
    return [{
      spotName: clean,
      baseName,
      variant: inside,
      cardName: `${baseName} ${inside}`.trim(),
    }]
  }

  const variants = inside
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (!variants.length) {
    return [{ spotName: clean, baseName, variant: '', cardName: baseName }]
  }

  return variants.map((variant) => ({
    spotName: clean,
    baseName,
    variant,
    cardName: removeRedundant151Ex(`${baseName} ${variant}`.trim()),
  }))
}

function breakTime(row: BreakRow) {
  return new Date(row.stream_datetime || row.created_at || 0).getTime()
}

function sortNewest(a: BreakRow, b: BreakRow) {
  const diff = breakTime(b) - breakTime(a)
  if (diff !== 0) return diff
  return String(b.break_name || '').localeCompare(String(a.break_name || ''), undefined, { numeric: true })
}

function formatDate(value?: string | null) {
  if (!value) return 'No date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No date'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SetDetailPage() {
  const params = useParams()
  const setKey = decodeURIComponent(String(params.set || ''))

  const [setName, setSetName] = useState(setKey)
  const [spots, setSpots] = useState<string[]>([])
  const [cards, setCards] = useState<CardVariant[]>([])
  const [breaks, setBreaks] = useState<BreakRow[]>([])
  const [latestBreakId, setLatestBreakId] = useState<string | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [deletingBreak, setDeletingBreak] = useState<string | null>(null)
  const [message, setMessage] = useState('Loading set...')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  async function loadSet() {
    setMessage('Loading set...')

    const { data: breaksData, error: breaksError } = await supabase
      .from('breaks')
      .select('*')

    if (breaksError) {
      setMessage(breaksError.message)
      return
    }

    const matching = ((breaksData || []) as BreakRow[])
      .filter((b) => normalise(getSetName(b.break_name)) === setKey)
      .sort(sortNewest)

    if (!matching.length) {
      setBreaks([])
      setSpots([])
      setCards([])
      setLatestBreakId(null)
      setMessage('Set not found.')
      return
    }

    setBreaks(matching)

    const latest = matching[0]
    const prettyName = getSetName(latest.break_name)
    setSetName(prettyName)
    setLatestBreakId(latest.id)

    const [{ data: entryData, error: entryError }, { data: imageData, error: imageError }] =
      await Promise.all([
        supabase
          .from('entries')
          .select('break_id, spot_name')
          .eq('break_id', latest.id),
        supabase
          .from('hit_images')
          .select('hit_name, hit_name_normalized, image_url')
          .eq('set_name_normalized', setKey),
      ])

    if (entryError || imageError) {
      setMessage(entryError?.message || imageError?.message || 'Could not load set.')
      return
    }

    // Treat emoji/no-emoji versions of the same spot as ONE spot.
    // Keep the cleanest label (prefer the version without a leading emoji).
    const unique = new Map<string, string>()
    ;((entryData || []) as EntryRow[]).forEach((entry) => {
      const clean = String(entry.spot_name || '')
        .replace(/ · Extra Hit \d+$/i, '')
        .trim()

      if (!clean) return

      const withoutLeadingEmoji = clean.replace(/^[^\p{L}\p{N}'’]+/u, '').trim()

      // 30th source correction: these are EX spots, not IR spots.
      const correctedSpot =
        /^umbreon\s*\(\s*IR\s*\)$/i.test(withoutLeadingEmoji)
          ? 'Umbreon (EX)'
          : /^espeon\s*\(\s*IR\s*\)$/i.test(withoutLeadingEmoji)
            ? 'Espeon (EX)'
            : withoutLeadingEmoji

      const key = canonicalSpotKey(correctedSpot)
      if (!key) return

      const existing = unique.get(key)

      // Always preserve the corrected 30th EX labels. The old condition could let
      // a duplicate legacy IR row overwrite Umbreon (EX) / Espeon (EX).
      if (
        correctedSpot === 'Umbreon (EX)' ||
        correctedSpot === 'Espeon (EX)' ||
        !existing ||
        clean === withoutLeadingEmoji
      ) {
        unique.set(key, correctedSpot)
      }
    })

    const latestSpots = Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
    setSpots(latestSpots)

    let parsedCards = latestSpots
      .filter((spot) => !(isAscendedSet(prettyName) && getAscendedGroup(spot)))
      .flatMap((spot) => parseSpotVariants(spot))

    // Ascended Heroes has three grouped break spots. Add their individual
    // physical hits explicitly so all three dropdowns always exist even if
    // the imported spot wording differs slightly between breaks.
    if (isAscendedSet(prettyName)) {
      parsedCards = [
        ...parsedCards,
        ...ASCENDED_GROUPS.flatMap((group) =>
          group.cards.map((cardName) => ({
            spotName: group.parent,
            baseName: cardName,
            variant: '',
            cardName,
          }))
        ),
      ]
    }

    parsedCards.sort((a, b) => a.cardName.localeCompare(b.cardName))
    setCards(parsedCards)

    const map: Record<string, string> = {}
    ;((imageData || []) as ImageRow[]).forEach((row) => {
      map[row.hit_name_normalized] = row.image_url
    })
    setImages(map)
    setMessage('')
  }

  useEffect(() => {
    loadSet()
  }, [setKey])

  async function uploadImage(cardName: string, file?: File) {
    if (!file) return

    const spotKey = normalise(cardName)
    setUploading(spotKey)
    setMessage('')

    try {
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${safePath(setName)}/${safePath(cardName)}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('hit-images')
        .upload(path, file, {
          upsert: true,
          contentType: file.type || undefined,
        })

      if (uploadError) throw uploadError

      const { data: publicData } = supabase.storage
        .from('hit-images')
        .getPublicUrl(path)

      const imageUrl = `${publicData.publicUrl}?v=${Date.now()}`

      const { error: saveError } = await supabase
        .from('hit_images')
        .upsert(
          {
            set_name: setName,
            set_name_normalized: setKey,
            hit_name: cardName,
            hit_name_normalized: spotKey,
            image_url: imageUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'set_name_normalized,hit_name_normalized' }
        )

      if (saveError) throw saveError

      setImages((old) => ({ ...old, [spotKey]: imageUrl }))
      setMessage(`Saved image for ${cardName}.`)
    } catch (e: any) {
      setMessage(`Upload failed: ${e?.message || 'Unknown error'}`)
    } finally {
      setUploading(null)
    }
  }

  async function removeImage(cardName: string) {
    if (!confirm(`Remove the saved image for ${cardName}?`)) return

    const spotKey = normalise(cardName)

    const { error } = await supabase
      .from('hit_images')
      .delete()
      .eq('set_name_normalized', setKey)
      .eq('hit_name_normalized', spotKey)

    if (error) {
      setMessage(error.message)
      return
    }

    setImages((old) => {
      const next = { ...old }
      delete next[spotKey]
      return next
    })
    setMessage(`Removed image for ${cardName}.`)
  }

  async function deleteBreak(row: BreakRow) {
    const name = row.break_name || 'Untitled Break'
    const confirmed = confirm(
      `Delete "${name}"?\n\nThis will permanently delete this break and its entries. This cannot be undone.`
    )
    if (!confirmed) return

    setDeletingBreak(row.id)
    setMessage(`Deleting ${name}...`)

    try {
      const { error: entriesError } = await supabase
        .from('entries')
        .delete()
        .eq('break_id', row.id)

      if (entriesError) throw entriesError

      const { error: breakError } = await supabase
        .from('breaks')
        .delete()
        .eq('id', row.id)

      if (breakError) throw breakError

      await loadSet()
      setMessage(`${name} deleted.`)
    } catch (e: any) {
      setMessage(`Delete failed: ${e?.message || 'Unknown error'}`)
    } finally {
      setDeletingBreak(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cards.filter(
      (card) =>
        (!q ||
          card.cardName.toLowerCase().includes(q) ||
          card.spotName.toLowerCase().includes(q)) &&
        (!missingOnly || !images[normalise(card.cardName)])
    )
  }, [cards, search, missingOnly, images])

  const groupedCards = useMemo(() => {
    const groups = new Map<string, { label: string; cards: CardVariant[] }>()
    filtered.forEach((card) => {
      const key = canonicalSpotKey(card.spotName)
      const cleanLabel = String(card.spotName || '')
        .replace(/^[^\p{L}\p{N}'’]+/u, '')
        .trim()

      const existing = groups.get(key)
      if (existing) {
        existing.cards.push(card)
      } else {
        groups.set(key, { label: cleanLabel, cards: [card] })
      }
    })
    return groups
  }, [filtered])

  const uploaded = cards.filter((card) => images[normalise(card.cardName)]).length

  function toggleGroup(name: string) {
    setExpandedGroups((old) => ({ ...old, [name]: !old[name] }))
  }

  return (
    <AdminGuard>
      <main className="page">
        <style jsx global>{`
          * { box-sizing: border-box; }
          body { margin: 0; }
          .page {
            min-height: 100vh;
            padding: 28px;
            color: #fff;
            background: radial-gradient(circle at top, #17177e 0%, #080641 45%, #02021e 100%);
          }
          .wrap { max-width: 1180px; margin: 0 auto; }
          .back { color: #c9c8ff; text-decoration: none; font-weight: 850; }
          .hero { margin: 22px 0; }
          .hero h1 { margin: 0; font-size: clamp(2rem, 5vw, 3.7rem); font-weight: 950; }
          .hero p { color: rgba(255,255,255,.68); font-weight: 750; }
          .latest-note {
            display: inline-flex;
            margin-top: 4px;
            padding: 8px 11px;
            border-radius: 999px;
            background: rgba(124,58,237,.22);
            border: 1px solid rgba(192,132,252,.35);
            color: #e9ddff;
            font-size: .82rem;
            font-weight: 900;
          }
          .tools { display: flex; gap: 10px; margin: 18px 0; flex-wrap: wrap; }
          .search {
            flex: 1; min-width: 240px; padding: 13px 15px;
            border: 1px solid rgba(255,255,255,.16); border-radius: 14px;
            background: rgba(255,255,255,.08); color: #fff; font-weight: 800; outline: none;
          }
          .toggle {
            padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.16);
            background: rgba(255,255,255,.08); color: #fff; font-weight: 900; cursor: pointer;
          }
          .toggle.active { background: #7c3aed; }
          .list { display: grid; gap: 10px; }
          .group-block {
            border: 1px solid rgba(255,255,255,.13);
            border-radius: 18px;
            background: rgba(255,255,255,.055);
            overflow: hidden;
          }
          .group-toggle {
            width: 100%; display:flex; align-items:center; justify-content:space-between; gap:16px;
            padding: 16px 18px; border:0; background:rgba(255,255,255,.035); color:#fff;
            font:inherit; cursor:pointer; text-align:left;
          }
          .group-toggle:hover { background:rgba(255,255,255,.07); }
          .group-title { font-weight:950; font-size:1rem; }
          .group-meta { margin-top:4px; color:rgba(255,255,255,.58); font-size:.8rem; font-weight:800; }
          .group-chevron { font-size:1rem; transition:transform .18s ease; }
          .group-chevron.open { transform:rotate(180deg); }
          .group-children { display:grid; gap:8px; padding:10px; border-top:1px solid rgba(255,255,255,.10); }
          .group-children .row { background:rgba(0,0,0,.12); }
          .row {
            display: grid; grid-template-columns: 92px 1fr auto; gap: 16px; align-items: center;
            padding: 12px; border: 1px solid rgba(255,255,255,.13); border-radius: 18px;
            background: rgba(255,255,255,.065);
          }
          .preview {
            width: 72px; height: 100px; border-radius: 9px; background: rgba(255,255,255,.07);
            display: flex; align-items: center; justify-content: center; overflow: hidden;
            color: rgba(255,255,255,.35); font-size: .75rem; font-weight: 900;
          }
          .preview img { width: 100%; height: 100%; object-fit: contain; }
          .spot { font-weight: 950; font-size: 1rem; }
          .saved { margin-top: 5px; color: #9fffb8; font-size: .82rem; font-weight: 850; }
          .missing { margin-top: 5px; color: #c9c8ff; font-size: .82rem; font-weight: 850; }
          .actions { display: flex; gap: 8px; align-items: center; }
          .upload {
            display: inline-block; padding: 10px 13px; border-radius: 12px;
            background: linear-gradient(135deg,#7c3aed,#c084fc); font-weight: 950;
            cursor: pointer; white-space: nowrap;
          }
          .upload input { display: none; }
          .remove, .delete-break {
            padding: 10px 12px; border-radius: 12px;
            border: 1px solid rgba(255,255,255,.15);
            background: transparent; color: #fff; font-weight: 850; cursor: pointer;
          }
          .message { margin: 14px 0; color: #ddd9ff; font-weight: 850; }
          .break-manager {
            margin-top: 30px; padding: 18px;
            border: 1px solid rgba(255,255,255,.13);
            border-radius: 22px; background: rgba(255,255,255,.055);
          }
          .break-manager h2 { margin: 0 0 5px; font-size: 1.25rem; }
          .break-manager > p { margin: 0 0 14px; color: rgba(255,255,255,.6); font-weight: 700; }
          .break-list { display: grid; gap: 8px; }
          .break-item {
            display: flex; justify-content: space-between; align-items: center; gap: 14px;
            padding: 12px 14px; border-radius: 14px; background: rgba(0,0,0,.16);
          }
          .break-title { font-weight: 900; }
          .break-date { margin-top: 3px; color: rgba(255,255,255,.55); font-size: .8rem; font-weight: 750; }
          .latest-badge {
            display: inline-block; margin-left: 8px; padding: 4px 7px; border-radius: 999px;
            background: #7c3aed; color: white; font-size: .68rem; font-weight: 950;
          }
          .delete-break {
            border-color: rgba(255,90,90,.35); color: #ffb1b1;
          }
          .delete-break:disabled { opacity: .5; cursor: wait; }
          @media(max-width:650px) {
            .page { padding: 16px; }
            .row { grid-template-columns: 68px 1fr; }
            .preview { width: 58px; height: 81px; }
            .actions { grid-column: 1/-1; }
            .actions > * { flex: 1; text-align: center; }
            .break-item { align-items: flex-start; flex-direction: column; }
            .delete-break { width: 100%; }
          }
        `}</style>

        <div className="wrap">
          <Link href="/admin/sets" className="back">← Back to Set Library</Link>

          <div className="hero">
            <h1>{setName}</h1>
            <p>{uploaded} / {cards.length} card images saved permanently across {spots.length} spots.</p>
            {latestBreakId && (
              <div className="latest-note">
                Spot list is taken from the newest version of this set only.
              </div>
            )}
          </div>

          <div className="tools">
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards or spots..."
            />
            <button
              className={`toggle ${missingOnly ? 'active' : ''}`}
              onClick={() => setMissingOnly(!missingOnly)}
            >
              Missing images only
            </button>
          </div>

          {message && <div className="message">{message}</div>}

          <div className="list">
            {Array.from(groupedCards.entries()).map(([spotKey, group]) => {
              const spotName = group.label
              const groupCards = group.cards
              const ascendedGroup = isAscendedSet(setName) ? getAscendedGroup(spotName) : undefined

              const renderCard = (card: CardVariant) => {
                const key = normalise(card.cardName)
                const url = images[key]

                return (
                  <div className="row" key={`${canonicalSpotKey(card.spotName)}::${key}`}>
                    <div className="preview">
                      {url ? <img src={url} alt={card.cardName} /> : 'NO IMAGE'}
                    </div>

                    <div>
                      <div className="spot">{card.cardName}</div>
                      <div className="missing" style={{ marginBottom: 4 }}>
                        Spot: {card.spotName}
                      </div>
                      <div className={url ? 'saved' : 'missing'}>
                        {url ? '✓ Image saved' : 'Image needed'}
                      </div>
                    </div>

                    <div className="actions">
                      <label className="upload">
                        {uploading === key ? 'Uploading...' : url ? 'Replace' : 'Add image'}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploading === key}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            uploadImage(card.cardName, file)
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>

                      {url && (
                        <button className="remove" onClick={() => removeImage(card.cardName)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )
              }

              if (!ascendedGroup) {
                return groupCards.map(renderCard)
              }

              const open =
                expandedGroups[spotName] ||
                search.trim().length > 0 ||
                missingOnly

              const savedCount = groupCards.filter((card) => images[normalise(card.cardName)]).length

              return (
                <div className="group-block" key={spotName}>
                  <button className="group-toggle" type="button" onClick={() => toggleGroup(spotName)}>
                    <div>
                      <div className="group-title">{spotName}</div>
                      <div className="group-meta">
                        {savedCount} / {groupCards.length} images saved
                      </div>
                    </div>
                    <span className={`group-chevron ${open ? 'open' : ''}`}>▼</span>
                  </button>

                  {open && (
                    <div className="group-children">
                      {groupCards.map(renderCard)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <section className="break-manager">
            <h2>Breaks in this set</h2>
            <p>
              The newest break supplies the current spot list. Older breaks remain here for history
              until you delete them.
            </p>

            <div className="break-list">
              {breaks.map((row) => (
                <div className="break-item" key={row.id}>
                  <div>
                    <div className="break-title">
                      {row.break_name || 'Untitled Break'}
                      {row.id === latestBreakId && <span className="latest-badge">CURRENT SPOTS</span>}
                    </div>
                    <div className="break-date">
                      {formatDate(row.stream_datetime || row.created_at)}
                    </div>
                  </div>

                  <button
                    className="delete-break"
                    disabled={deletingBreak === row.id}
                    onClick={() => deleteBreak(row)}
                  >
                    {deletingBreak === row.id ? 'Deleting...' : 'Delete Break'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AdminGuard>
  )
}
