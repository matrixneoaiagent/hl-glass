// Local "recently viewed" list.
//
// Write path: when a market detail is opened we persist the market keys through
// the Even Hub SDK (`bridge.setLocalStorage` / `bridge.getLocalStorage`).  On
// the glasses the host stores this locally; there is no account, no keys and
// no trading side effect.  When the bridge is unavailable (browser preview) or
// the host rejects the call, we mirror the same list to `window.localStorage`
// so the marker still works and the read-back path stays testable.
//
// Keys are source-qualified (`BN:BTCUSDT`, `HL:BTC`) so the same coin can be
// recent on both venues without colliding.

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

export const RECENT_KEY = 'hlglass.recent.v2'
export const RECENT_MAX = 8

function validKey(key: string): boolean {
  return key.length <= 24 && /^(HL|BN):[A-Za-z0-9:_-]{1,20}$/.test(key)
}

function clean(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: string[] = []
  for (const value of parsed) {
    if (typeof value !== 'string') continue
    const key = value.trim()
    if (!validKey(key)) continue
    if (!out.includes(key)) out.push(key)
    if (out.length >= RECENT_MAX) break
  }
  return out
}

function readBrowser(): string {
  try {
    return window.localStorage.getItem(RECENT_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeBrowser(value: string): void {
  try {
    window.localStorage.setItem(RECENT_KEY, value)
  } catch {
    /* storage can be disabled; the in-memory list still works */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

export class RecentStore {
  private coins: string[] = []
  private bridge: EvenAppBridge | null = null
  private backend: 'sdk' | 'browser' | 'none' = 'none'
  private writes: Promise<void> = Promise.resolve()

  get list(): string[] {
    return this.coins
  }

  get count(): number {
    return this.coins.length
  }

  /** Read the persisted list once the bridge is known. */
  async load(bridge: EvenAppBridge | null): Promise<void> {
    this.bridge = bridge
    let sdkRaw = ''
    if (bridge) {
      try {
        sdkRaw = await withTimeout(bridge.getLocalStorage(RECENT_KEY), 1500, '')
      } catch {
        sdkRaw = ''
      }
    }
    const sdkCoins = clean(sdkRaw)
    const browserCoins = clean(readBrowser())
    if (sdkCoins.length) this.backend = 'sdk'
    else if (browserCoins.length) this.backend = 'browser'
    // Union keeps the list alive when the host store is unavailable and only
    // the browser mirror was written by an earlier session.
    const merged = [...sdkCoins, ...browserCoins].filter(
      (coin, i, all) => all.indexOf(coin) === i,
    )
    this.coins = merged.slice(0, RECENT_MAX)
    console.info(
      `[hlglass] recent load backend=${this.backend} count=${this.coins.length} keys=${this.coins.join(',') || '-'}`,
    )
  }

  /** Move a market key to the front and persist the capped list. */
  async add(key: string): Promise<void> {
    const name = key.trim()
    if (!validKey(name)) return
    const next = [name, ...this.coins.filter(c => c !== name)].slice(0, RECENT_MAX)
    const value = JSON.stringify(next)
    this.coins = next
    writeBrowser(value)
    // Serialise host writes so a fast scroll cannot land an older list last.
    this.writes = this.writes.then(() => this.persist(value)).catch(() => {})
    await this.writes
  }

  private async persist(value: string): Promise<void> {
    if (this.bridge) {
      try {
        const ok = await withTimeout(this.bridge.setLocalStorage(RECENT_KEY, value), 1500, false)
        console.info(`[hlglass] recent save backend=sdk ok=${ok} count=${this.coins.length}`)
        if (ok) {
          // Read the value back through the same host API. This is the
          // verification path used by the simulator test.
          const readBack = await withTimeout(this.bridge.getLocalStorage(RECENT_KEY), 1500, '')
          console.info(
            `[hlglass] recent readback backend=sdk match=${readBack === value} value=${readBack || '-'}`,
          )
          this.backend = 'sdk'
          return
        }
      } catch (err) {
        console.warn('[hlglass] recent save sdk failed; browser mirror kept', err)
      }
    }
    this.backend = 'browser'
  }
}
