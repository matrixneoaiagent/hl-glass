// Binance USDⓈ-M futures public API client. Read-only: no keys, no orders.
//
// Endpoints (CORS `*`, verified from the host):
//   GET /fapi/v1/ticker/24hr       all symbols, 24h stats
//   GET /fapi/v1/premiumIndex      all symbols, mark/index/funding
//   GET /fapi/v1/exchangeInfo      asset metadata for the Stocks mode
//   GET /fapi/v1/openInterest      one symbol, base-unit open interest
//   GET /fapi/v1/klines            24 hourly closes for the selected detail
//
// The board only uses USDT-margined perpetuals (symbol ends with USDT, no
// dated-contract `_`), sorted by 24h quote volume. Open interest is fetched for
// the top `OI_LIMIT` board rows only, in parallel; individual failures degrade
// to an unknown OI instead of dropping the row. Stock/commodity details fetch
// their own OI lazily when the board did not preload it.
//
// Stocks mode classification comes from exchangeInfo.underlyingType:
// EQUITY / HK_EQUITY / KR_EQUITY / CN_EQUITY / PREMARKET => stock,
// COMMODITY => commodity. The symbol list is data-driven, not hardcoded.

import { annualiseFunding, type AssetClass, type Market } from './market'

const FAPI = 'https://fapi.binance.com'
const OI_LIMIT = 12
const META_TTL = 6 * 3600_000
const META_RETRY = 10 * 60_000

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

interface ExchangeSymbol {
  symbol: string
  quoteAsset: string
  status: string
  underlyingType?: string
}

interface ExchangeInfo {
  symbols: ExchangeSymbol[]
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

export interface BinanceMarkets {
  /** Top `limit` USDT-M perps by 24h quote volume, for the merged board. */
  board: Market[]
  /** Every TRADING tokenized equity/commodity perp, sorted by volume. */
  stocks: Market[]
}

const STOCK_TYPES = new Set(['EQUITY', 'HK_EQUITY', 'KR_EQUITY', 'CN_EQUITY', 'PREMARKET'])

function classify(type: string | undefined): AssetClass {
  if (type === 'COMMODITY') return 'commodity'
  if (type && STOCK_TYPES.has(type)) return 'stock'
  if (type === 'COIN') return 'crypto'
  return 'other'
}

function fallbackClasses(): Map<string, AssetClass> {
  const classes = new Map<string, AssetClass>()
  const stocks = [
    'SOXL', 'SOXS', 'NVDA', 'SNDK', 'SKHYNIX', 'SPCX', 'MU', 'ANT', 'KORU',
    'QQQ', 'SKHY', 'SNXX', 'TQQQ', 'SPY', 'AMD', 'INTC', 'MUU', 'MSTR', 'NBIS',
    'EWY', 'TSLA', 'SAMSUNG', 'DRAM', 'GOOGL', 'SQQQ', 'CRCL', 'MRVL', 'MVLL',
    'AAPL', 'AAOI', 'CRWV', 'LITE', 'DELL', 'ZHONGJI', 'TSM', 'META', 'UNITREE',
    'INTW', 'CBRS', 'AVGO', 'SKDD', 'ZHIPU', 'NVDL', 'COIN', 'UVXY', 'BE',
    'FLNC', 'AMZN', 'PLTR', 'CSOPSKHYNIX2L', 'COHR', 'AXTI', 'MINIMAX', 'MSFT',
    'OPENAI', 'ANTHROPIC', 'MOONSHOT', 'OURA',
  ]
  const commodities = ['XAU', 'XAG', 'CL', 'BZ', 'NATGAS', 'XPT']
  for (const base of stocks) classes.set(`${base}USDT`, 'stock')
  for (const base of commodities) classes.set(`${base}USDT`, 'commodity')
  return classes
}

const FALLBACK_CLASSES = fallbackClasses()
let assetCache: { at: number; classes: Map<string, AssetClass>; fallback: boolean } | null = null

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${FAPI}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`binance HTTP ${res.status}`)
  return (await res.json()) as T
}

function finite(value: string): number {
  return Number.parseFloat(value)
}

async function loadAssetClasses(): Promise<Map<string, AssetClass>> {
  const ttl = assetCache?.fallback ? META_RETRY : META_TTL
  if (assetCache && Date.now() - assetCache.at < ttl) return assetCache.classes

  try {
    const info = await get<ExchangeInfo>('/fapi/v1/exchangeInfo')
    const classes = new Map<string, AssetClass>()
    for (const s of info.symbols) {
      if (s.quoteAsset !== 'USDT' || s.status !== 'TRADING') continue
      classes.set(s.symbol, classify(s.underlyingType))
    }
    assetCache = { at: Date.now(), classes, fallback: false }
    return classes
  } catch (err) {
    console.warn('[hlglass] binance exchangeInfo failed; using fallback asset classes', err)
    assetCache = { at: Date.now(), classes: FALLBACK_CLASSES, fallback: true }
    return FALLBACK_CLASSES
  }
}

export async function fetchBinanceOpenInterest(symbol: string): Promise<number> {
  const row = await get<OpenInterest>(
    `/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`,
  )
  const oi = finite(row.openInterest)
  if (!Number.isFinite(oi) || oi < 0) throw new Error(`bad openInterest for ${symbol}`)
  return oi
}

async function fillOpenInterest(targets: Market[]): Promise<void> {
  const ois = await Promise.allSettled(targets.map(m => fetchBinanceOpenInterest(m.symbol)))
  let misses = 0
  ois.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const m = targets[i]
      m.oiUsd = result.value * m.mark
    } else {
      misses++
    }
  })
  if (misses) console.warn(`[hlglass] binance openInterest misses=${misses}/${targets.length}`)
}

/** Top USDT-M perps plus the classified equity/commodity universe. */
export async function fetchBinanceMarkets(limit = 12): Promise<BinanceMarkets> {
  const [tickers, premiums, classes] = await Promise.all([
    get<Ticker24h[]>('/fapi/v1/ticker/24hr'),
    get<PremiumIndex[]>('/fapi/v1/premiumIndex'),
    loadAssetClasses(),
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
      assetClass: classes.get(t.symbol) ?? FALLBACK_CLASSES.get(t.symbol) ?? 'other',
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
  const board = rows.slice(0, limit)
  const stocks = rows.filter(
    m => m.assetClass === 'stock' || m.assetClass === 'commodity',
  )

  // OI is a second round trip per symbol, so only the top board rows get it.
  // Stock-mode details that were not in the board preload lazy-fetch their OI.
  await fillOpenInterest(board.slice(0, OI_LIMIT))

  return { board, stocks }
}

export async function fetchBinanceCandles(symbol: string): Promise<number[]> {
  const rows = await get<Kline[]>(
    `/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=24`,
  )
  return rows.map(r => finite(r[4])).filter(Number.isFinite)
}

/** Lightweight mark lookup for the 5-second paper-PnL ticker. */
export async function fetchBinanceMark(symbol: string): Promise<number> {
  const p = await get<PremiumIndex>(
    `/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`,
  )
  const mark = finite(p.markPrice)
  if (!Number.isFinite(mark) || mark <= 0) throw new Error(`bad mark for ${symbol}`)
  return mark
}
