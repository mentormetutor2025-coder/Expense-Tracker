import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()

const SYSTEM_PROMPT = `You are a receipt and invoice parser. Extract key fields from the provided image or PDF and return ONLY a valid JSON object — no markdown, no explanation, no extra text.

JSON schema:
{
  "vendor":     string | null,   // store or company name
  "amount":     number | null,   // grand total as a plain number (e.g. 234.50)
  "date":       string | null,   // ISO format YYYY-MM-DD, convert any date format found
  "category":   string | null,   // pick the single best match from the provided list
  "confidence": number,          // 0–100 integer: your overall confidence in the extraction
  "notes":      string | null    // brief note only if something was unclear or missing
}

Rules:
- amount: grand total / amount due / total payable — the final amount the customer paid
- If a field genuinely cannot be found, use null — do not guess
- confidence reflects how clearly the document was readable and how certain the field values are`

// POST /api/scan
router.post('/', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'Receipt scanning requires an Anthropic API key. Add ANTHROPIC_API_KEY to your environment and restart the server.'
    })
  }

  const { data, mediaType, categories } = req.body
  if (!data)      return res.status(400).json({ error: 'No file data provided.' })
  if (!mediaType) return res.status(400).json({ error: 'No media type provided.' })

  // Guard against huge payloads (~10 MB base64 ≈ 7.5 MB binary)
  if (data.length > 13_500_000) {
    return res.status(400).json({ error: 'File too large. Please use an image under 10 MB.' })
  }

  const categoryList = Array.isArray(categories) && categories.length
    ? categories.join(', ')
    : 'Food & Dining, Transport, Housing, Entertainment, Health, Shopping, Education, Travel, Other'

  const userText = `Extract the receipt/invoice details and return JSON.\n\nAvailable categories: ${categoryList}`

  // Build the content block — image or PDF document
  const mediaBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data } }

  try {
    const client  = new Anthropic()
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: [mediaBlock, { type: 'text', text: userText }] }]
    })

    const raw      = message.content[0].text.trim()
    const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let result
    try {
      result = JSON.parse(jsonText)
    } catch {
      console.error('JSON parse failed. Raw Claude response:', raw)
      return res.status(422).json({
        error: "Couldn't read this receipt clearly. Please try a sharper photo with good lighting."
      })
    }

    // Ensure confidence is always a number
    if (typeof result.confidence !== 'number') result.confidence = 50

    res.json(result)
  } catch (err) {
    // Anthropic API errors
    if (err.status === 400) {
      return res.status(422).json({
        error: 'This image could not be processed. Try a clearer photo (JPEG or PNG recommended).'
      })
    }
    console.error('Scan error:', err.message)
    res.status(500).json({ error: 'Scanning failed unexpectedly. Please try again.' })
  }
})

export default router
