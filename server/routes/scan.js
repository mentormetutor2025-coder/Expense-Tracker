import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()

// ── Google Vision: extract raw text from image ────────────────────────────────
async function extractTextWithGoogleVision(imageBase64, apiKey) {
  console.log('[scan] Calling Google Vision API...')
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image:    { content: imageBase64 },
          features: [{ type: 'TEXT_DETECTION' }]
        }]
      })
    }
  )
  const data = await response.json()
  console.log('[scan] Google Vision status:', response.status)

  if (!response.ok) {
    const msg = data?.error?.message || `HTTP ${response.status}`
    console.error('[scan] Google Vision error:', msg)
    throw new Error(`Google Vision API error: ${msg}`)
  }

  const text = data.responses?.[0]?.fullTextAnnotation?.text || ''
  console.log('[scan] Google Vision extracted text length:', text.length)
  if (!text) throw new Error('Google Vision could not detect any text in the image.')
  return text
}

// ── Claude: structure raw text into JSON fields ───────────────────────────────
const CLAUDE_STRUCTURE_PROMPT = `You are a receipt and invoice scanner.
Carefully examine this receipt text and extract:
- Vendor/Store name
- Total amount (numbers only, no currency symbol)
- Date of purchase (in YYYY-MM-DD format)
- Best category guess from: Food, Transport, Utilities, Salaries, Office Supplies, Entertainment, Medical, Other
- Confidence score (0-100)

Respond ONLY in this exact JSON format:
{
  "vendor": "store name here",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "category": "category here",
  "confidence": 95
}
If you cannot read a field clearly, use null.`

async function structureWithClaude(rawText, categoryList, apiKey) {
  console.log('[scan] Calling Claude to structure text...')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system:     CLAUDE_STRUCTURE_PROMPT,
    messages:   [{
      role:    'user',
      content: `Receipt text:\n\n${rawText}\n\nAvailable categories: ${categoryList}\n\nReturn ONLY the JSON object.`
    }]
  })

  const raw = message.content[0]?.text?.trim() ?? ''
  console.log('[scan] Claude raw response:', raw)

  let jsonText = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
    .replace(/'/g, '"')  // normalise single quotes

  return JSON.parse(jsonText)
}

// ── Fallback: send image directly to Claude (no Google Vision) ────────────────
async function scanImageWithClaude(imageBase64, mediaType, categoryList, apiKey) {
  console.log('[scan] Calling Claude Vision directly (no Google Vision key)...')
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system:     CLAUDE_STRUCTURE_PROMPT,
    messages:   [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text',  text: `Extract the receipt details. Available categories: ${categoryList}\n\nReturn ONLY the JSON object.` }
      ]
    }]
  })

  const raw = message.content[0]?.text?.trim() ?? ''
  console.log('[scan] Claude Vision raw response:', raw)

  let jsonText = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
    .replace(/'/g, '"')

  return JSON.parse(jsonText)
}

// ── POST /api/scan ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const anthropicKey  = process.env.ANTHROPIC_API_KEY
  const googleVisionKey = process.env.GOOGLE_VISION_API_KEY

  console.log('[scan] ANTHROPIC_API_KEY present:', !!anthropicKey)
  console.log('[scan] GOOGLE_VISION_API_KEY present:', !!googleVisionKey)

  if (!anthropicKey) {
    return res.status(503).json({
      error: 'Receipt scanning requires ANTHROPIC_API_KEY. Add it to your environment variables.'
    })
  }

  const { data, mediaType, categories } = req.body
  if (!data)      return res.status(400).json({ error: 'No image data provided.' })
  if (!mediaType) return res.status(400).json({ error: 'No media type provided.' })

  if (data.length > 13_500_000) {
    return res.status(400).json({ error: 'File too large. Please use an image under 10 MB.' })
  }

  console.log('[scan] mediaType:', mediaType, '| base64 length:', data.length)

  const categoryList = Array.isArray(categories) && categories.length
    ? categories.join(', ')
    : 'Food, Transport, Utilities, Salaries, Office Supplies, Entertainment, Medical, Other'

  try {
    let result

    if (googleVisionKey && mediaType !== 'application/pdf') {
      // ── Two-step: Google Vision OCR → Claude structuring ──────────────────
      const rawText = await extractTextWithGoogleVision(data, googleVisionKey)
      result = await structureWithClaude(rawText, categoryList, anthropicKey)
    } else {
      // ── Fallback: Claude Vision handles image directly ─────────────────────
      if (mediaType === 'application/pdf') {
        // PDFs go directly to Claude as document blocks
        const client = new Anthropic({ apiKey: anthropicKey })
        const message = await client.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system:     CLAUDE_STRUCTURE_PROMPT,
          messages:   [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
              { type: 'text', text: `Available categories: ${categoryList}\n\nReturn ONLY the JSON object.` }
            ]
          }]
        })
        const raw = message.content[0]?.text?.trim() ?? ''
        console.log('[scan] Claude PDF raw response:', raw)
        let jsonText = raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim().replace(/'/g,'"')
        result = JSON.parse(jsonText)
      } else {
        result = await scanImageWithClaude(data, mediaType, categoryList, anthropicKey)
      }
    }

    // Normalise fields
    if (typeof result.confidence !== 'number') result.confidence = 50
    if (typeof result.amount === 'string') {
      const parsed = parseFloat(result.amount.replace(/[^\d.]/g, ''))
      result.amount = isNaN(parsed) ? null : parsed
    }

    console.log('[scan] Final result:', JSON.stringify(result))
    res.json(result)

  } catch (err) {
    console.error('[scan] Error name:', err.name)
    console.error('[scan] Error message:', err.message)
    if (err.status) console.error('[scan] HTTP status:', err.status)
    if (err.error)  console.error('[scan] Error body:', JSON.stringify(err.error))

    if (err.message?.includes('JSON')) {
      return res.status(422).json({
        error: `Scanning completed but response was unreadable. Raw: ${err.message}`
      })
    }
    if (err.status === 401) {
      return res.status(503).json({ error: 'Invalid API key. Check ANTHROPIC_API_KEY.' })
    }
    if (err.status === 400) {
      return res.status(422).json({ error: 'Image could not be processed. Try a clearer JPEG or PNG.' })
    }

    // Return exact error message to client for diagnosis
    res.status(500).json({ error: `Scan failed: ${err.message}` })
  }
})

export default router
