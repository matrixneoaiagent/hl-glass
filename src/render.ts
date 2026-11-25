import {
  FUNDING_PERIOD,
  VENUE_LABEL,
  VENUE_TAG,
  type Market,
} from './market'
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

export function fmtMoney(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

export function fmtSignedUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : '-'}${fmtMoney(Math.abs(n), digits)}`
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
  // Trailing venue tag plus the optional recent marker; both fit the 7-line grid.
  const tag = `·${VENUE_TAG[m.venue]}`
  const rec = isRecent ? ' ·REC' : ''
  return `${marker}${coin}${price} ${chg} ${fund} ${tag}${rec}`
}

export interface ControlRow {
  label: string
  selected: boolean
}

export interface ListFooterOptions {
  mode?: 'all' | 'stocks'
  focus?: 'stocks' | 'paper' | 'market'
}

export function listBody(
  markets: Market[],
  selected: number,
  recent: readonly string[] = [],
  controls: ControlRow[] = [],
  rows = 7,
): string {
  if (!markets.length) return 'loading markets…'
  const marketRows = rows - controls.length
  const start = Math.max(
    0,
    Math.min(selected - Math.floor(marketRows / 2), markets.length - marketRows),
  )
  const slice = markets.slice(start, start + marketRows)
  const lines: string[] = []
  const controlSelected = controls.some(c => c.selected)
  for (const c of controls) lines.push(`${c.selected ? '>' : ' '}${c.label}`)
  for (let i = 0; i < slice.length; i++) {
    const m = slice[i]
    const isSelected = !controlSelected && start + i === selected
    lines.push(row(m, isSelected ? '>' : ' ', recent.includes(m.key)))
  }
  return lines.join('\n')
}

export function listFooter(
  selected: number,
  total: number,
  recentCount = 0,
  opts: ListFooterOptions = {},
): string {
  const prefix = opts.mode === 'stocks' ? 'STOCKS · ' : ''
  if (opts.focus === 'stocks') {
    const row = opts.mode === 'stocks' ? 'ALL' : 'STOCKS'
    return `${row} row · tap select · 2x exit · recent: local ${recentCount}/${RECENT_MAX}`
  }
  if (opts.focus === 'paper') {
    return `PAPER row · tap open · 2x exit · recent: local ${recentCount}/${RECENT_MAX}`
  }
  return `${prefix}${selected + 1}/${total} · scroll · tap open · 2x exit · recent: local ${recentCount}/${RECENT_MAX}`
}

export function detailBody(m: Market, candles: number[]): string {
  const spark = sparkline(candles)
  const low = Number.isFinite(m.low24h) ? m.low24h : candles.length ? Math.min(...candles) : Number.NaN
  const high = Number.isFinite(m.high24h) ? m.high24h : candles.length ? Math.max(...candles) : Number.NaN
  const range = Number.isFinite(low) ? `${fmtPrice(low)} – ${fmtPrice(high)}` : '—'
  const priceLabel = m.venue === 'BN' ? 'idx' : 'ora'
  const max = Number.isFinite(m.maxLeverage) ? `${m.maxLeverage}x` : '—'
  const period = FUNDING_PERIOD[m.venue]
  const isTradFi = m.assetClass === 'stock' || m.assetClass === 'commodity'
  const kind = m.assetClass === 'stock'
    ? 'STOCK PERP'
    : m.assetClass === 'commodity'
      ? 'COMMODITY PERP'
      : `${VENUE_LABEL[m.venue]} PERP`
  const venue = isTradFi ? ` · ${VENUE_LABEL[m.venue]}` : ''
  const lines = [
    `${kind}${venue} · mark ${fmtPrice(m.mark)}`,
    `${priceLabel} ${fmtPrice(m.index)}  24h ${fmtPct(m.change24h)}`,
    `vol ${fmtUsd(m.vol24h)}  OI ${fmtUsd(m.oiUsd)}`,
    `fund ${fmtPct(m.fundingApr, 2)} APR (${fmtPct(m.funding * 100, 4)}/${period})`,
    `max ${max}  range ${range}`,
    spark ? spark : '24h chart unavailable',
  ]
  return lines.join('\n')
}

export function detailFooter(index: number, total: number): string {
  return `${index + 1}/${total} · scroll next · tap actions · 2x exit`
}
