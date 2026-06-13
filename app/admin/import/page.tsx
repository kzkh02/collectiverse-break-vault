'use client'

import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import AdminGuard from '../../guard'

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normaliseName(name: string) {
  return name.trim().toLowerCase()
}

function todayDate() {
  return new Date().toISOString().split('T')[0]
}

type ImportMode = 'create_new' | 'merge_existing'

type ParsedRow = {
  Title: string
  Product: string
  Username: string
  [key: string]: any
}

type BreakPreview = {
  breakName: string
  rows: ParsedRow[]
  spots: number
  collectors: number
}

export default function ImportPage() {
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'preview' | 'importing' | 'done' | 'error'>('idle')
  const [streamDate, setStreamDate] = useState(todayDate())
  const [streamTime, setStreamTime] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [skipped, setSkipped] = useState(0)
  const [importMode, setImportMode] = useState<ImportMode>('create_new')
  const [createdBreaks, setCreatedBreaks] = useState<any[]>([])

  const streamDateTime = streamDate && streamTime ? `${streamDate}T${streamTime}:00` : ''

  const breakPreviews = useMemo<BreakPreview[]>(() => {
    const grouped = new Map<string, ParsedRow[]>()

    rows.forEach((row) => {
      const breakName = clean(row.Title) || 'Untitled Break'
      const current = grouped.get(breakName) || []
      current.push(row)
      grouped.set(breakName, current)
    })

    return Array.from(grouped.entries()).map(([breakName, groupedRows]) => ({
      breakName,
      rows: groupedRows,
      spots: groupedRows.length,
      collectors: new Set(groupedRows.map((row) => normaliseName(clean(row.Username)))).size,
    }))
  }, [rows])

  const totalCollectors = useMemo(() => {
    return new Set(rows.map((row) => normaliseName(clean(row.Username)))).size
  }, [rows])

  function resetImport() {
    setMessage('')
    setStatus('idle')
    setFileName('')
    setRows([])
    setSkipped(0)
    setCreatedBreaks([])
  }

  function handleFile(file: File) {
    setMessage('Reading CSV...')
    setStatus('idle')
    setFileName(file.name)
    setCreatedBreaks([])

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results: any) => {
        const parsedRows = (results.data || []) as ParsedRow[]

        const allValidRows = parsedRows.filter((row) => {
          return clean(row.Title) && clean(row.Product) && clean(row.Username)
        })

        const spotRows = allValidRows.filter((row) => {
          const product = clean(row.Product)
          return !product.startsWith('#')
        })

        const skippedRows = allValidRows.length - spotRows.length

        if (spotRows.length === 0) {
          setRows([])
          setSkipped(skippedRows)
          setStatus('error')
          setMessage('No valid spot rows found. Check the CSV has Title, Product and Username columns.')
          return
        }

        setRows(spotRows)
        setSkipped(skippedRows)
        setStatus('preview')
        setMessage(`Ready to import ${spotRows.length} spots across ${new Set(spotRows.map((row) => clean(row.Title))).size} break(s).`)
      },
      error: (error) => {
        setStatus('error')
        setMessage(`CSV error: ${error.message}`)
      },
    })
  }

  async function getOrCreateCollector(username: string) {
    const usernameNormalised = normaliseName(username)

    const existingCollector = await supabase
      .from('collectors')
      .select('id')
      .eq('whatnot_name_normalized', usernameNormalised)
      .maybeSingle()

    if (existingCollector.data) return String(existingCollector.data.id)

    const newCollector = await supabase
      .from('collectors')
      .insert({
        whatnot_name: username,
        whatnot_name_normalized: usernameNormalised,
      })
      .select('id')
      .single()

    if (newCollector.error || !newCollector.data) {
      throw new Error(newCollector.error?.message || 'Collector could not be created')
    }

    return String(newCollector.data.id)
  }

  async function createOrFindBreak(breakName: string) {
    if (importMode === 'merge_existing') {
      const existingBreak = await supabase
        .from('breaks')
        .select('id, break_name, stream_datetime, status')
        .eq('break_name', breakName)
        .eq('stream_datetime', streamDateTime)
        .maybeSingle()

      if (existingBreak.data) return existingBreak.data
    }

    const newBreak = await supabase
      .from('breaks')
      .insert({
        break_name: breakName,
        status: 'open',
        stream_datetime: streamDateTime,
      })
      .select('id, break_name, stream_datetime, status')
      .single()

    if (newBreak.error || !newBreak.data) {
      throw new Error(newBreak.error?.message || 'Break could not be created')
    }

    return newBreak.data
  }

  async function runImport() {
    if (!streamDate || !streamTime) {
      setMessage('Please enter the stream date and time first.')
      setStatus('error')
      return
    }

    if (rows.length === 0) {
      setMessage('Please choose a CSV file first.')
      setStatus('error')
      return
    }

    const confirmed = window.confirm(
      `Import ${rows.length} spots across ${breakPreviews.length} break(s)?\n\nMode: ${
        importMode === 'create_new' ? 'Always create new breaks' : 'Merge only if same name and exact stream time exists'
      }`
    )

    if (!confirmed) return

    setStatus('importing')
    setMessage('Importing...')

    let imported = 0
    let failed = 0
    const createdOrUsedBreaks: any[] = []
    const breakIdByName = new Map<string, string>()

    try {
      for (const preview of breakPreviews) {
        const breakRecord = await createOrFindBreak(preview.breakName)
        breakIdByName.set(preview.breakName, String(breakRecord.id))
        createdOrUsedBreaks.push(breakRecord)
      }

      for (const row of rows) {
        const breakName = clean(row.Title)
        const spotName = clean(row.Product)
        const username = clean(row.Username)
        const breakId = breakIdByName.get(breakName)

        if (!breakId) {
          failed++
          continue
        }

        try {
          const collectorId = await getOrCreateCollector(username)

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
        } catch {
          failed++
        }
      }

      await supabase.from('csv_imports').insert({
        filename: fileName || 'Unknown file',
        rows_imported: imported,
      })

      setCreatedBreaks(createdOrUsedBreaks)
      setStatus('done')
      setMessage(
        `Imported ${imported} spots across ${createdOrUsedBreaks.length} break(s). Skipped ${skipped} non-spots. Failed ${failed}.`
      )
    } catch (error: any) {
      setStatus('error')
      setMessage(error?.message || 'Import failed.')
    }
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
          font-size: 0.95rem;
        }

        .wrap {
          max-width: 1100px;
          margin: 0 auto;
        }

        .header {
          margin-bottom: 20px;
        }

        .eyebrow {
          opacity: .7;
          font-size: .74rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 950;
          margin-bottom: 8px;
        }

        .header h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3.4rem);
          font-weight: 950;
          letter-spacing: -1px;
        }

        .header p {
          margin: 8px 0 0;
          opacity: .82;
          max-width: 720px;
          line-height: 1.5;
        }

        .panel {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 22px;
          padding: 18px;
          box-shadow: 0 18px 56px rgba(0,0,0,.28);
          margin-bottom: 16px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .field label {
          display: block;
          margin-bottom: 7px;
          font-size: .76rem;
          opacity: .7;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 950;
        }

        .input, .select, .file {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.22);
          color: white;
          padding: 12px 13px;
          font-weight: 800;
          outline: none;
        }

        .file::file-selector-button {
          border: none;
          border-radius: 999px;
          padding: 9px 12px;
          margin-right: 10px;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          color: white;
          font-weight: 950;
          cursor: pointer;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }

        .button {
          border: none;
          border-radius: 999px;
          padding: 11px 16px;
          color: white;
          background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.16);
          font-weight: 950;
          cursor: pointer;
        }

        .button-primary {
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 14px 28px rgba(124,58,237,.32);
        }

        .button-danger {
          background: rgba(239,68,68,.18);
          border-color: rgba(248,113,113,.45);
        }

        .button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .stat {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 18px;
          padding: 14px;
        }

        .stat-label {
          opacity: .65;
          font-size: .7rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .stat-value {
          font-size: 1.7rem;
          font-weight: 950;
          margin-top: 4px;
        }

        .message {
          white-space: pre-line;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.06);
          border-radius: 18px;
          padding: 14px;
          font-weight: 850;
          margin-bottom: 16px;
        }

        .message.error {
          border-color: rgba(248,113,113,.5);
          background: rgba(239,68,68,.14);
        }

        .preview-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .preview-row, .created-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: center;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          border-radius: 16px;
          padding: 13px 14px;
        }

        .preview-title {
          font-weight: 950;
        }

        .preview-meta {
          opacity: .75;
          font-size: .84rem;
          margin-top: 4px;
        }

        .pill {
          display: inline-block;
          padding: 7px 11px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.08);
          font-size: .78rem;
          font-weight: 950;
          white-space: nowrap;
        }

        .section-title {
          font-size: 1.15rem;
          margin: 0 0 12px;
          font-weight: 950;
        }

        a {
          color: inherit;
        }

        @media (max-width: 760px) {
          .page { padding: 14px; }
          .grid, .stats { grid-template-columns: 1fr; }
          .preview-row, .created-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      <div className="wrap">
        <header className="header">
          <div className="eyebrow">Collectiverse Admin</div>
          <h1>Import Whatnot CSV</h1>
          <p>
            Upload a stream CSV, preview the breaks inside it, then import safely. Multiple breaks in one CSV are split by Title, and same-name streams no longer merge unless you choose merge mode.
          </p>
        </header>

        <section className="panel">
          <div className="grid">
            <div className="field">
              <label>Stream Date</label>
              <input className="input" type="date" value={streamDate} onChange={(e) => setStreamDate(e.target.value)} />
            </div>

            <div className="field">
              <label>Stream Time</label>
              <input className="input" type="time" value={streamTime} onChange={(e) => setStreamTime(e.target.value)} />
            </div>

            <div className="field">
              <label>Import Mode</label>
              <select className="select" value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)}>
                <option value="create_new">Always create new breaks</option>
                <option value="merge_existing">Merge only same name + exact time</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>CSV File</label>
            <input
              className="file"
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>

          <div className="actions">
            <button className="button button-primary" disabled={rows.length === 0 || status === 'importing'} onClick={runImport}>
              {status === 'importing' ? 'Importing...' : 'Import CSV'}
            </button>
            <button className="button" onClick={resetImport}>Reset</button>
            <Link className="button" href="/admin/breaks">Back to Breaks</Link>
          </div>
        </section>

        {message && <div className={`message ${status === 'error' ? 'error' : ''}`}>{message}</div>}

        {rows.length > 0 && (
          <div className="stats">
            <div className="stat"><div className="stat-label">File</div><div className="stat-value" style={{ fontSize: '1rem' }}>{fileName}</div></div>
            <div className="stat"><div className="stat-label">Spots</div><div className="stat-value">{rows.length}</div></div>
            <div className="stat"><div className="stat-label">Breaks</div><div className="stat-value">{breakPreviews.length}</div></div>
            <div className="stat"><div className="stat-label">Collectors</div><div className="stat-value">{totalCollectors}</div></div>
          </div>
        )}

        {breakPreviews.length > 0 && (
          <section className="panel">
            <h2 className="section-title">Break Preview</h2>
            <div className="preview-list">
              {breakPreviews.map((preview) => (
                <div className="preview-row" key={preview.breakName}>
                  <div>
                    <div className="preview-title">{preview.breakName}</div>
                    <div className="preview-meta">{preview.collectors} collector(s)</div>
                  </div>
                  <div className="pill">{preview.spots} spots</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {createdBreaks.length > 0 && (
          <section className="panel">
            <h2 className="section-title">Imported Breaks</h2>
            <div className="preview-list">
              {createdBreaks.map((item) => (
                <Link className="created-row" key={item.id} href={`/admin/breaks/${item.id}`}>
                  <div>
                    <div className="preview-title">{item.break_name}</div>
                    <div className="preview-meta">Click to mark hits</div>
                  </div>
                  <div className="pill">Open Break</div>
                </Link>
              ))}
            </div>
          </section>
        )}
         </div>
    </main>
  </AdminGuard>
  )
}
