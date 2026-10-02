'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import AdminGuard from '../guard'

type BreakRow = { id: string; break_name: string | null; stream_datetime?: string | null; created_at?: string | null }
type EntryRow = { break_id: string; spot_name: string }
type ImageRow = { set_name_normalized: string; hit_name_normalized: string }

type SetSummary = {
  name: string
  key: string
  breakCount: number
  spots: Set<string>
  images: Set<string>
}

function getSetName(name: string | null) {
  return String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Break\s+\d+/i, '')
    .trim()
}

function normalise(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
}


type CardVariant = { cardName: string }

const ASCENDED_IMAGE_CHILDREN: Record<string, string[]> = {
  "all other ex's": [
    'Dragapult EX', 'Mega Lucario EX', "Cynthia's Garchomp EX", 'Cinderace EX',
    "Erika's Vileplume EX", 'Azumarill EX', "Team Rocket's Kangaskhan EX",
    'Mega Gardevoir EX', "Ethan's Ho-Oh EX", 'Zangoose EX', 'Registeel EX',
    "Larry's Dudunsparce EX", "Hop's Pincurchin EX", 'Koraidon EX', 'Voltorb EX',
    'Regice EX', 'Togedemaru EX', 'Miraidon EX', 'Mandibuzz EX', 'Terapagos EX', 'Regirock EX',
  ],
  'all items': ['Ultra Ball', "N's PP Up", "Team Rocket's Transceiver", 'Glass Trumpet'],
  'all trainers': ["Boss's Orders", 'Anthea & Concordia', 'Cheren'],
  'all other trainers': ["Boss's Orders", 'Anthea & Concordia', 'Cheren'],
}

function isAscendedSet(value: string) {
  return normalise(value).includes('ascended')
}

function ascendedChildren(spotName: string) {
  const key = normalise(spotName)
  if (key === 'all other exs') return ASCENDED_IMAGE_CHILDREN["all other ex's"]
  return ASCENDED_IMAGE_CHILDREN[key]
}

function cleanDisplayCardName(value: string) {
  return String(value || '')
    .replace(/^[^\p{L}\p{N}'’]+/u, '')
    .replace(/\s+\((?:SIR|IR|SR|MAR|Gold|EX)\)\s*$/i, '')
    .trim()
}

// This intentionally mirrors /admin/sets/[set]. The counter and the set detail
// page therefore use the exact same definition of "an image card".
function parseSpotVariants(spotName: string): CardVariant[] {
  const clean = String(spotName || '').replace(/ · Extra Hit \d+$/i, '').trim()
  const displayClean = cleanDisplayCardName(clean)

  if (
    normalise(displayClean).includes('blastoise ex') &&
    normalise(displayClean).includes('venusaur ex')
  ) {
    return [{ cardName: 'Blastoise EX' }, { cardName: 'Venusaur EX' }]
  }

  const match = clean.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (!match) return [{ cardName: cleanDisplayCardName(clean) }]

  const baseName = cleanDisplayCardName(match[1])
  const inside = match[2].trim()

  if (/^(SIR|IR|SR|MAR|Gold|EX)$/i.test(inside)) {
    return [{ cardName: baseName }]
  }

  const variants = inside.split(',').map((item) => item.trim()).filter(Boolean)
  if (!variants.length) return [{ cardName: baseName }]
  return variants.map((variant) => ({ cardName: `${baseName} ${variant}`.trim() }))
}

function imageNamesForSet(set: SetSummary) {
  const names: string[] = []
  const ascended = isAscendedSet(set.name)

  Array.from(set.spots).forEach((spot) => {
    const children = ascended ? ascendedChildren(spot) : undefined

    // These three Ascended rows are selectors/dropdown parents only. They do
    // NOT need images themselves. Only their individual child cards count.
    if (children) {
      names.push(...children)
      return
    }

    const key = normalise(spot)
    if (ascended && (
      key === "all other ex's" || key === 'all other exs' ||
      key === 'all items' || key === 'all trainers' || key === 'all other trainers'
    )) return

    names.push(...parseSpotVariants(spot).map((card) => card.cardName))
  })

  // Always expose the three Ascended dropdowns, exactly like the detail page,
  // even if an older import used slightly different parent wording.
  if (ascended) {
    Object.values(ASCENDED_IMAGE_CHILDREN).forEach((children) => names.push(...children))
  }

  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)))
}

