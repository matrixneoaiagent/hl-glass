import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { fetchBinanceCandles, fetchBinanceMarkets } from './binance'
import { fetchHlCandles, fetchHlMarkets } from './hl'
import { VENUE_LABEL, type Market } from './market'
import { detailBody, detailFooter, listBody, listFooter } from './render'
import { RecentStore } from './recent'

type View = 'list' | 'detail'

interface Envelope {
  eventType?: OsEventTypeList
}

const state = {
  markets: [] as Market[],
  selected: 0,
  view: 'list' as View,
  candles: [] as number[],
  error: '',
  hlDown: false,
  bnDown: false,
}

let bridge: EvenAppBridge | null = null
let candleReq = 0
const recent = new RecentStore()

function remember(m: Market): void {
  void recent.add(m.key)
}

function headerText(): string {
  if (state.error) return 'HL GLASS · offline'
  if (state.view === 'detail') {
    const m = state.markets[state.selected]
    return m ? `${m.coin} · ${VENUE_LABEL[m.venue]}` : 'HL GLASS'
  }
  if (!state.markets.length) return 'HL GLASS · connecting'
  if (state.hlDown) return 'HL GLASS · BN only · HL down'
  if (state.bnDown) return 'HL GLASS · HL only · BN down'
  return `HL GLASS · top ${state.markets.length} · HL+BN`
}

function bodyText(): string {
  if (state.error) return `${state.error}\n\ntap to retry`
  if (!state.markets.length) return 'loading markets…'
  const m = state.markets[state.selected]
  if (!m) return 'no markets'
  return state.view === 'detail' ? detailBody(m, state.candles) : listBody(state.markets, state.selected, recent.list)
}

function footerText(): string {
  if (state.error) return 'tap retry · 2x exit'
  if (!state.markets.length) return 'connecting · 2x exit'
  return state.view === 'detail'
    ? detailFooter(state.selected, state.markets.length)
    : listFooter(state.selected, state.markets.length, recent.count)
}

async function loadCandles(): Promise<void> {
  const m = state.markets[state.selected]
  if (!m) return
  const req = ++candleReq
  try {
    const candles =
      m.venue === 'BN'
        ? await fetchBinanceCandles(m.symbol)
        : await fetchHlCandles(m.symbol)
    if (req === candleReq) state.candles = candles
  } catch {
    if (req === candleReq) state.candles = []
  }
}

async function refresh(): Promise<void> {
  const prevKey = state.markets[state.selected]?.key
  const [hl, bn] = await Promise.allSettled([
    fetchHlMarkets(24),
    fetchBinanceMarkets(12),
  ])

  const markets: Market[] = []
  if (hl.status === 'fulfilled') markets.push(...hl.value)
  if (bn.status === 'fulfilled') markets.push(...bn.value)
  markets.sort((a, b) => b.vol24h - a.vol24h)

  state.hlDown = hl.status === 'rejected'
  state.bnDown = bn.status === 'rejected'
  console.info(
    `[hlglass] refresh hl=${hl.status === 'fulfilled' ? hl.value.length : 'down'} ` +
      `bn=${bn.status === 'fulfilled' ? bn.value.length : 'down'} merged=${markets.length}`,
  )

  if (markets.length) {
    state.markets = markets
    state.error = ''
    const kept = prevKey ? markets.findIndex(m => m.key === prevKey) : -1
    state.selected = kept >= 0 ? kept : Math.min(state.selected, markets.length - 1)
    if (state.view === 'detail') await loadCandles()
  } else {
    state.error = 'HL + BN unreachable'
  }
  render()
}

function open(): void {
  if (state.view === 'list') {
    const m = state.markets[state.selected]
    state.view = 'detail'
    state.candles = []
    if (m) remember(m)
    void loadCandles().then(render)
    render()
  } else {
    state.view = 'list'
    render()
  }
}

