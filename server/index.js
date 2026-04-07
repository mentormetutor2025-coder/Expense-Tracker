import express from 'express'
import cors from 'cors'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import expensesRouter   from './routes/expenses.js'
import categoriesRouter from './routes/categories.js'
import scanRouter       from './routes/scan.js'
import settingsRouter   from './routes/settings.js'

// ── Diagnostics ───────────────────────────────────────────────────────────────
console.log('=== Expense Tracker Server Starting ===')
console.log('Node version :', process.version)
console.log('PORT env     :', process.env.PORT)
console.log('NODE_ENV     :', process.env.NODE_ENV)

const __dirname  = dirname(fileURLToPath(import.meta.url))
const app        = express()
const PORT       = process.env.PORT || 3001
const clientDist = join(__dirname, '../client/dist')

console.log('__dirname    :', __dirname)
console.log('clientDist   :', clientDist)
console.log('dist exists  :', existsSync(clientDist))
console.log('index exists :', existsSync(join(clientDist, 'index.html')))

// Detect production by whether the built client exists — works regardless of NODE_ENV
const isProduction = existsSync(join(clientDist, 'index.html'))
console.log('isProduction :', isProduction)

// ── Middleware ────────────────────────────────────────────────────────────────
if (!isProduction) {
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
}

app.use(express.json({ limit: '15mb' }))

// ── Health check (Railway probes this) ───────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', port: PORT, production: isProduction }))

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/expenses',   expensesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/scan',       scanRouter)
app.use('/api/settings',   settingsRouter)

// ── Serve built client (production) ──────────────────────────────────────────
if (isProduction) {
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'))
  })
}

// ── Catch unhandled errors so Railway shows them in logs ─────────────────────
process.on('uncaughtException',  err => console.error('Uncaught exception:',  err))
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err))

// ── Start — 0.0.0.0 is required for Railway to route traffic ─────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=== Server ready on http://0.0.0.0:${PORT} [${isProduction ? 'production' : 'development'}] ===`)
})
