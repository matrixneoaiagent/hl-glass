// Local paper-trading session. There is no exchange trading here: no keys, no
// orders, no custody, no network trading calls. The only persistence is the
// paper account JSON in the Even Hub SDK store plus a browser mirror.

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AssetClass, Venue } from './market'

export type Side = 'long' | 'short'
export type AlertDirection = 'above' | 'below'

export interface PaperPosition {
  id: string
  key: string
  coin: string
  symbol: string
  venue: Venue
  assetClass: AssetClass
  side: Side
  notional: number
  leverage: number
  entry: number
  margin: number
  /** Last observed mark; used for a frozen PnL if the venue is offline. */
  lastMark: number
  openedAt: number
}

export interface PaperAlert {
  id: string
  key: string
  coin: string
  venue: Venue
  direction: AlertDirection
  /** Percent distance from the mark when the alert was created. */
  pct: number
  target: number
  createdAt: number
}

export interface PaperState {
  spot: number
  margin: number
  realized: number
  positions: PaperPosition[]
  alerts: PaperAlert[]
}

export const PAPER_KEY = 'hlglass.paper.v1'
export const PAPER_MAX_POSITIONS = 5
export const PAPER_MAX_ALERTS = 5
export const PAPER_START_SPOT = 9500
export const PAPER_START_MARGIN = 500

export function defaultPaper(): PaperState {
  return {
    spot: PAPER_START_SPOT,
    margin: PAPER_START_MARGIN,
    realized: 0,
    positions: [],
    alerts: [],
  }
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && /^(HL|BN):[A-Za-z0-9:_-]{1,20}$/.test(value)
}

function isVenue(value: unknown): value is Venue {
  return value === 'HL' || value === 'BN'
}

function isAssetClass(value: unknown): value is AssetClass {
  return value === 'crypto' || value === 'stock' || value === 'commodity' || value === 'other'
}

function cleanPosition(raw: unknown): PaperPosition | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isKey(o.key) || !isVenue(o.venue) || !isAssetClass(o.assetClass)) return null
  if (typeof o.id !== 'string' || !o.id || o.id.length > 40) return null
  if (typeof o.coin !== 'string' || !o.coin || o.coin.length > 12) return null
  if (typeof o.symbol !== 'string' || !o.symbol || o.symbol.length > 20) return null
  if (o.side !== 'long' && o.side !== 'short') return null
  if (!isNum(o.notional) || o.notional <= 0 || o.notional > 1e6) return null
  if (!isNum(o.leverage) || o.leverage < 1 || o.leverage > 3) return null
  if (!isNum(o.entry) || o.entry <= 0) return null
  if (!isNum(o.margin) || o.margin <= 0) return null
  const lastMark = isNum(o.lastMark) && o.lastMark > 0 ? o.lastMark : o.entry
  return {
    id: o.id,
    key: o.key,
    coin: o.coin,
    symbol: o.symbol,
    venue: o.venue,
    assetClass: o.assetClass,
    side: o.side,
    notional: o.notional,
    leverage: o.leverage,
    entry: o.entry,
    margin: o.margin,
    lastMark,
    openedAt: isNum(o.openedAt) ? o.openedAt : 0,
  }
}

function cleanAlert(raw: unknown): PaperAlert | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isKey(o.key) || !isVenue(o.venue)) return null
  if (typeof o.id !== 'string' || !o.id || o.id.length > 40) return null
  if (typeof o.coin !== 'string' || !o.coin || o.coin.length > 12) return null
  if (o.direction !== 'above' && o.direction !== 'below') return null
  if (!isNum(o.pct) || o.pct < 0 || o.pct > 100) return null
  if (!isNum(o.target) || o.target <= 0) return null
  return {
    id: o.id,
    key: o.key,
    coin: o.coin,
    venue: o.venue,
    direction: o.direction,
    pct: o.pct,
    target: o.target,
    createdAt: isNum(o.createdAt) ? o.createdAt : 0,
  }
}

function cleanState(raw: string): PaperState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  if (!isNum(o.spot) || o.spot < 0) return null
  if (!isNum(o.margin) || o.margin < 0) return null
  if (!isNum(o.realized)) return null
  const positions = Array.isArray(o.positions)
    ? o.positions.map(cleanPosition).filter((p): p is PaperPosition => p !== null)
    : []
  const alerts = Array.isArray(o.alerts)
    ? o.alerts.map(cleanAlert).filter((a): a is PaperAlert => a !== null)
    : []
  return {
    spot: o.spot,
    margin: o.margin,
    realized: o.realized,
    positions: positions.slice(0, PAPER_MAX_POSITIONS),
    alerts: alerts.slice(0, PAPER_MAX_ALERTS),
  }
}

