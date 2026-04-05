import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import expensesRouter  from './routes/expenses.js'
import categoriesRouter from './routes/categories.js'
import scanRouter      from './routes/scan.js'
import settingsRouter  from './routes/settings.js'

const __dirname    = dirname(fileURLToPath(import.meta.url))
const app          = express()
const PORT         = process.env.PORT || 3001
const isProduction = process.env.NODE_ENV === 'production'

// ── Middleware ────────────────────────────────────────────────────────────────
if (!isProduction) {
  // In dev, client runs on a different port — allow cross-origin requests
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
}

app.use(express.json({ limit: '15mb' }))

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/expenses',   expensesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/scan',       scanRouter)
app.use('/api/settings',   settingsRouter)

// ── Static client (production only) ─────────────────────────────────────────
if (isProduction) {
  const clientDist = join(__dirname, '../client/dist')
  app.use(express.static(clientDist))
  // SPA fallback — serve index.html for any non-API route
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${isProduction ? 'production' : 'development'}]`)
})
