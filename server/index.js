import express from 'express'
import cors from 'cors'
import expensesRouter from './routes/expenses.js'
import categoriesRouter from './routes/categories.js'
import scanRouter from './routes/scan.js'
import settingsRouter from './routes/settings.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '15mb' }))

app.use('/api/expenses', expensesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/scan', scanRouter)
app.use('/api/settings', settingsRouter)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