function readBrowser(): string {
  try {
    return window.localStorage.getItem(PAPER_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeBrowser(value: string): void {
  try {
    window.localStorage.setItem(PAPER_KEY, value)
  } catch {
    /* storage can be disabled; the in-memory session still works */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

export class PaperStore {
  private data: PaperState = defaultPaper()
  private bridge: EvenAppBridge | null = null
  private backend: 'sdk' | 'browser' | 'none' = 'none'
  private writes: Promise<void> = Promise.resolve()

  get state(): PaperState {
    return this.data
  }

  async load(bridge: EvenAppBridge | null): Promise<void> {
    this.bridge = bridge
    let sdkRaw = ''
    if (bridge) {
      try {
        sdkRaw = await withTimeout(bridge.getLocalStorage(PAPER_KEY), 1500, '')
      } catch {
        sdkRaw = ''
      }
    }
    const sdkState = cleanState(sdkRaw)
    const browserState = cleanState(readBrowser())
    if (sdkState) {
      this.data = sdkState
      this.backend = 'sdk'
    } else if (browserState) {
      this.data = browserState
      this.backend = 'browser'
    } else {
      this.data = defaultPaper()
    }
    console.info(
      `[hlglass] paper load backend=${this.backend} spot=${this.data.spot} ` +
        `margin=${this.data.margin} positions=${this.data.positions.length} alerts=${this.data.alerts.length}`,
    )
  }

  async save(): Promise<void> {
    const value = JSON.stringify(this.data)
    writeBrowser(value)
    this.writes = this.writes.then(() => this.persist(value)).catch(() => {})
    await this.writes
  }

  reset(): void {
    this.data = defaultPaper()
    void this.save()
    console.info('[hlglass] paper reset')
  }

  private async persist(value: string): Promise<void> {
    if (this.bridge) {
      try {
        const ok = await withTimeout(this.bridge.setLocalStorage(PAPER_KEY, value), 1500, false)
        console.info(
          `[hlglass] paper save backend=sdk ok=${ok} positions=${this.data.positions.length} alerts=${this.data.alerts.length}`,
        )
        if (ok) {
          const readBack = await withTimeout(this.bridge.getLocalStorage(PAPER_KEY), 1500, '')
          console.info(
            `[hlglass] paper readback match=${readBack === value} bytes=${readBack.length}`,
          )
          this.backend = 'sdk'
          return
        }
      } catch (err) {
        console.warn('[hlglass] paper save sdk failed; browser mirror kept', err)
      }
    }
    this.backend = 'browser'
  }
}

export function positionPnl(p: PaperPosition, mark: number): number {
  if (!Number.isFinite(mark) || mark <= 0 || p.entry <= 0) return 0
  return ((mark - p.entry) / p.entry) * p.notional * (p.side === 'long' ? 1 : -1)
}

export function positionPnlPct(p: PaperPosition, mark: number): number {
  if (!Number.isFinite(mark) || mark <= 0 || p.entry <= 0) return 0
  return ((mark - p.entry) / p.entry) * 100 * (p.side === 'long' ? 1 : -1)
}

export function lockedMargin(paper: PaperState): number {
  return paper.positions.reduce((sum, p) => sum + p.margin, 0)
}

export function unrealizedPnl(
  paper: PaperState,
  markOf: (position: PaperPosition) => number,
): number {
  return paper.positions.reduce((sum, p) => sum + positionPnl(p, markOf(p)), 0)
}

export function paperEquity(
  paper: PaperState,
  markOf: (position: PaperPosition) => number,
): number {
  return paper.spot + paper.margin + lockedMargin(paper) + unrealizedPnl(paper, markOf)
}

/** Simplified liquidation estimate; not an exchange risk engine. */
export function liqEstimateAt(entry: number, leverage: number, side: Side): number {
  const maintenance = 0.005
  return side === 'long'
    ? Math.max(0, entry * (1 - 1 / leverage + maintenance))
    : entry * (1 + 1 / leverage - maintenance)
}

export function liqEstimate(p: PaperPosition): number {
  return liqEstimateAt(p.entry, p.leverage, p.side)
}

export function targetFromMark(
  mark: number,
  direction: AlertDirection,
  pct: number,
): number {
  return direction === 'above'
    ? mark * (1 + pct / 100)
    : mark * (1 - pct / 100)
}