function move(dir: number): void {
  if (!state.markets.length) return
  const n = state.markets.length
  state.selected = (state.selected + dir + n) % n
  if (state.view === 'detail') {
    state.candles = []
    const m = state.markets[state.selected]
    if (m) remember(m)
    void loadCandles().then(render)
  }
  render()
}

/* ------------------------------- G2 bridge ------------------------------- */

let rendering: Promise<unknown> = Promise.resolve()

function renderBridge(): void {
  if (!bridge) return
  const b = bridge
  const header = headerText()
  const body = bodyText()
  const footer = footerText()
  rendering = rendering.then(async () => {
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'header', content: header }),
    )
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 2, containerName: 'body', content: body }),
    )
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 3, containerName: 'footer', content: footer }),
    )
  })
}

function renderPreview(): void {
  const h = document.getElementById('pv-header')
  const b = document.getElementById('pv-body')
  const f = document.getElementById('pv-footer')
  if (h) h.textContent = headerText()
  if (b) b.textContent = bodyText()
  if (f) f.textContent = footerText()
}

function render(): void {
  renderBridge()
  renderPreview()
}

function eventTypeOf(env?: Envelope): OsEventTypeList | null {
  if (!env) return null
  return env.eventType ?? OsEventTypeList.CLICK_EVENT
}

function onEvent(event: { sysEvent?: Envelope; textEvent?: Envelope }): void {
  const sys = eventTypeOf(event.sysEvent)
  const txt = eventTypeOf(event.textEvent)

  if (sys === OsEventTypeList.DOUBLE_CLICK_EVENT || txt === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (bridge) void bridge.shutDownPageContainer(1)
    return
  }
  if (sys === OsEventTypeList.SCROLL_TOP_EVENT || txt === OsEventTypeList.SCROLL_TOP_EVENT) {
    move(-1)
    return
  }
  if (sys === OsEventTypeList.SCROLL_BOTTOM_EVENT || txt === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    move(1)
    return
  }
  if (sys === OsEventTypeList.CLICK_EVENT || txt === OsEventTypeList.CLICK_EVENT) {
    if (state.error) {
      void refresh()
    } else {
      open()
    }
  }
}

async function startBridge(b: EvenAppBridge): Promise<boolean> {
  const header = new TextContainerProperty({
    xPosition: 0, yPosition: 0, width: 576, height: 30,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 1, containerName: 'header', content: headerText(), isEventCapture: 0,
  })
  const body = new TextContainerProperty({
    xPosition: 0, yPosition: 30, width: 576, height: 222,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 2, containerName: 'body', content: bodyText(), isEventCapture: 1,
  })
  const footer = new TextContainerProperty({
    xPosition: 0, yPosition: 252, width: 576, height: 36,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 3, containerName: 'footer', content: footerText(), isEventCapture: 0,
  })
  const created = await b.createStartUpPageContainer(
    new CreateStartUpPageContainer({ containerTotalNum: 3, textObject: [header, body, footer] }),
  )
  if (created !== 0) return false
  b.onEvenHubEvent(onEvent)
  bridge = b
  return true
}

function startPreview(): void {
  const pv = document.getElementById('preview')
  const app = document.getElementById('app')
  if (app) app.remove()
  if (pv) pv.hidden = false
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { move(-1); e.preventDefault() }
    else if (e.key === 'ArrowDown') { move(1); e.preventDefault() }
    else if (e.key === 'Enter') { open(); e.preventDefault() }
    else if (e.key === 'Escape') { /* no-op in preview */ }
  })
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]).catch(() => null)
}

async function boot(): Promise<void> {
  render()
  const b = await withTimeout(waitForEvenAppBridge(), 2500)
  await recent.load(b)
  if (b && (await startBridge(b))) {
    render()
  } else {
    startPreview()
    render()
  }
  await refresh()
  window.setInterval(() => { void refresh() }, 60_000)
}

void boot()
