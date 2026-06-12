'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

const tiers = [
  { id: '', label: 'Not hit' },
  { id: 'reverse_holo', label: 'Reverse Holo' },
  { id: 'ex', label: 'EX' },
  { id: 'sr', label: 'SR' },
  { id: 'ir', label: 'IR' },
  { id: 'mar', label: 'MAR' },
  { id: 'gold', label: 'Gold' },
  { id: 'sir', label: 'SIR' },
]

export default function BreakPage() {
  const params = useParams()
  const breakId = params.id as string

  const [breakName, setBreakName] = useState('')
  const [breakStatus, setBreakStatus] = useState('')
  const [entries, setEntries] = useState<any[]>([])
  const [message, setMessage] = useState('')

  const totalSpots = entries.length
  const hitsMarked = entries.filter((entry) => entry.is_hit).length
  const remaining = totalSpots - hitsMarked

  async function loadData() {
    const { data: breakData, error: breakError } = await supabase
      .from('breaks')
      .select('*')
      .eq('id', breakId)
      .single()

    if (breakError) {
      setMessage(`Break error: ${breakError.message}`)
      return
    }

    setBreakName(breakData?.break_name || '')
    setBreakStatus(breakData?.status || 'open')

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
      ...new Set((entriesData || []).map((entry) => entry.collector_id)),
    ]

    const { data: collectorsData } = await supabase
      .from('collectors')
      .select('id, whatnot_name')
      .in('id', collectorIds)

    const collectorsById = new Map(
      (collectorsData || []).map((collector) => [
        collector.id,
        collector.whatnot_name,
      ])
    )

    const entriesWithCollectors = (entriesData || []).map((entry) => ({
      ...entry,
      collector_name: collectorsById.get(entry.collector_id) || 'Unknown',
    }))

    setEntries(entriesWithCollectors)
  }

  async function updateHit(entryId: string, spotName: string, tier: string) {
    const isHit = tier !== ''

    const { error } = await supabase
      .from('entries')
      .update({
        is_hit: isHit,
        hit_name: isHit ? spotName : null,
        hit_tier: isHit ? tier : null,
        revealed_at: isHit ? new Date().toISOString() : null,
      })
      .eq('id', entryId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Saved')
    loadData()
  }

  async function featureHit(entryId: string) {
    const confirmed = window.confirm('Set this as the homepage featured hit?')

    if (!confirmed) return

    await supabase
      .from('entries')
      .update({ featured_hit: false })
      .eq('featured_hit', true)

    const { error } = await supabase
      .from('entries')
      .update({ featured_hit: true })
      .eq('id', entryId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Featured hit updated')
    loadData()
  }

  async function completeBreak() {
    const confirmed = window.confirm(
      `Complete this break?\n\nTotal spots: ${totalSpots}\nHits marked: ${hitsMarked}\nRemaining unhit spots: ${remaining}`
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('breaks')
      .update({ status: 'completed' })
      .eq('id', breakId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Break marked as completed')
    setBreakStatus('completed')
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

    setMessage('Break reopened')
    setBreakStatus('open')
  }

  useEffect(() => {
    if (breakId) loadData()
  }, [breakId])

  return (
    <main style={{ padding: 40 }}>
      <h1>{breakName || 'Break'}</h1>

      <p>Status: {breakStatus}</p>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2>Break Progress</h2>
        <p>Total Spots: {totalSpots}</p>
        <p>Hits Marked: {hitsMarked}</p>
        <p>Remaining: {remaining}</p>
      </div>

      {breakStatus === 'completed' ? (
        <button onClick={reopenBreak} style={{ padding: 10 }}>
          Reopen Break
        </button>
      ) : (
        <button onClick={completeBreak} style={{ padding: 10 }}>
          Mark Break Complete
        </button>
      )}

      <p>{message}</p>

      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 20,
            border: '1px solid #ddd',
            padding: 12,
            marginTop: 8,
            borderRadius: 8,
          }}
        >
          <div>
            <strong>{entry.spot_name}</strong>

            <div
              style={{
                marginTop: 4,
                fontSize: 14,
                opacity: 0.75,
              }}
            >
              Owner: {entry.collector_name}
            </div>

            <div style={{ marginTop: 4 }}>
              {entry.is_hit ? 'Hit' : 'Not hit'}
            </div>

            {entry.featured_hit && (
              <div
                style={{
                  color: '#facc15',
                  fontWeight: 700,
                  marginTop: 4,
                }}
              >
                ⭐ Featured Hit
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <select
              value={entry.hit_tier || ''}
              onChange={(e) =>
                updateHit(entry.id, entry.spot_name, e.target.value)
              }
            >
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.label}
                </option>
              ))}
            </select>

            {entry.is_hit && (
              <button
                onClick={() => featureHit(entry.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#facc15',
                  color: '#000',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⭐ Feature Hit
              </button>
            )}
          </div>
        </div>
      ))}
    </main>
  )
}