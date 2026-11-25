// Hyperliquid public API client. Read-only: no keys, no orders.
// CORS is `*` on api.hyperliquid.xyz, so the webview can call it directly.

import { annualiseFunding, type Market } from './market'

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
  if (!res.ok) throw new Error(`hyperliquid HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function fetchHlMarkets(limit = 20): Promise<Market[]> {
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
      venue: 'HL',
      key: `HL:${u.name}`,
      symbol: u.name,
      coin: u.name,
      assetClass: 'crypto',
      mark,
      index: Number.isFinite(oracle) ? oracle : mark,
      change24h: ((mark - prevDay) / prevDay) * 100,
      funding: Number.isFinite(funding) ? funding : Number.NaN,
      // Hyperliquid funding is hourly.
      fundingApr: annualiseFunding(funding, 24 * 365),
      oiUsd: Number.isFinite(oi) ? oi * mark : Number.NaN,
      vol24h: vol,
      high24h: Number.NaN,
      low24h: Number.NaN,
      maxLeverage: u.maxLeverage,
    })
  }
  out.sort((a, b) => b.vol24h - a.vol24h)
  return out.slice(0, limit)
}

export async function fetchHlCandles(coin: string): Promise<number[]> {
  const now = Date.now()
  const rows = await post<Candle[]>({
    type: 'candleSnapshot',
    req: { coin, interval: '1h', startTime: now - 24 * 3600 * 1000 },
  })
  return rows.map(r => Number.parseFloat(r.c)).filter(Number.isFinite)
}

/** Exact marks for open paper positions; one metaAndAssetCtxs call. */
export async function fetchHlMarks(coins: string[]): Promise<Record<string, number>> {
  const [meta, ctxs] = await post<[{ universe: UniverseItem[] }, AssetCtx[]]>({
    type: 'metaAndAssetCtxs',
  })
  const wanted = new Set(coins)
  const out: Record<string, number> = {}
  for (let i = 0; i < meta.universe.length; i++) {
    const u = meta.universe[i]
    if (!u || !wanted.has(u.name)) continue
    const mark = Number.parseFloat(ctxs[i]?.markPx ?? '')
    if (Number.isFinite(mark) && mark > 0) out[u.name] = mark
  }
  return out
}
