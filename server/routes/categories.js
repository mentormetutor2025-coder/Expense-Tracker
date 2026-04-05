import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

// GET /api/categories
router.get('/', (req, res) => {
  res.json(db.data.categories)
})

// POST /api/categories
router.post('/', async (req, res) => {
  const { name, color } = req.body

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' })
  if (!color)        return res.status(400).json({ error: 'Colour is required.' })

  const exists = db.data.categories.some(
    c => c.name.toLowerCase() === name.trim().toLowerCase()
  )
  if (exists) return res.status(400).json({ error: 'A category with that name already exists.' })

  const category = { id: db.data.nextCategoryId++, name: name.trim(), color }
  db.data.categories.push(category)
  await db.write()
  res.status(201).json(category)
})

// PUT /api/categories/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const idx = db.data.categories.findIndex(c => c.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Category not found.' })

  const cat = db.data.categories[idx]
  const { name, color, budget } = req.body

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' })
  if (!color)        return res.status(400).json({ error: 'Colour is required.' })

  if (budget !== undefined && budget !== null) {
    const b = Number(budget)
    if (isNaN(b) || b <= 0) return res.status(400).json({ error: 'Budget must be a positive number.' })
  }

  const duplicate = db.data.categories.some(
    c => c.id !== id && c.name.toLowerCase() === name.trim().toLowerCase()
  )
  if (duplicate) return res.status(400).json({ error: 'A category with that name already exists.' })

  const oldName = cat.name
  const newName = name.trim()

  // Cascade rename to all expenses using the old name
  if (oldName !== newName) {
    for (const e of db.data.expenses) {
      if (e.category === oldName) e.category = newName
    }
  }

  // budget: null clears it, a number sets it, undefined leaves it unchanged
  const newBudget = budget === null ? null
    : budget !== undefined ? Number(budget)
    : cat.budget ?? null

  db.data.categories[idx] = { ...cat, name: newName, color, budget: newBudget }
  await db.write()
  res.json(db.data.categories[idx])
})

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const idx = db.data.categories.findIndex(c => c.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Category not found.' })

  const cat = db.data.categories[idx]
  if (cat.system) return res.status(400).json({ error: 'System categories cannot be deleted.' })

  // Reassign expenses to Uncategorised
  for (const e of db.data.expenses) {
    if (e.category === cat.name) e.category = 'Uncategorised'
  }

  db.data.categories.splice(idx, 1)
  await db.write()
  res.status(204).end()
})

export default router
