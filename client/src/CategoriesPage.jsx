import { useState, useEffect } from 'react'

const API = '/api/categories'

const PRESET_COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6',
  '#ec4899','#8b5cf6','#14b8a6','#f97316','#84cc16',
  '#64748b','#0ea5e9','#d946ef','#a3e635','#fb923c',
]

const fmtBudget = n =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)

function CategoryModal({ category, onClose, onSaved }) {
  const editing = !!category?.id
  const [name,   setName]   = useState(category?.name  ?? '')
  const [color,  setColor]  = useState(category?.color ?? PRESET_COLORS[0])
  const [budget, setBudget] = useState(category?.budget != null ? String(category.budget) : '')
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Name is required.')
    if (budget !== '' && (isNaN(Number(budget)) || Number(budget) <= 0)) {
      return setError('Budget must be a positive number, or leave blank for no limit.')
    }

    setSaving(true)
    try {
      const url    = editing ? `${API}/${category.id}` : API
      const method = editing ? 'PUT' : 'POST'
      const body   = {
        name: name.trim(),
        color,
        budget: budget === '' ? null : Number(budget),
      }
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed.')
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{editing ? 'Edit Category' : 'New Category'}</h2>
        <form onSubmit={handleSubmit}>

          <div style={{ marginBottom: '.85rem' }}>
            <label>Category Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Gym & Fitness"
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '.85rem' }}>
            <label>Colour</label>
            <div className="color-picker-row">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="color-custom"
                title="Pick a custom colour"
              />
            </div>
            <div className="color-preview">
              <span className="cat-badge" style={{ background: color + '22', color }}>
                {name.trim() || 'Preview'}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '.85rem' }}>
            <label>Monthly Budget Limit (R) — optional</label>
            <input
              type="number"
              min="1"
              step="any"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="Leave blank for no limit"
            />
            <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: '.3rem' }}>
              {budget !== '' && !isNaN(Number(budget)) && Number(budget) > 0
                ? `Budget: ${fmtBudget(Number(budget))}/month`
                : 'No limit set'}
            </p>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ category, onClose, onConfirm, saving }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Delete Category</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', margin: '.5rem 0 1.25rem' }}>
          Delete <strong style={{ color: 'var(--text)' }}>{category.name}</strong>?
          Any expenses in this category will be moved to <strong style={{ color: 'var(--text)' }}>Uncategorised</strong>.
        </p>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={saving}>
            {saving ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CategoriesPage({ onChanged }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)
  const [delSaving, setDelSaving]   = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch(API)
    setCategories(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function closeModal() { setModal(null) }

  function onSaved() {
    closeModal()
    load()
    onChanged()
  }

  async function handleDelete(cat) {
    setDelSaving(true)
    try {
      await fetch(`${API}/${cat.id}`, { method: 'DELETE' })
      closeModal()
      load()
      onChanged()
    } finally {
      setDelSaving(false)
    }
  }

  return (
    <div className="cat-page">
      <div className="cat-header">
        <div>
          <h2 className="cat-title">Categories</h2>
          <p className="cat-subtitle">Manage how your expenses are grouped and set monthly budget limits</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('add')}>+ New Category</button>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <div className="cat-list">
          {categories.map(cat => (
            <div key={cat.id} className="cat-row">
              <div className="cat-row-left">
                <span className="cat-color-dot" style={{ background: cat.color }} />
                <div>
                  <span className="cat-name">{cat.name}</span>
                  {cat.system && <span className="cat-system-badge" style={{ marginLeft: '.5rem' }}>system</span>}
                  <div className="cat-budget-label">
                    {cat.budget != null
                      ? <span className="cat-budget-set">{fmtBudget(cat.budget)}/month</span>
                      : <span className="cat-budget-none">No limit set</span>
                    }
                  </div>
                </div>
              </div>
              <div className="cat-row-right">
                <span className="cat-badge-preview" style={{ background: cat.color + '22', color: cat.color }}>
                  {cat.name}
                </span>
                {!cat.system && (
                  <div className="row-actions">
                    <button className="btn-icon" onClick={() => setModal({ edit: cat })} title="Edit">✏️</button>
                    <button className="btn-icon del" onClick={() => setModal({ del: cat })} title="Delete">🗑️</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'add' && (
        <CategoryModal onClose={closeModal} onSaved={onSaved} />
      )}
      {modal?.edit && (
        <CategoryModal category={modal.edit} onClose={closeModal} onSaved={onSaved} />
      )}
      {modal?.del && (
        <DeleteConfirmModal
          category={modal.del}
          onClose={closeModal}
          onConfirm={() => handleDelete(modal.del)}
          saving={delSaving}
        />
      )}
    </div>
  )
}
