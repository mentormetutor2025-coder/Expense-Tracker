import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import expensesRouter   from './routes/expenses.js'
import categoriesRouter from './routes/categories.js'
import scanRouter       from './routes/scan.js'
import settingsRouter   from './routes/settings.js'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const app        = express()
const PORT       = process.env.PORT || 3001
const clientDist = join(__dirname, '../client/dist')

// Detect production by whether the built client exists — works regardless of NODE_ENV
const isProduction = existsSync(join(clientDist, 'index.html'))

// ── Middleware ────────────────────────────────────────────────────────────────
if (!isProduction) {
  // Dev only — client runs on a different port
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
}

app.use(express.json({ limit: '15mb' }))

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/expenses',   expensesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/scan',       scanRouter)
app.use('/api/settings',   settingsRouter)

// ── Serve built client (production) ──────────────────────────────────────────
if (isProduction) {
  app.use(express.static(clientDist))
  // SPA fallback — all non-API routes serve index.html
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

// ── Start — bind to 0.0.0.0 so Railway can reach it ─────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} [${isProduction ? 'production' : 'development'}]`)
})
