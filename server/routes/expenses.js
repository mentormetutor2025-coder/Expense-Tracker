import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

// GET /api/expenses — list with optional filters
router.get('/', async (req, res) => {
  const { category, from, to, search, limit } = req.query
  let expenses = db.data.expenses

  if (category) {
    expenses = expenses.filter(e => e.category === category)
  }
  if (from) {
    expenses = expenses.filter(e => e.date >= from)
  }
  if (to) {
    expenses = expenses.filter(e => e.date <= to)
  }
  if (search) {
    const q = search.toLowerCase()
    expenses = expenses.filter(e => e.description.toLowerCase().includes(q))
  }

  // Sort newest first (by createdAt when available, fallback to date+id)
  expenses = [...expenses].sort((a, b) => {
    if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt)
    return b.date.localeCompare(a.date) || b.id - a.id
  })

  if (limit) expenses = expenses.slice(0, parseInt(limit, 10))

  res.json(expenses)
})

// GET /api/expenses/summary
router.get('/summary', async (req, res) => {
  const expenses = db.data.expenses

  const now = new Date()
  const pad = n => String(n).padStart(2, '0')

  // Date strings
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const thisMonthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`

  // Week boundaries (Mon–Sun)
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1 // 0=Mon
  const thisMonStart = new Date(now); thisMonStart.setDate(now.getDate() - dow); thisMonStart.setHours(0,0,0,0)
  const lastMonStart = new Date(thisMonStart); lastMonStart.setDate(thisMonStart.getDate() - 7)
  const lastSunEnd   = new Date(thisMonStart); lastSunEnd.setDate(thisMonStart.getDate() - 1)

  const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

  const thisWeekStart = toDateStr(thisMonStart)
  const lastWeekStart = toDateStr(lastMonStart)
  const lastWeekEnd   = toDateStr(lastSunEnd)

  // Totals
  const total      = expenses.reduce((s, e) => s + e.amount, 0)
  const todayTotal = expenses.filter(e => e.date === todayStr).reduce((s, e) => s + e.amount, 0)
  const weekTotal  = expenses.filter(e => e.date >= thisWeekStart && e.date <= todayStr).reduce((s, e) => s + e.amount, 0)
  const monthTotal = expenses.filter(e => e.date.startsWith(thisMonthPrefix)).reduce((s, e) => s + e.amount, 0)

  // By category
  const byCategory = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }

  // Daily spending for every day in the current month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dailyThisMonth = Array.from({ length: daysInMonth }, (_, i) => {
    const d = `${thisMonthPrefix}-${pad(i + 1)}`
    const amount = expenses.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0)
    return { date: d, day: i + 1, amount }
  })

  // This week vs last week — one entry per weekday (Mon=0 … Sun=6)
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekComparison = DAYS.map((label, i) => {
    const thisDay = new Date(thisMonStart); thisDay.setDate(thisMonStart.getDate() + i)
    const lastDay = new Date(lastMonStart); lastDay.setDate(lastMonStart.getDate() + i)
    const thisDayStr = toDateStr(thisDay)
    const lastDayStr = toDateStr(lastDay)
    return {
      day: label,
      thisWeek: expenses.filter(e => e.date === thisDayStr).reduce((s, e) => s + e.amount, 0),
      lastWeek: expenses.filter(e => e.date === lastDayStr).reduce((s, e) => s + e.amount, 0),
    }
  })

  // This-month spend per category (used for budget progress)
  const monthExpenses = expenses.filter(e => e.date.startsWith(thisMonthPrefix))
  const byCategoryThisMonth = {}
  for (const e of monthExpenses) {
    byCategoryThisMonth[e.category] = (byCategoryThisMonth[e.category] || 0) + e.amount
  }

  // Category colours + budgets maps
  const categoryColors  = {}
  const categoryBudgets = {}   // { "Food & Dining": 5000, ... }  — only categories with a budget set
  for (const c of db.data.categories) {
    categoryColors[c.name] = c.color
    if (c.budget != null) categoryBudgets[c.name] = c.budget
  }

  res.json({
    total, count: expenses.length,
    todayTotal, weekTotal, monthTotal,
    byCategory, byCategoryThisMonth, categoryColors, categoryBudgets,
    dailyThisMonth, weekComparison
  })
})

// GET /api/expenses/categories
router.get('/categories', (req, res) => {
  const categories = [...new Set(db.data.expenses.map(e => e.category))].sort()
  res.json(categories)
})

// GET /api/expenses/:id
router.get('/:id', (req, res) => {
  const expense = db.data.expenses.find(e => e.id === Number(req.params.id))
  if (!expense) return res.status(404).json({ error: 'Not found' })
  res.json(expense)
})

// POST /api/expenses
router.post('/', async (req, res) => {
  const { description, amount, category, date, location } = req.body

  if (!description || amount == null || !category || !date) {
    return res.status(400).json({ error: 'description, amount, category and date are required' })
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' })
  }

  const expense = {
    id: db.data.nextId++,
    description: description.trim(),
    amount,
    category: category.trim(),
    date,
    location: location || null,
    createdAt: new Date().toISOString()
  }

  db.data.expenses.push(expense)
  await db.write()
  res.status(201).json(expense)
})

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  const idx = db.data.expenses.findIndex(e => e.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })

  const { description, amount, category, date, location } = req.body

  if (amount != null && (typeof amount !== 'number' || amount <= 0)) {
    return res.status(400).json({ error: 'amount must be a positive number' })
  }

  db.data.expenses[idx] = {
    ...db.data.expenses[idx],
    ...(description && { description: description.trim() }),
    ...(amount != null && { amount }),
    ...(category && { category: category.trim() }),
    ...(date && { date }),
    ...('location' in req.body && { location }),
    updatedAt: new Date().toISOString()
  }

  await db.write()
  res.json(db.data.expenses[idx])
})

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  const idx = db.data.expenses.findIndex(e => e.id === Number(req.params.id))
  if (idx === -1) return res.status(404).json({ error: 'Not found' })

  db.data.expenses.splice(idx, 1)
  await db.write()
  res.status(204).end()
})

export default router
