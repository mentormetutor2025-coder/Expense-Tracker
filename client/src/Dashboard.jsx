import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar
} from 'recharts'
import { formatDateTime } from './locationUtils'

const fmt = amount =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)

const fmtFull = amount =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)

const FALLBACK_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'
]

function barColor(pct) {
  if (pct >= 100) return '#ef4444'
  if (pct >= 80)  return '#f97316'
  return '#22c55e'
}

// ── Spend card ───────────────────────────────────────────────────────────────
function SpendCard({ label, amount, sub, accent }) {
  return (
    <div className="dash-card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="dash-card-label">{label}</div>
      <div className="dash-card-value" style={{ color: accent }}>{fmt(amount)}</div>
      {sub && <div className="dash-card-sub">{sub}</div>}
    </div>
  )
}

// ── Alerts ───────────────────────────────────────────────────────────────────
function Alerts({ items }) {
  if (!items.length) return null
  return (
    <div className="alerts-stack">
      {items.map(item => (
        <div key={item.name} className={`alert-banner alert-${item.level}`}>
          <span className="alert-icon">{item.level === 'exceeded' ? '🚨' : '⚠️'}</span>
          <div className="alert-body">
            <strong>{item.name}</strong>
            {item.level === 'exceeded'
              ? ` budget exceeded — spent ${fmt(item.spent)} of ${fmt(item.budget)} (${item.pct}%)`
              : ` nearing budget limit — spent ${fmt(item.spent)} of ${fmt(item.budget)} (${item.pct}%)`
            }
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Budget progress bars ──────────────────────────────────────────────────────
function BudgetProgress({ items }) {
  if (!items.length) return null
  return (
    <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
      <div className="chart-title">Monthly Budget Progress</div>
      <div className="budget-list">
        {items.map(item => {
          const pct    = Math.min(item.pct, 100)
          const color  = barColor(item.pct)
          return (
            <div key={item.name} className="budget-row">
              <div className="budget-row-top">
                <div className="budget-name-wrap">
                  <span className="budget-dot" style={{ background: item.color }} />
                  <span className="budget-name">{item.name}</span>
                </div>
                <div className="budget-amounts">
                  <span className="budget-spent" style={{ color }}>{fmt(item.spent)}</span>
                  <span className="budget-sep"> of </span>
                  <span className="budget-limit">{fmt(item.budget)}</span>
                  <span className={`budget-pct-badge budget-pct-${item.level}`}>
                    {item.pct}%
                  </span>
                </div>
              </div>
              <div className="budget-track">
                <div
                  className="budget-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              {item.pct > 100 && (
                <div className="budget-overflow" style={{ width: `${Math.min(item.pct - 100, 100)}%`, marginTop: 2 }}>
                  <div className="budget-fill-over" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="ct-label">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="ct-row" style={{ color: p.color }}>
          <span className="ct-name">{p.name ?? p.dataKey}</span>
          <span className="ct-val">{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="chart-tooltip">
      <div className="ct-label">{name}</div>
      <div className="ct-row"><span className="ct-val">{fmtFull(value)}</span></div>
    </div>
  )
}

// ── Recent Activity ───────────────────────────────────────────────────────────
function RecentActivity({ expenses, categoryColors, onEditExpense }) {
  if (!expenses.length) return null
  const fmtAmt = amount =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount)

  return (
    <div className="chart-card recent-activity-card" style={{ gridColumn: '1 / -1' }}>
      <div className="chart-title">Recent Activity</div>
      <div className="recent-list">
        {expenses.map(exp => (
          <button
            key={exp.id}
            className="recent-item"
            onClick={() => onEditExpense(exp)}
          >
            <div className="recent-item-left">
              <div className="recent-item-desc">{exp.description}</div>
              <div className="recent-item-meta">
                {exp.time && (
                  <span className="recent-item-time">🕐 {exp.time}</span>
                )}
                {exp.companyName && (
                  <span className="recent-item-loc">🏢 {exp.companyName}</span>
                )}
                {exp.capturedBy && (
                  <span className="recent-item-loc">👤 {exp.capturedBy}</span>
                )}
                {exp.location && (
                  <span className="recent-item-loc">📍 {exp.location.display}</span>
                )}
                {!exp.time && !exp.companyName && !exp.location && (
                  <span className="recent-item-date">{exp.date}</span>
                )}
              </div>
            </div>
            <div className="recent-item-right">
              <span
                className="category-badge"
                style={{
                  background: (categoryColors[exp.category] ?? '#6366f1') + '22',
                  color: categoryColors[exp.category] ?? '#6366f1'
                }}
              >
                {exp.category}
              </span>
              <span className="recent-item-amount">{fmtAmt(exp.amount)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ summary, recentExpenses = [], onEditExpense }) {
  const {
    todayTotal = 0, weekTotal = 0, monthTotal = 0,
    byCategory = {}, byCategoryThisMonth = {},
    categoryColors = {}, categoryBudgets = {},
    dailyThisMonth = [], weekComparison = []
  } = summary

  const now       = new Date()
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  // Budget items — only categories that have a limit set
  const budgetItems = Object.entries(categoryBudgets)
    .map(([name, budget]) => {
      const spent = byCategoryThisMonth[name] ?? 0
      const pct   = Math.round((spent / budget) * 100)
      const level = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok'
      return { name, budget, spent, pct, level, color: categoryColors[name] ?? '#6366f1' }
    })
    .sort((a, b) => b.pct - a.pct)

  // Alerts — warning (≥80%) and exceeded (≥100%)
  const alerts = budgetItems.filter(i => i.level !== 'ok')

  // Pie data — all-time by category, largest first
  const pieData = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name, value,
      color: categoryColors[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
    }))

  // Line — trim days beyond today
  const lineData = dailyThisMonth.filter(d => d.day <= now.getDate())

  const tickFmt = v => (v === 0 ? '' : fmt(v))

  return (
    <div className="dashboard">
      {/* ── Alerts ── */}
      <Alerts items={alerts} />

      {/* ── Spend cards ── */}
      <div className="dash-cards">
        <SpendCard
          label="Today"
          amount={todayTotal}
          sub={now.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short' })}
          accent="#6366f1"
        />
        <SpendCard label="This Week"  amount={weekTotal}  sub="Monday – today" accent="#f59e0b" />
        <SpendCard label="This Month" amount={monthTotal} sub={monthName}      accent="#10b981" />
      </div>

      {/* ── Recent Activity ── */}
      <div className="charts-grid" style={{ marginBottom: 0 }}>
        <RecentActivity
          expenses={recentExpenses}
          categoryColors={categoryColors}
          onEditExpense={onEditExpense}
        />
      </div>

      {/* ── Charts + budget grid ── */}
      <div className="charts-grid">

        {/* Budget progress — full width, shown only when budgets exist */}
        <BudgetProgress items={budgetItems} />

        {/* Line — daily this month */}
        <div className="chart-card wide">
          <div className="chart-title">Daily Spending — {monthName}</div>
          {lineData.every(d => d.amount === 0) ? (
            <div className="chart-empty">No expenses this month yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={lineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone" dataKey="amount" name="Spent"
                  stroke="#6366f1" strokeWidth={2.5}
                  dot={{ r: 3, fill: '#6366f1' }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie — by category */}
        <div className="chart-card">
          <div className="chart-title">Spending by Category</div>
          {pieData.length === 0 ? (
            <div className="chart-empty">No expenses yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="45%"
                  outerRadius={85} innerRadius={40}
                  dataKey="value" paddingAngle={2}
                >
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  formatter={v => <span style={{ fontSize: 11 }}>{v}</span>}
                  iconSize={10} iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar — this week vs last week */}
        <div className="chart-card">
          <div className="chart-title">This Week vs Last Week</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekComparison} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} iconSize={10} />
              <Bar dataKey="thisWeek" name="This week" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="lastWeek" name="Last week" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  )
}
