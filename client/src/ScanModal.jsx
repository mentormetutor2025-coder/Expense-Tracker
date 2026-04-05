import { useState, useRef } from 'react'
import CameraModal from './CameraModal'

const MAX_RAW_BYTES = 15 * 1024 * 1024   // 15 MB
const MAX_DIM       = 1600               // px — longest edge after compression
const JPEG_QUALITY  = 0.88

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

// ── helpers ───────────────────────────────────────────────────────────────────

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve(r.result.split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale   = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w       = Math.round(img.width  * scale)
      const h       = Math.round(img.height * scale)
      const canvas  = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        const r = new FileReader()
        r.onload  = () => resolve(r.result.split(',')[1])
        r.onerror = reject
        r.readAsDataURL(blob)
      }, 'image/jpeg', JPEG_QUALITY)
    }
    img.onerror = reject
    img.src = url
  })
}

function confidenceColor(c) {
  if (c >= 85) return '#16a34a'
  if (c >= 65) return '#d97706'
  return '#dc2626'
}
function confidenceLabel(c) {
  if (c >= 85) return 'High confidence'
  if (c >= 65) return 'Medium confidence — please verify'
  return 'Low confidence — review all fields carefully'
}

// ── sub-components ────────────────────────────────────────────────────────────

function ScanField({ label, value, found }) {
  return (
    <div className="scan-field">
      <span className="scan-field-label">{label}</span>
      <span className={`scan-field-value${!found ? ' missing' : ''}`}>
        {found ? value : 'Not found'}
      </span>
      <span className="scan-field-status">{found ? '✓' : '—'}</span>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function ScanModal({ onClose, onComplete, categories }) {
  const [file,       setFile]       = useState(null)
  const [preview,    setPreview]    = useState(null)   // data-url | 'pdf' | null
  const [scanning,   setScanning]   = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState('')
  const [dragging,   setDragging]   = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  const uploadRef = useRef()
  const cameraInputRef = useRef()

  // ── core scan function (accepts a File or Blob directly) ──────────────────

  async function doScan(f) {
    setScanning(true)
    setError('')
    setResult(null)
    try {
      let data, mediaType
      if (f.type === 'application/pdf') {
        data      = await readAsBase64(f)
        mediaType = 'application/pdf'
      } else {
        data      = await compressImage(f)
        mediaType = 'image/jpeg'
      }

      const catNames = categories.map(c => (typeof c === 'string' ? c : c.name))
      const res  = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data, mediaType, categories: catNames }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Scan failed.')
      setResult(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setScanning(false)
    }
  }

  // ── file from upload/drag-drop ────────────────────────────────────────────

  function acceptFile(f) {
    if (!f) return
    if (f.size > MAX_RAW_BYTES) {
      setError('File is too large (max 15 MB). Please use a smaller image.')
      return
    }
    const ok = ACCEPTED_TYPES.includes(f.type) || f.type.startsWith('image/')
    if (!ok) {
      setError('Unsupported format. Please use JPEG, PNG, WebP, or PDF.')
      return
    }
    setFile(f)
    setError('')
    setResult(null)
    setPreview(f.type === 'application/pdf' ? 'pdf' : URL.createObjectURL(f))
  }

  // ── blob from in-app camera (auto-scan immediately) ───────────────────────

  function onCameraCapture(blob) {
    const f = new File([blob], 'receipt.jpg', { type: 'image/jpeg' })
    setFile(f)
    setError('')
    setResult(null)
    setPreview(URL.createObjectURL(blob))
    doScan(f)   // ← auto-scan, no button press needed
  }

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError('')
  }

  function handleUse() {
    if (!result) return
    onComplete({
      description: result.vendor   ?? '',
      amount:      result.amount   != null ? String(result.amount) : '',
      date:        result.date     ?? '',
      category:    result.category ?? '',
    })
    onClose()
  }

  // ── drag & drop ───────────────────────────────────────────────────────────

  const onDragOver  = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = ()  => setDragging(false)
  const onDrop      = e  => {
    e.preventDefault(); setDragging(false)
    acceptFile(e.dataTransfer.files[0])
  }

  const c = result?.confidence ?? 0

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="overlay scan-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal scan-modal">

          {/* header */}
          <div className="scan-header">
            <h2>Scan Receipt</h2>
            <button className="btn-icon scan-close" type="button" onClick={onClose}>✕</button>
          </div>

          {/* ── source buttons (always visible until results) ── */}
          {!result && !scanning && (
            <div className="scan-source-bar">
              <button
                type="button"
                className="scan-source-btn scan-source-camera"
                onClick={() => setShowCamera(true)}
              >
                <span className="ssb-icon">📷</span>
                <span className="ssb-label">Open Camera</span>
                <span className="ssb-sub">Live viewfinder</span>
              </button>
              <button
                type="button"
                className="scan-source-btn"
                onClick={() => cameraInputRef.current.click()}
              >
                <span className="ssb-icon">📸</span>
                <span className="ssb-label">Take Photo</span>
                <span className="ssb-sub">Device camera</span>
              </button>
              <button
                type="button"
                className="scan-source-btn"
                onClick={() => uploadRef.current.click()}
              >
                <span className="ssb-icon">📂</span>
                <span className="ssb-label">Upload File</span>
                <span className="ssb-sub">Image or PDF</span>
              </button>
            </div>
          )}

          {/* hidden file inputs */}
          <input
            ref={uploadRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={e => acceptFile(e.target.files[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => acceptFile(e.target.files[0])}
          />

          {/* ── drop zone (file picked, not yet scanned) ── */}
          {!result && !scanning && (
            <div
              className={`drop-zone${dragging ? ' dragging' : ''}${file ? ' has-file' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => !file && uploadRef.current.click()}
            >
              {preview && preview !== 'pdf' && (
                <img src={preview} className="scan-preview-img" alt="Receipt preview" />
              )}
              {preview === 'pdf' && (
                <div className="scan-pdf-thumb">
                  <div className="scan-pdf-icon">📄</div>
                  <div className="scan-pdf-name">{file?.name}</div>
                </div>
              )}
              {!preview && (
                <div className="drop-placeholder">
                  <div className="drop-receipt-icon">🧾</div>
                  <p className="drop-main">Drop a receipt or invoice here</p>
                  <p className="drop-sub">JPEG · PNG · WebP · PDF — max 15 MB</p>
                </div>
              )}
            </div>
          )}

          {/* scan / clear row */}
          {file && !scanning && !result && (
            <div className="scan-file-row">
              <span className="scan-file-name">{file.name || 'receipt.jpg'}</span>
              <button type="button" className="btn-secondary scan-clear-btn" onClick={reset}>Remove</button>
              <button type="button" className="btn-primary" onClick={() => doScan(file)}>
                🔍 Scan
              </button>
            </div>
          )}

          {/* ── scanning animation ── */}
          {scanning && (
            <div className="scan-loading">
              <div className="scan-spinner" />
              {preview && preview !== 'pdf' && (
                <div className="scan-loading-preview">
                  <img src={preview} className="scan-loading-thumb" alt="" />
                  <div className="scan-loading-shimmer" />
                </div>
              )}
              <p>Reading receipt…</p>
              <p className="scan-loading-sub">This usually takes a few seconds</p>
            </div>
          )}

          {/* ── error ── */}
          {error && !scanning && (
            <div className="scan-error-box">
              <div className="scan-error-icon">⚠️</div>
              <p className="scan-error-msg">{error}</p>
              <button type="button" className="btn-secondary" onClick={reset}>Try Again</button>
            </div>
          )}

          {/* ── results ── */}
          {result && !scanning && (
            <div className="scan-results">

              {/* thumbnail */}
              {preview && preview !== 'pdf' && (
                <img src={preview} className="result-thumb" alt="Scanned receipt" />
              )}

              {/* confidence */}
              <div className="confidence-wrap">
                <div className="confidence-header">
                  <span className="confidence-title">Scan confidence</span>
                  <span className="confidence-value" style={{ color: confidenceColor(c) }}>{c}%</span>
                </div>
                <div className="confidence-track">
                  <div className="confidence-fill" style={{ width: `${c}%`, background: confidenceColor(c) }} />
                </div>
                <p className="confidence-label" style={{ color: confidenceColor(c) }}>
                  {confidenceLabel(c)}
                </p>
              </div>

              {/* fields */}
              <div className="scan-fields">
                <ScanField label="Vendor / Store" value={result.vendor}   found={result.vendor   != null} />
                <ScanField
                  label="Amount"
                  value={result.amount != null ? `R ${Number(result.amount).toFixed(2)}` : null}
                  found={result.amount != null}
                />
                <ScanField label="Date"     value={result.date}     found={result.date     != null} />
                <ScanField label="Category" value={result.category} found={result.category != null} />
              </div>

              {result.notes && <div className="scan-notes">ℹ️ {result.notes}</div>}

              <div className="form-actions" style={{ marginTop: '1.1rem' }}>
                <button type="button" className="btn-secondary" onClick={reset}>Rescan</button>
                <button type="button" className="btn-primary" onClick={handleUse}>
                  Use These Details
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* In-app camera — rendered above ScanModal */}
      {showCamera && (
        <CameraModal
          onClose={() => setShowCamera(false)}
          onCapture={onCameraCapture}
        />
      )}
    </>
  )
}
