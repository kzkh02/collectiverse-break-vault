'use client'

import Papa from 'papaparse'
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normaliseName(name: string) {
  return name.trim().toLowerCase()
}

export default function ImportPage() {
  const [message, setMessage] = useState('')
  const [streamDate, setStreamDate] = useState('')
  const [streamTime, setStreamTime] = useState('')

  async function handleFile(file: File) {
    if (!streamDate || !streamTime) {
      setMessage('Please enter the stream date and time first.')
      return
    }

    const streamDateTime = `${streamDate}T${streamTime}:00`

    setMessage('Importing CSV...')

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: async (results: any) => {
        const allRows = results.data.filter((row: any) => {
          return clean(row.Title) && clean(row.Product) && clean(row.Username)
        })

        const rows = allRows.filter((row: any) => {
          const product = clean(row.Product)
          return !product.startsWith('#')
        })

        const skipped = allRows.length - rows.length

        if (rows.length === 0) {
          setMessage('No valid rows found in this CSV.')
          return
        }

        let imported = 0
        let failed = 0

        const firstBreakName = clean(rows[0].Title)

        const { data: newBreak, error: newBreakError } = await supabase
          .from('breaks')
          .insert({
            break_name: firstBreakName,
            status: 'open',
            stream_datetime: streamDateTime,
          })
          .select('id')
          .single()

        if (newBreakError) {
          setMessage(`Break error: ${newBreakError.message}`)
          return
        }

        const breakId = newBreak.id

        for (const row of rows) {
          const spotName = clean(row.Product)
          const username = clean(row.Username)
          const usernameNormalised = normaliseName(username)

          let collectorId = null

          const existingCollector = await supabase
            .from('collectors')
            .select('id')
            .eq('whatnot_name_normalized', usernameNormalised)
            .maybeSingle()

          if (existingCollector.data) {
            collectorId = existingCollector.data.id
          } else {
            const newCollector = await supabase
              .from('collectors')
              .insert({
                whatnot_name: username,
                whatnot_name_normalized: usernameNormalised,
              })
              .select('id')
              .single()

            if (newCollector.error) {
              failed++
              continue
            }

            collectorId = newCollector.data.id
          }

          const entry = await supabase.from('entries').insert({
            break_id: breakId,
            collector_id: collectorId,
            spot_name: spotName,
            is_hit: false,
          })

          if (entry.error) {
            failed++
            continue
          }

          imported++
        }

        await supabase.from('csv_imports').insert({
          filename: file.name,
          rows_imported: imported,
        })

        setMessage(
          `Created new break and imported ${imported} entries. Skipped ${skipped} non-spots. Failed ${failed}.`
        )
      },
    })
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>Import Whatnot CSV</h1>

      <div style={{ marginBottom: 16 }}>
        <label>
          Stream Date:{' '}
          <input
            type="date"
            value={streamDate}
            onChange={(e) => setStreamDate(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          Stream Time:{' '}
          <input
            type="time"
            value={streamTime}
            onChange={(e) => setStreamTime(e.target.value)}
          />
        </label>
      </div>

      <input
        type="file"
        accept=".csv"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      <p>{message}</p>
    </main>
  )
}