export default function SetLibraryPage() {
  const [sets, setSets] = useState<SetSummary[]>([])
  const [message, setMessage] = useState('Loading set library...')
  const [search, setSearch] = useState('')

  async function loadSets() {
    setMessage('Loading set library...')

    const { data: breaksData, error: breaksError } = await supabase
      .from('breaks')
      .select('*')

    if (breaksError) {
      setMessage(breaksError.message || 'Could not load sets.')
      return
    }

    const grouped = new Map<string, BreakRow[]>()
    ;((breaksData || []) as BreakRow[]).forEach((item) => {
      const name = getSetName(item.break_name)
      if (!name) return
      const key = normalise(name)
      const list = grouped.get(key) || []
      list.push(item)
      grouped.set(key, list)
    })

    const map = new Map<string, SetSummary>()
    const latestBreakToSet = new Map<string, { name: string; key: string }>()

    grouped.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => {
        const aTime = new Date(a.stream_datetime || a.created_at || 0).getTime()
        const bTime = new Date(b.stream_datetime || b.created_at || 0).getTime()
        if (bTime !== aTime) return bTime - aTime
        return String(b.break_name || '').localeCompare(String(a.break_name || ''), undefined, { numeric: true })
      })

      const latest = sorted[0]
      const name = getSetName(latest.break_name)
      map.set(key, { name, key, breakCount: list.length, spots: new Set(), images: new Set() })
      latestBreakToSet.set(latest.id, { name, key })
    })

    // Fetch every entry/image row, not just Supabase's first 1,000 rows.
    // Only entries belonging to each set's newest break are used, matching
    // /admin/sets/[set] exactly.
    const entriesData: EntryRow[] = []
    const imagesData: ImageRow[] = []
    const PAGE_SIZE = 1000

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('entries')
        .select('break_id, spot_name')
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        setMessage(error.message || 'Could not load set entries.')
        return
      }
      const rows = (data || []) as EntryRow[]
      entriesData.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('hit_images')
        .select('set_name_normalized, hit_name_normalized')
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        setMessage(error.message || 'Could not load saved images.')
        return
      }
      const rows = (data || []) as ImageRow[]
      imagesData.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }

    entriesData.forEach((entry) => {
      const setInfo = latestBreakToSet.get(entry.break_id)
      if (!setInfo) return
      const cleanSpot = String(entry.spot_name || '').replace(/ · Extra Hit \d+$/i, '').trim()
      if (cleanSpot) map.get(setInfo.key)?.spots.add(cleanSpot)
    })

    imagesData.forEach((image) => {
      const set = map.get(normalise(image.set_name_normalized))
      if (set) set.images.add(normalise(image.hit_name_normalized))
    })

    setSets(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)))
    setMessage('')
  }

  useEffect(() => { loadSets() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return !q ? sets : sets.filter((set) => set.name.toLowerCase().includes(q))
  }, [sets, search])

  return (
    <AdminGuard>
      <main className="sets-page">
        <style jsx global>{`
          * { box-sizing: border-box; }
          body { margin: 0; }
          .sets-page { min-height:100vh; padding:28px; color:#fff; background:radial-gradient(circle at top,#17177e 0%,#080641 45%,#02021e 100%); font-family:inherit; }
          .sets-wrap { max-width:1180px; margin:0 auto; }
          .back { color:#c9c8ff; text-decoration:none; font-weight:850; }
          .hero { display:flex; justify-content:space-between; gap:20px; align-items:flex-end; margin:22px 0; }
          .hero h1 { margin:0; font-size:clamp(2.2rem,5vw,4rem); font-weight:950; letter-spacing:-1.5px; }
          .hero p { margin:8px 0 0; color:rgba(255,255,255,.68); font-weight:700; }
          .search { width:min(420px,100%); padding:14px 16px; border-radius:16px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.08); color:#fff; font-weight:800; outline:none; }
          .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
          .set-card { display:block; padding:20px; border-radius:22px; text-decoration:none; color:#fff; border:1px solid rgba(255,255,255,.15); background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.045)); box-shadow:0 18px 45px rgba(0,0,0,.25); transition:.18s ease; }
          .set-card:hover { transform:translateY(-3px); border-color:rgba(192,132,252,.7); }
          .set-name { font-size:1.3rem; font-weight:950; }
          .meta { margin-top:7px; color:rgba(255,255,255,.64); font-weight:750; }
          .progress { height:9px; background:rgba(255,255,255,.10); border-radius:999px; overflow:hidden; margin:16px 0 8px; }
          .progress > div { height:100%; background:linear-gradient(90deg,#7c3aed,#d8b4fe); }
          .progress-label { display:flex; justify-content:space-between; color:#ddd9ff; font-size:.85rem; font-weight:850; }
          .message { margin-top:20px; color:#ddd9ff; font-weight:800; }
          @media(max-width:700px){ .sets-page{padding:18px}.hero{align-items:stretch;flex-direction:column}.search{width:100%} }
        `}</style>

        <div className="sets-wrap">
          <Link href="/admin/breaks" className="back">← Back to Breaks</Link>
          <div className="hero">
            <div>
              <h1>Set Library</h1>
              <p>Automatically built from every set you have imported.</p>
            </div>
            <input className="search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search sets..." />
          </div>

          <div className="grid">
            {filtered.map((set) => {
              const imageNames = imageNamesForSet(set)
              const uploaded = imageNames.filter((name) => set.images.has(normalise(name))).length
              const total = imageNames.length
              const percent = total ? Math.round((uploaded / total) * 100) : 0
              return (
                <Link key={set.key} href={`/admin/sets/${encodeURIComponent(set.key)}`} className="set-card">
                  <div className="set-name">{set.name}</div>
                  <div className="meta">{set.breakCount} break{set.breakCount === 1 ? '' : 's'} · {total} image cards</div>
                  <div className="progress"><div style={{ width: `${percent}%` }} /></div>
                  <div className="progress-label"><span>{uploaded} / {total} images</span><span>{percent}%</span></div>
                </Link>
              )
            })}
          </div>
          {message && <div className="message">{message}</div>}
        </div>
      </main>
    </AdminGuard>
  )
}
