// Shared market model for the cross-exchange board.
//
// Every row keeps its venue so the UI can label the source and the recent list
// can key entries without collisions (`BN:BTCUSDT` vs `HL:BTC`).
// Read-only: no keys, no orders.

export type Venue = 'HL' | 'BN'

export interface Market {
  venue: Venue
  /** Stable id and recent-list key: `${venue}:${symbol}`. */
  key: string
  /** Raw venue symbol used for candles (HL coin or Binance symbol). */
  symbol: string
  /** Display base (HL coin, or Binance symbol without the USDT suffix). */
  coin: string
  mark: number
  /** Oracle for Hyperliquid, index price for Binance. */
  index: number
  change24h: number
  /** Raw funding rate for one funding interval. */
  funding: number
  /** Annualised funding in percent, normalised per venue. */
  fundingApr: number
  /** Open interest in USD; NaN when the venue did not provide it. */
  oiUsd: number
  vol24h: number
  /** 24h high/low; NaN when unknown (HL detail falls back to candles). */
  high24h: number
  low24h: number
  /** NaN when the venue does not publish a per-market max leverage. */
  maxLeverage: number
}

export const VENUE_LABEL: Record<Venue, string> = {
  HL: 'Hyperliquid',
  BN: 'Binance',
}

export const VENUE_TAG: Record<Venue, string> = {
  HL: 'HL',
  BN: 'BN',
}

export const FUNDING_PERIOD: Record<Venue, string> = {
  HL: '1h',
  BN: '8h',
}

/** Convert a per-interval funding rate to an annual percentage. */
export function annualiseFunding(rate: number, periodsPerYear: number): number {
  return Number.isFinite(rate) ? rate * periodsPerYear * 100 : Number.NaN
}
