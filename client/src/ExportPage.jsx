import { useState, useEffect, useCallback } from 'react'
import { exportToExcel, exportToPDF } from './exportUtils'

const QUICK_OPTIONS = [
  { id: 'today',      label: 'Today' },
  { id: 'thisWeek',   label: 'This Week' },
  { id: 'thisMonth',  label: 'This Month' },
  { id: 'lastMonth',  label: 'Last Month' },
  { id: 'last3months',label: 'Last 3 Months' },
  { id: 'custom',     label: 'Custom Range' },
]

function getQuickRange(option) {
  const now = new Date()
  const fmt = d => d.toISOString().slice(0, 10)

  switch (option) {
    case 'today':
      return { from: fmt(now), to: fmt(now) }

    case 'thisWeek': {
      const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
      const mon = new Date(now); mon.setDate(now.getDate() - dow)
      return { from: fmt(mon), to: fmt(now) }
    }

    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmt(first), to: fmt(now) }
    }

    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }

    case 'last3months': {
      const first = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      return { from: fmt(first), to: fmt(now) }
    }

    default:
      return null
  }
}

function fmtDisplay(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

function fmtMoney(amount, currency) {
  return `${currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
}

export default function ExportPage({ settings }) {
  const currency = settings?.currency || 'R'

  const [quick,      setQuick]      = useState('thisMonth')
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [expenses,   setExpenses]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [exporting,  setExporting]  = useState(null)  // 'excel' | 'pdf' | null
  const [error,      setError]      = useState('')

  // Apply a quick option → set from/to
  function applyQuick(opt) {
    setQuick(opt)
    if (opt !== 'custom') {
      const range = getQuickRange(opt)
      setFrom(range.from)
      setTo(range.to)
    }
  }

  // Initialise to This Month on mount
  useEffect(() => { applyQuick('thisMonth') }, [])

  // Fetch preview whenever date range changes
  const fetchPreview = useCallback(async () => {
    if (!from || !to || from > to) { setExpenses([]); return }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ from, to })
      const res    = await fetch(`/api/expenses?${params}`)
      if (!res.ok) throw new Error('Failed to fetch expenses.')
      setExpenses(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { fetchPreview() }, [fetchPreview])

  const total      = expenses.reduce((s, e) => s + e.amount, 0)
  const canExport  = expenses.length > 0 && !loading
  const dateRange  = { from, to }

  async function handleExport(type) {
    setExporting(type)
    try {
      if (type === 'excel') {
        exportToExcel(expenses, settings, dateRange)
      } else {
        exportToPDF(expenses, settings, dateRange)
      }
    } catch (err) {
      setError(`Export failed: ${err.message}`)
    } finally {
      setTimeout(() => setExporting(null), 1200)
    }
  }

  // Category breakdown for preview
  const byCategory = {}
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  const catSummary = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="export-page">
      <div className="export-header">
        <h2 className="export-title">Export</h2>
        <p className="export-sub">Choose a date range then download your expenses as Excel or PDF</p>
      </div>

      {/* ── Quick options ── */}
      <div className="export-section">
        <div className="export-section-label">Date Range</div>
        <div className="quick-options">
          {QUICK_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`quick-btn${quick === opt.id ? ' active' : ''}`}
              onClick={() => applyQuick(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom range inputs */}
        {quick === 'custom' && (
          <div className="custom-range">
            <div className="custom-range-field">
              <label>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <span className="custom-range-sep">→</span>
            <div className="custom-range-field">
              <label>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
        )}

        {/* Date range display for non-custom */}
        {quick !== 'custom' && from && to && (
          <p className="range-display">
            {fmtDisplay(from)} → {fmtDisplay(to)}
          </p>
        )}
      </div>

      {/* ── Preview ── */}
      <div className="export-section">
        <div className="export-section-label">Preview</div>

        {loading && (
          <div className="export-preview-loading">
            <div className="scan-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            <span>Loading…</span>
          </div>
        )}

        {!loading && from && to && from > to && (
          <div className="preview-empty">⚠️ Start date must be before end date</div>
        )}

        {!loading && from && to && from <= to && expenses.length === 0 && (
          <div className="preview-empty">No expenses found in this date range</div>
        )}

        {!loading && expenses.length > 0 && (
          <div className="preview-card">
            <div className="preview-stats">
              <div className="preview-stat">
                <span className="preview-stat-value">{expenses.length}</span>
                <span className="preview-stat-label">expenses</span>
              </div>
              <div className="preview-stat-divider" />
              <div className="preview-stat">
                <span className="preview-stat-value">{fmtMoney(total, currency)}</span>
                <span className="preview-stat-label">total spend</span>
              </div>
              <div className="preview-stat-divider" />
              <div className="preview-stat">
                <span className="preview-stat-value">{Object.keys(byCategory).length}</span>
                <span className="preview-stat-label">categories</span>
              </div>
            </div>

            {/* Top categories mini breakdown */}
            {catSummary.length > 0 && (
              <div className="preview-cats">
                {catSummary.map(([cat, amt]) => (
                  <div key={cat} className="preview-cat-row">
                    <span className="preview-cat-name">{cat}</span>
                    <span className="preview-cat-amt">{fmtMoney(amt, currency)}</span>
                  </div>
                ))}
                {Object.keys(byCategory).length > 5 && (
                  <div className="preview-cat-more">
                    + {Object.keys(byCategory).length - 5} more categories
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* ── Export buttons ── */}
      <div className="export-section">
        <div className="export-section-label">Download</div>
        <div className="export-btns">

          <button
            type="button"
            className="export-btn export-btn-excel"
            disabled={!canExport || exporting !== null}
            onClick={() => handleExport('excel')}
          >
            {exporting === 'excel' ? (
              <><div className="scan-spinner export-btn-spinner" />Generating…</>
            ) : (
              <>
                <span className="export-btn-icon">📊</span>
                <div className="export-btn-text">
                  <span className="export-btn-title">Export to Excel</span>
                  <span className="export-btn-sub">.xlsx — with summary sheet</span>
                </div>
              </>
            )}
          </button>

          <button
            type="button"
            className="export-btn export-btn-pdf"
            disabled={!canExport || exporting !== null}
            onClick={() => handleExport('pdf')}
          >
            {exporting === 'pdf' ? (
              <><div className="scan-spinner export-btn-spinner" style={{ borderTopColor: '#ef4444' }} />Generating…</>
            ) : (
              <>
                <span className="export-btn-icon">📄</span>
                <div className="export-btn-text">
                  <span className="export-btn-title">Export to PDF</span>
                  <span className="export-btn-sub">.pdf — professional report</span>
                </div>
              </>
            )}
          </button>

        </div>

        {!canExport && expenses.length === 0 && !loading && (
          <p className="export-hint">Select a date range with expenses to enable export</p>
        )}
      </div>
    </div>
  )
}
