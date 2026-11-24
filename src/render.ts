import type { Market } from './hl'
import { RECENT_MAX } from './recent'

const BLOCKS = '▁▂▃▄▅▆▇█'

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n >= 100) return n.toFixed(1)
  if (n >= 1) return n.toFixed(2)
  if (n >= 0.01) return n.toFixed(4)
  return n.toPrecision(4)
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function sparkline(values: number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map(v => BLOCKS[Math.min(7, Math.max(0, Math.round(((v - min) / span) * 7)))])
    .join('')
}

function row(m: Market, marker: string, isRecent: boolean): string {
  const coin = m.coin.padEnd(6).slice(0, 6)
  const price = fmtPrice(m.mark).padStart(8)
  const chg = fmtPct(m.change24h).padStart(7)
  const fund = `f${fmtPct(m.fundingApr)}`.padStart(8)
  // Trailing 4-char tag; rows stay on the same 7-line grid.
  const tag = isRecent ? ' ·REC' : ''
  return `${marker}${coin}${price} ${chg} ${fund}${tag}`
}

export function listBody(
  markets: Market[],
  selected: number,
  recent: readonly string[] = [],
  rows = 7,
): string {
  if (!markets.length) return 'loading markets…'
  const start = Math.max(0, Math.min(selected - Math.floor(rows / 2), markets.length - rows))
  const slice = markets.slice(start, start + rows)
  return slice
    .map((m, i) => row(m, start + i === selected ? '>' : ' ', recent.includes(m.coin)))
    .join('\n')
}

export function listFooter(selected: number, total: number, recentCount = 0): string {
  return `${selected + 1}/${total} · scroll · tap open · 2x exit · recent: local ${recentCount}/${RECENT_MAX}`
}

export function detailBody(m: Market, candles: number[]): string {
  const spark = sparkline(candles)
  const lo = candles.length ? Math.min(...candles) : Number.NaN
  const hi = candles.length ? Math.max(...candles) : Number.NaN
  const range = Number.isFinite(lo) ? `range ${fmtPrice(lo)} – ${fmtPrice(hi)}` : 'range —'
  const lines = [
    `mark ${fmtPrice(m.mark)}  ora ${fmtPrice(m.oracle)}`,
    `24h ${fmtPct(m.change24h)}  vol ${fmtUsd(m.vol24h)}`,
    `OI ${fmtUsd(m.oiUsd)}  max ${m.maxLeverage}x`,
    `fund ${fmtPct(m.fundingApr)} APR (${fmtPct(m.funding * 100, 4)}/h)`,
    range,
    spark ? `${spark}` : '24h chart unavailable',
  ]
  return lines.join('\n')
}

export function detailFooter(index: number, total: number): string {
  return `${index + 1}/${total} · scroll next · tap back · 2x exit`
}
