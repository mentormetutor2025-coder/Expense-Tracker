import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── shared helpers ────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

function fmtAmount(amount, currency) {
  return `${currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDateTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-ZA',  { day: 'numeric', month: 'short', year: 'numeric' })
  return `${time} on ${date}`
}

function fmtLocation(location) {
  if (!location) return ''
  return location.display || 'Location detected'
}

function buildSummary(expenses) {
  const byCategory = {}
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  }
  return Object.entries(byCategory).sort((a, b) => b[1] - a[1])
}

// ── Excel export ──────────────────────────────────────────────────────────────

export function exportToExcel(expenses, settings, dateRange) {
  const { businessName, currency } = settings
  const total    = expenses.reduce((s, e) => s + e.amount, 0)
  const summary  = buildSummary(expenses)
  const generated = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
  const periodLabel = `${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)}`

  const hasTime        = expenses.some(e => e.time)
  const hasLocation    = expenses.some(e => e.location)
  const hasCompanyName = expenses.some(e => e.companyName)
  const hasCapturedBy  = expenses.some(e => e.capturedBy)

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Expenses ──────────────────────────────────────────────────────
  const expRows = []

  // Meta header block
  const numCols = 5 + (hasTime ? 1 : 0) + (hasLocation ? 1 : 0)
  const blank   = Array(numCols).fill('')
  if (businessName) expRows.push([businessName, ...blank.slice(1)])
  expRows.push(['Expense Report', ...blank.slice(1)])
  expRows.push([`Period: ${periodLabel}`, ...blank.slice(1)])
  expRows.push([`Generated: ${generated}`, ...blank.slice(1)])
  expRows.push(blank)

  // Column headers
  const COL_HEADERS = ['Date', 'Description', 'Category', `Amount (${currency})`]
  if (hasCompanyName) COL_HEADERS.push('Company Name')
  if (hasTime)        COL_HEADERS.push('Time')
  if (hasCapturedBy)  COL_HEADERS.push('Captured By')
  if (hasLocation)    COL_HEADERS.push('Location')
  expRows.push(COL_HEADERS)

  // Data rows
  for (const e of expenses) {
    const row = [e.date, e.description, e.category, e.amount]
    if (hasCompanyName) row.push(e.companyName || '')
    if (hasTime)        row.push(e.time        || '')
    if (hasCapturedBy)  row.push(e.capturedBy  || '')
    if (hasLocation)    row.push(fmtLocation(e.location))
    expRows.push(row)
  }

  // Summary block
  expRows.push(blank)
  expRows.push(['SUMMARY', ...blank.slice(1)])
  expRows.push(['Total', '', '', total, ...blank.slice(4)])
  expRows.push(blank)
  expRows.push(['Category Breakdown', ...blank.slice(1)])
  expRows.push(['Category', '', '', `Amount (${currency})`, ...blank.slice(4)])
  for (const [cat, amt] of summary) {
    expRows.push([cat, '', '', amt, ...blank.slice(4)])
  }

  const ws1 = XLSX.utils.aoa_to_sheet(expRows)

  // Column widths
  ws1['!cols'] = [
    { wch: 14 },   // Date
    { wch: 32 },   // Description
    { wch: 20 },   // Category
    { wch: 16 },   // Amount
  ]
  if (hasCompanyName) ws1['!cols'].push({ wch: 24 })
  if (hasTime)        ws1['!cols'].push({ wch: 10 })
  if (hasCapturedBy)  ws1['!cols'].push({ wch: 22 })
  if (hasLocation)    ws1['!cols'].push({ wch: 30 })

  // Number format for amount cells
  const dataStartRow = (businessName ? 1 : 0) + 4 + 1 + 1
  for (let i = 0; i < expenses.length; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: dataStartRow + i, c: 3 })
    if (ws1[cellRef]) ws1[cellRef].z = `"${currency}"#,##0.00`
  }

  XLSX.utils.book_append_sheet(wb, ws1, 'Expenses')

  // ── Sheet 2: Summary ───────────────────────────────────────────────────────
  const sumRows = []
  if (businessName) sumRows.push([businessName, ''])
  sumRows.push(['Expense Summary', ''])
  sumRows.push([`Period: ${periodLabel}`, ''])
  sumRows.push(['', ''])
  sumRows.push(['Category', `Amount (${currency})`])
  for (const [cat, amt] of summary) sumRows.push([cat, amt])
  sumRows.push(['', ''])
  sumRows.push(['TOTAL', total])

  const ws2 = XLSX.utils.aoa_to_sheet(sumRows)
  ws2['!cols'] = [{ wch: 26 }, { wch: 18 }]

  const sumDataStart = (businessName ? 1 : 0) + 3 + 1 + 1
  for (let i = 0; i < summary.length + 1; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: sumDataStart + i, c: 1 })
    if (ws2[cellRef] && typeof ws2[cellRef].v === 'number') ws2[cellRef].z = `"${currency}"#,##0.00`
  }

  XLSX.utils.book_append_sheet(wb, ws2, 'Summary')

  const filename = `expenses_${dateRange.from}_to_${dateRange.to}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ── PDF export ────────────────────────────────────────────────────────────────

const PRIMARY   = [99, 102, 241]    // #6366f1
const DARK      = [30, 41, 59]      // #1e293b
const MUTED     = [100, 116, 139]   // #64748b
const LIGHT_ROW = [248, 250, 252]   // #f8fafc
const WHITE     = [255, 255, 255]

export function exportToPDF(expenses, settings, dateRange) {
  const { businessName, currency } = settings
  const total     = expenses.reduce((s, e) => s + e.amount, 0)
  const summary   = buildSummary(expenses)
  const generated = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
  const periodLabel = `${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)}`

  const hasTime        = expenses.some(e => e.time)
  const hasLocation    = expenses.some(e => e.location)
  const hasCompanyName = expenses.some(e => e.companyName)
  const hasCapturedBy  = expenses.some(e => e.capturedBy)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, pageW, 38, 'F')

  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(businessName || 'Expense Report', 14, 14)

  if (businessName) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('Expense Report', 14, 22)
  }

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Period: ${periodLabel}`, pageW - 14, 14, { align: 'right' })
  doc.text(`Generated: ${generated}`, pageW - 14, 20.5, { align: 'right' })
  doc.text(`${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`, pageW - 14, 27, { align: 'right' })

  // ── Expenses table ────────────────────────────────────────────────────────
  const head = [['Date', 'Description', 'Category', `Amount (${currency})`]]
  if (hasCompanyName) head[0].push('Company')
  if (hasTime)        head[0].push('Time')
  if (hasCapturedBy)  head[0].push('Captured By')
  if (hasLocation)    head[0].push('Location')

  const extraCols = [hasCompanyName, hasTime, hasCapturedBy, hasLocation].filter(Boolean).length
  const descWidth = extraCols >= 3 ? 36 : extraCols >= 1 ? 44 : 65

  const body = expenses.map(e => {
    const row = [e.date, e.description, e.category, fmtAmount(e.amount, currency)]
    if (hasCompanyName) row.push(e.companyName || '—')
    if (hasTime)        row.push(e.time        || '—')
    if (hasCapturedBy)  row.push(e.capturedBy  || '—')
    if (hasLocation)    row.push(fmtLocation(e.location) || '—')
    return row
  })

  // Build column styles dynamically
  const colStyles = {
    0: { cellWidth: 20 },
    1: { cellWidth: descWidth },
    2: { cellWidth: 24 },
    3: { cellWidth: 22, halign: 'right' },
  }
  let ci = 4
  if (hasCompanyName) colStyles[ci++] = { cellWidth: 26 }
  if (hasTime)        colStyles[ci++] = { cellWidth: 14 }
  if (hasCapturedBy)  colStyles[ci++] = { cellWidth: 22 }
  if (hasLocation)    colStyles[ci]   = { cellWidth: 'auto' }

  autoTable(doc, {
    startY: 44,
    head,
    body,
    headStyles: {
      fillColor: DARK,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 7.5, textColor: DARK },
    alternateRowStyles: { fillColor: LIGHT_ROW },
    columnStyles: colStyles,
    margin: { left: 14, right: 14 },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages()
      const pageNum   = doc.internal.getCurrentPageInfo().pageNumber
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(
        `Page ${pageNum} of ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      )
    },
  })

  // ── Summary table ─────────────────────────────────────────────────────────
  const afterExpenses = doc.lastAutoTable.finalY + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('Summary', 14, afterExpenses)

  autoTable(doc, {
    startY: afterExpenses + 4,
    head: [['Category', `Amount (${currency})`]],
    body: summary.map(([cat, amt]) => [cat, fmtAmount(amt, currency)]),
    foot: [['TOTAL', fmtAmount(total, currency)]],
    headStyles: {
      fillColor: DARK,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: { fontSize: 8.5, textColor: DARK },
    footStyles: {
      fillColor: PRIMARY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: LIGHT_ROW },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 40, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
    didDrawPage: () => {
      const pageNum = doc.internal.getCurrentPageInfo().pageNumber
      const pageCount = doc.internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(
        `Page ${pageNum} of ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      )
    },
  })

  const filename = `expense_report_${dateRange.from}_to_${dateRange.to}.pdf`
  doc.save(filename)
}
