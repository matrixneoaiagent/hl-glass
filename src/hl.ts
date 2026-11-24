// Hyperliquid public API client. Read-only: no keys, no orders.
// CORS is `*` on api.hyperliquid.xyz, so the webview can call it directly.

export interface Market {
  coin: string
  mark: number
  oracle: number
  prevDay: number
  change24h: number
  funding: number
  fundingApr: number
  oiUsd: number
  vol24h: number
  maxLeverage: number
}

interface UniverseItem {
  name: string
  maxLeverage: number
  isDelisted?: boolean
}

interface AssetCtx {
  funding: string
  openInterest: string
  prevDayPx: string
  dayNtlVlm: string
  markPx: string
  oraclePx: string
}

interface Candle {
  c: string
}

const API = 'https://api.hyperliquid.xyz/info'

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function fetchMarkets(limit = 20): Promise<Market[]> {
  const [meta, ctxs] = await post<[{ universe: UniverseItem[] }, AssetCtx[]]>({
    type: 'metaAndAssetCtxs',
  })
  const out: Market[] = []
  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i]
    const c = ctxs[i]
    if (!u || !c || u.isDelisted) continue
    const mark = Number.parseFloat(c.markPx)
    const oracle = Number.parseFloat(c.oraclePx)
    const prevDay = Number.parseFloat(c.prevDayPx)
    const vol = Number.parseFloat(c.dayNtlVlm)
    const oi = Number.parseFloat(c.openInterest)
    const funding = Number.parseFloat(c.funding)
    if (!Number.isFinite(mark) || !Number.isFinite(prevDay) || prevDay <= 0) continue
    if (!Number.isFinite(vol) || vol <= 0) continue
    out.push({
      coin: u.name,
      mark,
      oracle: Number.isFinite(oracle) ? oracle : mark,
      prevDay,
      change24h: ((mark - prevDay) / prevDay) * 100,
      funding: Number.isFinite(funding) ? funding : 0,
      fundingApr: (Number.isFinite(funding) ? funding : 0) * 24 * 365 * 100,
      oiUsd: (Number.isFinite(oi) ? oi : 0) * mark,
      vol24h: vol,
      maxLeverage: u.maxLeverage,
    })
  }
  out.sort((a, b) => b.vol24h - a.vol24h)
  return out.slice(0, limit)
}

export async function fetchCandles(coin: string): Promise<number[]> {
  const now = Date.now()
  const rows = await post<Candle[]>({
    type: 'candleSnapshot',
    req: { coin, interval: '1h', startTime: now - 24 * 3600 * 1000 },
  })
  return rows.map(r => Number.parseFloat(r.c)).filter(Number.isFinite)
}
