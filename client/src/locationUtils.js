// Maximum time to wait for GPS fix + reverse geocode (ms)
const GEO_TIMEOUT = 8000

// ── Reverse geocoding via Nominatim (OpenStreetMap) ───────────────────────────

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    lat:            String(lat),
    lon:            String(lon),
    format:         'json',
    addressdetails: '1',
    zoom:           '16',
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
    { headers: { 'Accept-Language': 'en' } }
  )
  if (!res.ok) throw new Error('Reverse geocode failed')

  const data = await res.json()
  const a    = data.address || {}

  const street = a.road || a.pedestrian || a.footway || a.path || null
  const suburb = a.suburb || a.neighbourhood || a.quarter || a.residential || null
  const city   = a.city   || a.town || a.village || a.municipality || a.county || null
  const region = a.state  || a.province || null

  const displayParts = []
  if (suburb)                       displayParts.push(suburb)
  if (city && city !== suburb)      displayParts.push(city)

  return {
    lat, lon, street, suburb, city, region,
    display: displayParts.length ? displayParts.join(', ') : city || suburb || region || 'Unknown area',
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────
// Returns a location object or null (never throws).

export function captureLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }

    let done = false
    const finish = val => { if (!done) { done = true; resolve(val) } }

    // Hard timeout — never block the UI
    const timer = setTimeout(() => finish(null), GEO_TIMEOUT)

    navigator.geolocation.getCurrentPosition(
      async pos => {
        clearTimeout(timer)
        const { latitude: lat, longitude: lon } = pos.coords
        try {
          const loc = await reverseGeocode(lat, lon)
          finish(loc)
        } catch {
          // Coordinates captured but geocoding failed — return minimal object
          finish({ lat, lon, street: null, suburb: null, city: null, region: null, display: 'Location detected' })
        }
      },
      err => {
        clearTimeout(timer)
        // NotAllowedError (1), PositionUnavailable (2), Timeout (3) — all silent
        finish(null)
      },
      { timeout: GEO_TIMEOUT - 500, maximumAge: 60_000, enableHighAccuracy: false }
    )
  })
}

// Check current permission state without triggering a prompt.
export async function getPermissionState() {
  if (!navigator.permissions) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state   // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown'
  }
}

// ── Time formatting helpers ───────────────────────────────────────────────────

export function formatTime(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatDateTime(isoString) {
  if (!isoString) return null
  const d    = new Date(isoString)
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-ZA',  { day: 'numeric', month: 'short', year: 'numeric' })
  return `${time} on ${date}`
}
