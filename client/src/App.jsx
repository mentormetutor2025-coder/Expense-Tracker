import { useState, useEffect, useCallback } from 'react'
import './App.css'
import Dashboard from './Dashboard'
import CategoriesPage from './CategoriesPage'
import ScanModal from './ScanModal'
import ExportPage from './ExportPage'
import SettingsPage from './SettingsPage'
import { captureLocation, getPermissionState, formatDateTime } from './locationUtils'

const API = '/api/expenses'

const DEFAULT_CATEGORIES = [
  'Food & Dining', 'Transport', 'Housing', 'Entertainment',
  'Health', 'Shopping', 'Education', 'Travel', 'Other'
]

function fmt(amount) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── Expense Form Modal ──────────────────────────────────────────────────────
function ExpenseModal({ expense, onClose, onSaved, allCategories, locationEnabled }) {
  const editing = !!expense?.id
  const [form, setForm] = useState({
    description: expense?.description ?? '',
    amount:      expense?.amount      ?? '',
    category:    expense?.category    ?? DEFAULT_CATEGORIES[0],
    date:        expense?.date        ?? today(),
  })
  const [error,    setError]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [locPerm,  setLocPerm]  = useState('unknown')

  useEffect(() => {
    if (locationEnabled && !editing) {
      getPermissionState().then(setLocPerm)
    }
  }, [locationEnabled, editing])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  function onScanComplete(data) {
    setForm(f => ({
      description: data.description || f.description,
      amount:      data.amount      || f.amount,
      date:        data.date        || f.date,
      category:    data.category    || f.category,
    }))
    setPrefilled(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amount = parseFloat(form.amount)
    if (!form.description.trim()) return setError('Description is required.')
    if (isNaN(amount) || amount <= 0) return setError('Enter a valid positive amount.')
    if (!form.date) return setError('Date is required.')

    setSaving(true)
    try {
      const url    = editing ? `${API}/${expense.id}` : API
      const method = editing ? 'PUT' : 'POST'

      // Capture location silently on new expenses when enabled
      let location = undefined
      if (locationEnabled && !editing) {
        location = await captureLocation()  // null if unavailable
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount, ...(location !== undefined && { location }) }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Request failed') }
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...allCategories])]

  return (
    <>
      <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-header">
            <h2>{editing ? 'Edit Expense' : 'Add Expense'}</h2>
            {!editing && (
              <button type="button" className="scan-receipt-btn" onClick={() => setShowScan(true)}>
                🧾 Scan Receipt
              </button>
            )}
          </div>

          {prefilled && (
            <div className="prefill-banner">
              ✓ Form pre-filled from receipt scan — please review before saving
            </div>
          )}

          {locationEnabled && !editing && locPerm !== 'denied' && (
            <div className="location-info-banner">
              📍 Location will be recorded when you save
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="full">
                <label>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="e.g. Grocery run"
                  autoFocus={!prefilled}
                />
              </div>
              <div>
                <label>Amount (R)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label>Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => set('date', e.target.value)}
                />
              </div>
              <div className="full">
                <label>Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: '.85rem', marginTop: '.75rem' }}>{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showScan && (
        <ScanModal
          categories={categories}
          onClose={() => setShowScan(false)}
          onComplete={onScanComplete}
        />
      )}
    </>
  )
}


// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('dashboard') // 'dashboard' | 'categories' | 'export' | 'settings'
  const [expenses, setExpenses] = useState([])
  const [summary, setSummary] = useState({ total: 0, todayTotal: 0, weekTotal: 0, monthTotal: 0, byCategory: {}, byCategoryThisMonth: {}, categoryColors: {}, categoryBudgets: {}, dailyThisMonth: [], weekComparison: [], count: 0 })
  const [allCategories, setAllCategories] = useState([])
  const [settings, setSettings] = useState({ businessName: '', currency: 'R', locationEnabled: true })
  const [loading, setLoading] = useState(true)
  const [recentExpenses, setRecentExpenses] = useState([])

  // filters
  const [filterCategory, setFilterCategory] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // modal
  const [showModal, setShowModal] = useState(false)
  const [editExpense, setEditExpense] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterCategory) params.set('category', filterCategory)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (filterSearch) params.set('search', filterSearch)

      const [expRes, sumRes, catRes, recentRes] = await Promise.all([
        fetch(`${API}?${params}`),
        fetch(`${API}/summary`),
        fetch(`${API}/categories`),
        fetch(`${API}?limit=5`),
      ])
      const [expData, sumData, catData, recentData] = await Promise.all([
        expRes.json(), sumRes.json(), catRes.json(), recentRes.json(),
      ])
      setExpenses(expData)
      setSummary(sumData)
      setAllCategories(catData)
      setRecentExpenses(recentData)
    } finally {
      setLoading(false)
    }
  }, [filterCategory, filterFrom, filterTo, filterSearch])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Load settings once on mount
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {})
  }, [])

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return
    await fetch(`${API}/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  function openAdd() { setEditExpense(null); setShowModal(true) }
  function openEdit(exp) { setEditExpense(exp); setShowModal(true) }
  function closeModal() { setShowModal(false); setEditExpense(null) }
  function onSaved() { closeModal(); fetchAll() }

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...allCategories])]

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <h1>Expense <span>Tracker</span></h1>
        <button className="btn-primary" onClick={openAdd}>+ Add Expense</button>
      </div>

      {/* Nav tabs */}
      <div className="nav-tabs">
        {[
          { id: 'dashboard',  label: 'Dashboard'   },
          { id: 'categories', label: 'Categories'  },
          { id: 'export',     label: 'Export'      },
          { id: 'settings',   label: 'Settings'    },
        ].map(tab => (
          <button
            key={tab.id}
            className={`nav-tab${page === tab.id ? ' active' : ''}`}
            onClick={() => setPage(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pages */}
      {page === 'dashboard' && (
        <>
          <Dashboard summary={summary} recentExpenses={recentExpenses} onEditExpense={openEdit} />

          {/* Filters */}
          <div className="toolbar">
            <div className="field">
              <label>Search</label>
              <input
                type="text"
                placeholder="Search descriptions…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field field-date">
              <label>From</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div className="field field-date">
              <label>To</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </div>
            {(filterCategory || filterFrom || filterTo || filterSearch) && (
              <button
                className="btn-secondary"
                style={{ alignSelf: 'flex-end' }}
                onClick={() => { setFilterCategory(''); setFilterFrom(''); setFilterTo(''); setFilterSearch('') }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="table-wrap">
            {loading ? (
              <div className="loading">Loading…</div>
            ) : expenses.length === 0 ? (
              <div className="empty">No expenses found. Add your first one!</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(exp => (
                    <tr key={exp.id}>
                      <td data-label="Date">
                        <div>{exp.date}</div>
                        {exp.createdAt && (
                          <div className="exp-time">{formatDateTime(exp.createdAt)}</div>
                        )}
                      </td>
                      <td data-label="Description">
                        <div>{exp.description}</div>
                        {exp.location && (
                          <div className="exp-location">📍 {exp.location.display || 'Location detected'}</div>
                        )}
                      </td>
                      <td data-label="Category">
                        <span
                          className="category-badge"
                          style={{
                            background: (summary.categoryColors[exp.category] ?? '#6366f1') + '22',
                            color: summary.categoryColors[exp.category] ?? '#6366f1'
                          }}
                        >
                          {exp.category}
                        </span>
                      </td>
                      <td data-label="Amount" className="amount-cell">{fmt(exp.amount)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn-icon" onClick={() => openEdit(exp)} title="Edit">✏️</button>
                          <button className="btn-icon del" onClick={() => handleDelete(exp.id)} title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {page === 'categories' && (
        <CategoriesPage onChanged={fetchAll} />
      )}

      {page === 'export' && (
        <ExportPage settings={settings} />
      )}

      {page === 'settings' && (
        <SettingsPage settings={settings} onSaved={setSettings} />
      )}

      {/* Add/edit expense modal */}
      {showModal && (
        <ExpenseModal
          expense={editExpense}
          onClose={closeModal}
          onSaved={onSaved}
          allCategories={allCategories}
          locationEnabled={settings.locationEnabled}
        />
      )}
    </div>
  )
}
