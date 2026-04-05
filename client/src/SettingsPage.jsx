import { useState } from 'react'

export default function SettingsPage({ settings, onSaved }) {
  const [businessName,     setBusinessName]     = useState(settings.businessName ?? '')
  const [currency,         setCurrency]         = useState(settings.currency ?? 'R')
  const [locationEnabled,  setLocationEnabled]  = useState(settings.locationEnabled ?? true)
  const [saving,           setSaving]           = useState(false)
  const [saved,            setSaved]            = useState(false)
  const [error,            setError]            = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!currency.trim()) return setError('Currency symbol cannot be empty.')

    setSaving(true)
    setSaved(false)
    try {
      const res  = await fetch('/api/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          businessName: businessName.trim(),
          currency:     currency.trim(),
          locationEnabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save.')
      onSaved(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
        <p className="settings-sub">These values are used in your exported reports</p>
      </div>

      <div className="settings-card">
        <form onSubmit={handleSubmit}>
          <div className="settings-field">
            <label>Business / Your Name</label>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Bayanda's Business"
            />
            <p className="settings-hint">Appears in the header of your PDF reports</p>
          </div>

          <div className="settings-field">
            <label>Currency Symbol</label>
            <input
              type="text"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              placeholder="R"
              style={{ maxWidth: 100 }}
            />
            <p className="settings-hint">Used when formatting amounts in exports (default: R)</p>
          </div>

          <div className="settings-field">
            <label>Location Tracking</label>
            <label className="toggle-label">
              <input
                type="checkbox"
                className="toggle-input"
                checked={locationEnabled}
                onChange={e => setLocationEnabled(e.target.checked)}
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-text">
                {locationEnabled ? 'Enabled — location recorded with each expense' : 'Disabled — no location data collected'}
              </span>
            </label>
            <p className="settings-hint">
              When enabled, your device's location is captured when you save a new expense and shown in exports. Your browser will ask for permission the first time.
            </p>
          </div>

          {error && <p className="form-error" style={{ marginBottom: '.75rem' }}>{error}</p>}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            {saved && <span className="settings-saved">✓ Saved</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
