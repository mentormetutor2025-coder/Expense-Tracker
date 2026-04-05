import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

// GET /api/settings
router.get('/', (req, res) => {
  res.json(db.data.settings)
})

// PUT /api/settings
router.put('/', async (req, res) => {
  const { businessName, currency, locationEnabled } = req.body

  if (currency !== undefined && (typeof currency !== 'string' || !currency.trim())) {
    return res.status(400).json({ error: 'Currency symbol cannot be empty.' })
  }

  db.data.settings = {
    businessName:    typeof businessName    === 'string'  ? businessName.trim() : db.data.settings.businessName,
    currency:        typeof currency        === 'string'  ? currency.trim()     : db.data.settings.currency,
    locationEnabled: typeof locationEnabled === 'boolean' ? locationEnabled     : db.data.settings.locationEnabled,
  }
  await db.write()
  res.json(db.data.settings)
})

export default router
