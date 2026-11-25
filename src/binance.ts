// Binance USDⓈ-M futures public API client. Read-only: no keys, no orders.
//
// Endpoints (CORS `*`, verified from the host):
//   GET /fapi/v1/ticker/24hr       all symbols, 24h stats
//   GET /fapi/v1/premiumIndex      all symbols, mark/index/funding
//   GET /fapi/v1/openInterest      one symbol, base-unit open interest
//   GET /fapi/v1/klines            24 hourly closes for the selected detail
//
// The board only uses USDT-margined perpetuals (symbol ends with USDT, no
// dated-contract `_`), sorted by 24h quote volume. Open interest is fetched for
// the top `OI_LIMIT` rows only, in parallel, and individual failures degrade to
// an unknown OI instead of dropping the row.

import { annualiseFunding, type Market } from './market'

const FAPI = 'https://fapi.binance.com'
const OI_LIMIT = 12

interface Ticker24h {
  symbol: string
  lastPrice: string
  openPrice: string
  highPrice: string
  lowPrice: string
  priceChangePercent: string
  quoteVolume: string
}

interface PremiumIndex {
  symbol: string
  markPrice: string
  indexPrice: string
  lastFundingRate: string
  nextFundingTime: number
}

interface OpenInterest {
  symbol: string
  openInterest: string
}

type Kline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
]

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${FAPI}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`binance HTTP ${res.status}`)
  return (await res.json()) as T
}

function finite(value: string): number {
  return Number.parseFloat(value)
}

async function fetchOpenInterest(symbol: string): Promise<number> {
  const row = await get<OpenInterest>(
    `/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`,
  )
  const oi = finite(row.openInterest)
  if (!Number.isFinite(oi) || oi < 0) throw new Error(`bad openInterest for ${symbol}`)
  return oi
}

/** Top USDT-M perps by 24h quote volume, joined with mark/index/funding. */
export async function fetchBinanceMarkets(limit = 12): Promise<Market[]> {
  const [tickers, premiums] = await Promise.all([
    get<Ticker24h[]>('/fapi/v1/ticker/24hr'),
    get<PremiumIndex[]>('/fapi/v1/premiumIndex'),
  ])
  const premium = new Map(premiums.map(p => [p.symbol, p]))
  const rows: Market[] = []

  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT') || t.symbol.includes('_')) continue
    const last = finite(t.lastPrice)
    const open = finite(t.openPrice)
    const vol = finite(t.quoteVolume)
    const high = finite(t.highPrice)
    const low = finite(t.lowPrice)
    if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(vol) || vol <= 0) continue

    const p = premium.get(t.symbol)
    const mark = p ? finite(p.markPrice) : Number.NaN
    const index = p ? finite(p.indexPrice) : Number.NaN
    const funding = p ? finite(p.lastFundingRate) : Number.NaN
    const markPx = Number.isFinite(mark) && mark > 0 ? mark : last

    const pct = finite(t.priceChangePercent)
    const change = Number.isFinite(pct)
      ? pct
      : Number.isFinite(open) && open > 0
        ? ((last - open) / open) * 100
        : Number.NaN

    rows.push({
      venue: 'BN',
      key: `BN:${t.symbol}`,
      symbol: t.symbol,
      coin: t.symbol.slice(0, -4),
      mark: markPx,
      index: Number.isFinite(index) && index > 0 ? index : markPx,
      change24h: change,
      funding,
      // Binance funding is charged every 8 hours.
      fundingApr: annualiseFunding(funding, 3 * 365),
      oiUsd: Number.NaN,
      vol24h: vol,
      high24h: high,
      low24h: low,
      maxLeverage: Number.NaN,
    })
  }

  rows.sort((a, b) => b.vol24h - a.vol24h)
  const top = rows.slice(0, limit)

  // OI is a second round trip per symbol, so only the top N get it. allSettled
  // keeps the board alive when an individual call is rate-limited.
  const oiTargets = top.slice(0, OI_LIMIT)
  const ois = await Promise.allSettled(oiTargets.map(m => fetchOpenInterest(m.symbol)))
  let misses = 0
  ois.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const m = oiTargets[i]
      m.oiUsd = result.value * m.mark
    } else {
      misses++
    }
  })
  if (misses) console.warn(`[hlglass] binance openInterest misses=${misses}/${oiTargets.length}`)

  return top
}

export async function fetchBinanceCandles(symbol: string): Promise<number[]> {
  const rows = await get<Kline[]>(
    `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=24`,
  )
  return rows.map(r => finite(r[4])).filter(Number.isFinite)
}
