import { JSONFilePreset } from 'lowdb/node'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const defaultData = {
  expenses: [],
  categories: [],
  settings: { businessName: '', currency: 'R', locationEnabled: true },
  nextId: 1,
  nextCategoryId: 1
}

export const db = await JSONFilePreset(join(__dirname, 'data.json'), defaultData)

// Ensure schema fields exist for existing data.json files
if (!db.data.categories)  db.data.categories = []
if (!db.data.nextCategoryId) db.data.nextCategoryId = 1
if (!db.data.settings)    db.data.settings = { businessName: '', currency: 'R', locationEnabled: true }
if (db.data.settings.locationEnabled == null) db.data.settings.locationEnabled = true

// Seed default categories on first run
if (db.data.categories.length === 0) {
  const defaults = [
    { name: 'Food & Dining',  color: '#f59e0b' },
    { name: 'Transport',      color: '#3b82f6' },
    { name: 'Housing',        color: '#10b981' },
    { name: 'Entertainment',  color: '#ec4899' },
    { name: 'Health',         color: '#ef4444' },
    { name: 'Shopping',       color: '#8b5cf6' },
    { name: 'Education',      color: '#6366f1' },
    { name: 'Travel',         color: '#14b8a6' },
    { name: 'Other',          color: '#94a3b8' },
    { name: 'Uncategorised',  color: '#64748b', system: true },
  ]
  for (const d of defaults) {
    db.data.categories.push({ id: db.data.nextCategoryId++, ...d })
  }
  await db.write()
}
