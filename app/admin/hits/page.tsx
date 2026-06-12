'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Entry = {
  id: string
  spot_name: string
  is_hit: boolean
  hit_name: string | null
  hit_tier: string | null
  collector_id: string
  break_id: string
}

const tiers = [
  { id: 'reverse_holo', label: 'Reverse Holo' },
  { id: 'ex', label: 'EX' },
  { id: 'sr', label: 'SR' },
  { id: 'mar', label: 'MAR' },
  { id: 'sir', label: 'SIR' },
  { id: 'gold', label: 'Gold' },
  { id: 'chase_hit', label: 'Chase Hit' },
]

export default function AdminHitsPage() {
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [message, setMessage] = useState('')

  async function loadEntries() {
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .ilike('spot_name', `%${search}%`)
      .limit(50)

    if (error) {
      setMessage(error.message)
      return
    }

    setEntries(data || [])
  }

  async function markHit(entryId: string, spotName: string, tier: string) {
    const { error } = await supabase
      .from('entries')
      .update({
        is_hit: true,
        hit_name: spotName,
        hit_tier: tier,
        revealed_at: new Date().toISOString(),
      })
      .eq('id', entryId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Hit saved!')
    loadEntries()
  }

  useEffect(() => {
    loadEntries()
  }, [])

  return (
    <main style={{ padding: 40 }}>
      <h1>Mark Hits</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search spot name, e.g. Budew"
        style={{ padding: 10, width: 300 }}
      />

      <button onClick={loadEntries} style={{ marginLeft: 10, padding: 10 }}>
        Search
      </button>

      <p>{message}</p>

      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            border: '1px solid #ddd',
            padding: 16,
            marginTop: 12,
            borderRadius: 8,
          }}
        >
          <strong>{entry.spot_name}</strong>
          <p>Status: {entry.is_hit ? 'Hit' : 'Not hit yet'}</p>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                markHit(entry.id, entry.spot_name, e.target.value)
              }
            }}
          >
            <option value="">Mark as hit...</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </main>
  )
}