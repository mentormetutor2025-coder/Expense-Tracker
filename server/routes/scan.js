import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()

const SYSTEM_PROMPT = `You are a receipt and invoice scanner. Carefully examine this image and extract:
- Vendor/Store name
- Total amount (numbers only, no currency symbol)
- Date of purchase (in YYYY-MM-DD format)
- Best category guess from: Food, Transport, Utilities, Salaries, Office Supplies, Entertainment, Medical, Other

Respond ONLY in this exact JSON format:
{
  "vendor": "store name here",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "category here",
  "confidence": 95
}
If you cannot read a field clearly, use null.`

// POST /api/scan
router.post('/', async (req, res) => {
  // ── API key check ───────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log('[scan] ANTHROPIC_API_KEY present:', !!apiKey)
  if (!apiKey) {
    return res.status(503).json({
      error: 'Receipt scanning requires an Anthropic API key. Add ANTHROPIC_API_KEY to your environment and restart the server.'
    })
  }

  // ── Validate request ────────────────────────────────────────────────────────
  const { data, mediaType, categories } = req.body
  if (!data)      return res.status(400).json({ error: 'No file data provided.' })
  if (!mediaType) return res.status(400).json({ error: 'No media type provided.' })

  if (data.length > 13_500_000) {
    return res.status(400).json({ error: 'File too large. Please use an image under 10 MB.' })
  }

  console.log('[scan] mediaType:', mediaType, '| base64 length:', data.length)

  const categoryList = Array.isArray(categories) && categories.length
    ? categories.join(', ')
    : 'Food, Transport, Utilities, Salaries, Office Supplies, Entertainment, Medical, Other'

  const userText = `Extract the receipt/invoice details. Available categories: ${categoryList}\n\nReturn ONLY the JSON object — no markdown, no extra text.`

  // ── Build content block ─────────────────────────────────────────────────────
  const mediaBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data } }

  // ── Call Claude ─────────────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey })

    console.log('[scan] Calling Claude claude-haiku-4-5-20251001 ...')
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: [mediaBlock, { type: 'text', text: userText }] }]
    })

    console.log('[scan] Stop reason:', message.stop_reason)
    const raw = message.content[0]?.text?.trim() ?? ''
    console.log('[scan] Raw Claude response:', raw)

    // Strip markdown code fences if present
    let jsonText = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    // Replace single-quoted keys/values in case Claude uses them
    jsonText = jsonText.replace(/'/g, '"')

    let result
    try {
      result = JSON.parse(jsonText)
    } catch (parseErr) {
      console.error('[scan] JSON parse failed. Cleaned text was:', jsonText)
      return res.status(422).json({
        error: "Couldn't read this receipt clearly. Please try a sharper photo with good lighting."
      })
    }

    // Normalise fields
    if (typeof result.confidence !== 'number') result.confidence = 50
    if (typeof result.amount === 'string') {
      const parsed = parseFloat(result.amount.replace(/[^\d.]/g, ''))
      result.amount = isNaN(parsed) ? null : parsed
    }

    console.log('[scan] Parsed result:', JSON.stringify(result))
    res.json(result)

  } catch (err) {
    console.error('[scan] API error status:', err.status)
    console.error('[scan] API error message:', err.message)
    if (err.error) console.error('[scan] API error body:', JSON.stringify(err.error))

    if (err.status === 400) {
      return res.status(422).json({
        error: 'This image could not be processed. Try a clearer photo (JPEG or PNG recommended).'
      })
    }
    if (err.status === 401) {
      return res.status(503).json({
        error: 'Invalid Anthropic API key. Check the ANTHROPIC_API_KEY environment variable.'
      })
    }
    res.status(500).json({ error: 'Scanning failed unexpectedly. Please try again.' })
  }
})

export default router
