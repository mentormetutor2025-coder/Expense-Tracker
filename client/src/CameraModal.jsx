import { useState, useRef, useEffect } from 'react'

export default function CameraModal({ onCapture, onClose }) {
  // 'starting' | 'streaming' | 'captured' | 'error'
  const [phase,       setPhase]       = useState('starting')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [capturedSrc, setCapturedSrc] = useState(null)
  const [capturedBlob,setCapturedBlob]= useState(null)

  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  // Start camera on mount, stop on unmount
  useEffect(() => {
    startCamera()
    return () => stopStream()
  }, [])

  async function startCamera() {
    setPhase('starting')
    setErrorMsg('')
    try {
      // Prefer back camera on mobile; fall back gracefully
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setPhase('streaming')
        }
      }
    } catch (err) {
      let msg = 'Could not access the camera.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera access was denied. Please allow camera access in your browser or device settings and try again.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera was found on this device.'
      } else if (err.name === 'NotReadableError') {
        msg = 'Camera is already in use by another application.'
      }
      setErrorMsg(msg)
      setPhase('error')
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function capture() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)

    canvas.toBlob(blob => {
      stopStream()
      const src = URL.createObjectURL(blob)
      setCapturedSrc(src)
      setCapturedBlob(blob)
      setPhase('captured')
    }, 'image/jpeg', 0.92)
  }

  function retake() {
    if (capturedSrc) URL.revokeObjectURL(capturedSrc)
    setCapturedSrc(null)
    setCapturedBlob(null)
    startCamera()
  }

  function usePhoto() {
    onCapture(capturedBlob)   // ScanModal will handle preview + auto-scan
    stopStream()
    onClose()
  }

  function handleClose() {
    stopStream()
    if (capturedSrc) URL.revokeObjectURL(capturedSrc)
    onClose()
  }

  return (
    <div className="overlay camera-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="camera-modal">

        {/* ── header ── */}
        <div className="camera-header">
          <span className="camera-title">
            {phase === 'captured' ? 'Use this photo?' : 'Point camera at receipt'}
          </span>
          <button type="button" className="btn-icon camera-x" onClick={handleClose}>✕</button>
        </div>

        {/* ── viewfinder ── */}
        <div className="camera-viewfinder">
          {/* Live feed */}
          <video
            ref={videoRef}
            className="camera-video"
            autoPlay
            playsInline
            muted
            style={{ display: phase === 'streaming' ? 'block' : 'none' }}
          />

          {/* Captured preview */}
          {phase === 'captured' && capturedSrc && (
            <img src={capturedSrc} className="camera-captured-img" alt="Captured receipt" />
          )}

          {/* Starting spinner */}
          {phase === 'starting' && (
            <div className="camera-status">
              <div className="scan-spinner" style={{ borderTopColor: '#818cf8' }} />
              <p>Starting camera…</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="camera-status">
              <div className="camera-err-icon">📷</div>
              <p className="camera-err-msg">{errorMsg}</p>
            </div>
          )}

          {/* Corner guide overlaid on live feed */}
          {phase === 'streaming' && (
            <div className="vf-overlay" aria-hidden>
              <div className="vf-corners">
                <span className="vfc tl" /><span className="vfc tr" />
                <span className="vfc bl" /><span className="vfc br" />
              </div>
              <p className="vf-hint">Align receipt within the frame</p>
            </div>
          )}
        </div>

        {/* Hidden canvas used to grab a frame */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* ── controls ── */}
        <div className="camera-controls">
          {phase === 'streaming' && (
            <>
              <button type="button" className="cam-ctrl-btn cam-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="cam-shutter"
                onClick={capture}
                aria-label="Take photo"
              >
                <span className="cam-shutter-ring" />
              </button>
              {/* right spacer keeps shutter centred */}
              <div className="cam-ctrl-spacer" />
            </>
          )}

          {phase === 'captured' && (
            <>
              <button type="button" className="cam-ctrl-btn cam-retake" onClick={retake}>
                ↩ Retake
              </button>
              <button type="button" className="cam-ctrl-btn cam-use" onClick={usePhoto}>
                ✓ Use Photo
              </button>
            </>
          )}

          {(phase === 'starting' || phase === 'error') && (
            <>
              {phase === 'error' && (
                <button type="button" className="cam-ctrl-btn cam-retry" onClick={startCamera}>
                  Try Again
                </button>
              )}
              <button type="button" className="cam-ctrl-btn cam-cancel" onClick={handleClose}>
                Cancel
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
