import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import {
  fetchBinanceCandles,
  fetchBinanceMark,
  fetchBinanceMarkets,
  fetchBinanceOpenInterest,
} from './binance'
import { fetchHlCandles, fetchHlMarks, fetchHlMarkets } from './hl'
import { VENUE_LABEL, type Market } from './market'
import {
  PAPER_MAX_ALERTS,
  PAPER_MAX_POSITIONS,
  PaperStore,
  liqEstimateAt,
  positionPnl,
  targetFromMark,
  type PaperAlert,
  type PaperPosition,
  type Side,
} from './paper'
import {
  actionsBody,
  alertSetBody,
  alertsBody,
  confirmBody,
  paperBanner,
  paperMenuBody,
  paperRow,
  positionsBody,
  ticketBody,
} from './paperView'
import {
  detailBody,
  detailFooter,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtSignedUsd,
  listBody,
  listFooter,
  type ControlRow,
} from './render'
import { RecentStore } from './recent'

type Screen =
  | 'list'
  | 'detail'
  | 'actions'
  | 'ticket'
  | 'alertSet'
  | 'paper'
  | 'positions'
  | 'alerts'
  | 'confirm'
type Mode = 'all' | 'stocks'
type ListFocus = 'stocks' | 'paper' | 'market'
type ConfirmKind = 'open' | 'close' | 'move' | 'reset' | 'cancelAlert'

interface Envelope {
  eventType?: OsEventTypeList
}

interface ConfirmRequest {
  kind: ConfirmKind
  title: string
  detail: string[]
  returnScreen: Screen
  positionId?: string
  alertId?: string
  marketKey?: string
  side?: Side
  notional?: number
  leverage?: number
}

const state = {
  markets: [] as Market[],
  stocks: [] as Market[],
  mode: 'all' as Mode,
  listFocus: 'market' as ListFocus,
  selected: 0,
  screen: 'list' as Screen,
  menuIndex: 0,
  candles: [] as number[],
  error: '',
  hlDown: false,
  bnDown: false,
  ticket: { side: 'long' as Side, notional: 500, leverage: 1 },
  alertStep: 2,
  paperReturn: 'list' as 'list' | 'detail',
  alertsReturn: 'paper' as 'paper' | 'alertSet',
  confirm: null as ConfirmRequest | null,
  toast: '',
}

let bridge: EvenAppBridge | null = null
let detailReq = 0
let toastTimer: number | undefined
const recent = new RecentStore()
const paper = new PaperStore()

function currentMarkets(): Market[] {
  return state.mode === 'stocks' ? state.stocks : state.markets
}

function selectedMarket(): Market | undefined {
  return currentMarkets()[state.selected]
}

function findMarket(key: string): Market | undefined {
  return state.markets.find(m => m.key === key) ?? state.stocks.find(m => m.key === key)
}

function markForPosition(p: PaperPosition): number {
  return p.lastMark
}

function remember(m: Market): void {
  void recent.add(m.key)
}

function showToast(text: string, ms = 14_000): void {
  state.toast = text
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    state.toast = ''
    toastTimer = undefined
    render()
  }, ms)
  render()
}

function listControls(): ControlRow[] {
  const top = state.stocks[0]
  const stocksLabel = state.mode === 'stocks'
    ? `ALL · HL+BN ${state.markets.length} · tap`
    : top
      ? `STOCKS ·BN ${state.stocks.length} · ${top.coin.slice(0, 6)} ${fmtPct(top.change24h)} · tap`
      : state.bnDown
        ? 'STOCKS ·BN down'
        : 'STOCKS ·BN 0'
  return [
    { label: stocksLabel, selected: state.listFocus === 'stocks' },
    { label: paperRow(paper.state, markForPosition), selected: state.listFocus === 'paper' },
  ]
}

function headerText(): string {
  if (state.error) return 'HL GLASS · offline'
  if (state.screen === 'detail') {
    const m = selectedMarket()
    return m ? `${m.coin} · ${VENUE_LABEL[m.venue]}` : 'HL GLASS'
  }
  if (state.screen !== 'list') return 'HL GLASS · PAPER'
  if (state.mode === 'stocks') return 'HL GLASS · STOCKS ·BN'
  if (!state.markets.length) return 'HL GLASS · connecting'
  if (state.hlDown) return 'HL GLASS · BN only · HL down'
  if (state.bnDown) return 'HL GLASS · HL only · BN down'
  return `HL GLASS · top ${state.markets.length} · HL+BN`
}

function bannerText(): string {
  return state.toast || paperBanner(paper.state, markForPosition)
}

function bodyText(): string {
  if (state.error) return `${state.error}\n\ntap to retry`
  const m = selectedMarket()

  switch (state.screen) {
    case 'list': {
      const list = currentMarkets()
      if (!list.length) return state.mode === 'stocks' ? 'Binance stocks unavailable' : 'loading markets…'
      return listBody(list, state.selected, recent.list, listControls())
    }
    case 'detail':
      if (!m) return 'no markets'
      return detailBody(m, state.candles)
    case 'actions':
      return m ? actionsBody(m, state.menuIndex) : 'paper market unavailable'
    case 'ticket':
      return m
        ? ticketBody(m, state.ticket.side, state.ticket.notional, state.ticket.leverage, paper.state, state.menuIndex)
        : 'paper market unavailable'
    case 'alertSet':
      return m ? alertSetBody(m, state.alertStep, state.menuIndex) : 'paper market unavailable'
    case 'paper':
      return paperMenuBody(paper.state, markForPosition, state.menuIndex)
    case 'positions':
      return positionsBody(paper.state, markForPosition, state.menuIndex)
    case 'alerts':
      return alertsBody(paper.state, state.menuIndex)
    case 'confirm':
      return state.confirm
        ? confirmBody(state.confirm.title, state.confirm.detail, state.menuIndex === 0)
        : 'confirmation unavailable'
  }
}

function footerText(): string {
  if (state.error) return 'tap retry · 2x exit'
  const list = currentMarkets()
  switch (state.screen) {
    case 'list':
      if (!list.length) return state.mode === 'stocks' ? 'BN stocks unavailable · 2x exit' : 'connecting · 2x exit'
      return listFooter(state.selected, list.length, recent.count, {
        mode: state.mode,
        focus: state.listFocus,
      })
    case 'detail':
      return list.length ? detailFooter(state.selected, list.length) : 'tap actions · 2x exit'
    case 'actions':
      return 'scroll · tap select · 2x exit'
    case 'ticket':
      return 'tap change · scroll · 2x exit'
    case 'alertSet':
      return 'tap set/cycle · scroll · 2x exit'
    case 'paper':
      return 'scroll · tap select · 2x exit'
    case 'positions':
      return 'scroll · tap close · 2x exit'
    case 'alerts':
      return 'scroll · tap cancel · 2x exit'
    case 'confirm':
      return 'scroll yes/no · tap confirm · 2x exit'
  }
}

async function loadDetail(): Promise<void> {
  const m = selectedMarket()
  if (!m) return
  const req = ++detailReq
  const needOi = m.venue === 'BN' && !Number.isFinite(m.oiUsd)
  const [candles, oi] = await Promise.allSettled([
    m.venue === 'BN' ? fetchBinanceCandles(m.symbol) : fetchHlCandles(m.symbol),
    needOi ? fetchBinanceOpenInterest(m.symbol) : Promise.resolve(Number.NaN),
  ])
  if (req !== detailReq) return
  state.candles = candles.status === 'fulfilled' ? candles.value : []
  if (oi.status === 'fulfilled' && Number.isFinite(oi.value) && Number.isFinite(m.mark)) {
    m.oiUsd = oi.value * m.mark
  }
}

function checkAlerts(marks?: Map<string, number>): void {
  if (!paper.state.alerts.length) return
  const remaining: PaperAlert[] = []
  const triggered: PaperAlert[] = []
  for (const a of paper.state.alerts) {
    const mark = marks?.get(a.key) ?? findMarket(a.key)?.mark
    if (!mark || !Number.isFinite(mark)) {
      remaining.push(a)
      continue
    }
    const hit = a.direction === 'above' ? mark >= a.target : mark <= a.target
    if (hit) triggered.push(a)
    else remaining.push(a)
  }
  if (!triggered.length) return
  paper.state.alerts = remaining
  void paper.save()
  const a = triggered[0]
  const extra = triggered.length > 1 ? ` +${triggered.length - 1}` : ''
  showToast(`! ALERT · ${a.coin} ${a.direction.toUpperCase()} ${fmtPrice(a.target)}${extra}`, 16_000)
}

let paperTick = false

/** Refresh only the marks of open paper positions, every 5 s. */
async function tickPaper(): Promise<void> {
  const positions = paper.state.positions
  const alerts = paper.state.alerts
  if (paperTick || (!positions.length && !alerts.length)) return
  paperTick = true
  try {
    const bnSymbols = new Set<string>()
    const hlCoins = new Set<string>()
    for (const p of positions) {
      if (p.venue === 'BN') bnSymbols.add(p.symbol)
      else hlCoins.add(p.symbol)
    }
    for (const a of alerts) {
      if (a.venue === 'BN') bnSymbols.add(a.key.slice(3))
      else hlCoins.add(a.coin)
    }

    const [bnMarks, hlMarks] = await Promise.allSettled([
      Promise.all(
        [...bnSymbols].map(symbol =>
          fetchBinanceMark(symbol).then(mark => ({ symbol, mark })).catch(() => null),
        ),
      ),
      hlCoins.size ? fetchHlMarks([...hlCoins]) : Promise.resolve({} as Record<string, number>),
    ])

    const marks = new Map<string, number>()
    if (bnMarks.status === 'fulfilled') {
      for (const row of bnMarks.value) {
        if (row && Number.isFinite(row.mark) && row.mark > 0) {
          marks.set(`BN:${row.symbol}`, row.mark)
        }
      }
    }
    if (hlMarks.status === 'fulfilled') {
      for (const coin of hlCoins) {
        const mark = hlMarks.value[coin]
        if (Number.isFinite(mark) && mark > 0) marks.set(`HL:${coin}`, mark)
      }
    }

    let changed = false
    for (const p of positions) {
      const mark = marks.get(p.key)
      if (mark && mark > 0 && mark !== p.lastMark) {
        p.lastMark = mark
        changed = true
      }
    }
    if (changed) render()
    checkAlerts(marks)
  } finally {
    paperTick = false
  }
}

async function refresh(): Promise<void> {
  const prevKey = selectedMarket()?.key
  const [hl, bn] = await Promise.allSettled([
    fetchHlMarkets(24),
    fetchBinanceMarkets(12),
  ])

  const markets: Market[] = []
  let stocks: Market[] = []
  if (hl.status === 'fulfilled') markets.push(...hl.value)
  if (bn.status === 'fulfilled') {
    markets.push(...bn.value.board)
    stocks = bn.value.stocks
  }
  markets.sort((a, b) => b.vol24h - a.vol24h)

  state.hlDown = hl.status === 'rejected'
  state.bnDown = bn.status === 'rejected'
  state.markets = markets
  state.stocks = stocks
  if (state.mode === 'stocks' && !stocks.length) {
    state.mode = 'all'
    if (state.screen === 'list' && state.listFocus === 'stocks') state.listFocus = 'paper'
  }

  let marksChanged = false
  for (const p of paper.state.positions) {
    const m = findMarket(p.key)
    if (m && Number.isFinite(m.mark) && m.mark !== p.lastMark) {
      p.lastMark = m.mark
      marksChanged = true
    }
  }
  if (marksChanged) void paper.save()

  console.info(
    `[hlglass] refresh hl=${hl.status === 'fulfilled' ? hl.value.length : 'down'} ` +
      `bn=${bn.status === 'fulfilled' ? `${bn.value.board.length}/${bn.value.stocks.length}` : 'down'} ` +
      `merged=${markets.length} stocks=${stocks.length} ` +
      `paper pos=${paper.state.positions.length} alerts=${paper.state.alerts.length}`,
  )

  if (markets.length) {
    state.error = ''
    const list = currentMarkets()
    const kept = prevKey ? list.findIndex(m => m.key === prevKey) : -1
    const marketScreens: Screen[] = ['list', 'detail', 'actions', 'ticket', 'alertSet']
    if (marketScreens.includes(state.screen)) {
      if (!list.length) {
        state.screen = 'list'
        state.listFocus = 'market'
        state.selected = 0
      } else if (prevKey && kept < 0) {
        state.screen = 'list'
        state.listFocus = 'market'
        state.selected = 0
      } else {
        state.selected = kept >= 0 ? kept : Math.min(state.selected, Math.max(0, list.length - 1))
      }
    }
    if (state.screen === 'detail' && list.length) await loadDetail()
  } else {
    state.error = 'HL + BN unreachable'
    state.screen = 'list'
    state.listFocus = 'market'
  }
  checkAlerts()
  render()
}

function askConfirm(
  kind: ConfirmKind,
  title: string,
  detail: string[],
  returnScreen: Screen,
  extra: Partial<ConfirmRequest> = {},
): void {
  state.confirm = { kind, title, detail, returnScreen, ...extra }
  state.screen = 'confirm'
  state.menuIndex = 0
  render()
}

function openPaper(from: 'list' | 'detail'): void {
  state.paperReturn = from
  state.screen = 'paper'
  state.menuIndex = 0
  render()
}

function openAlerts(from: 'paper' | 'alertSet'): void {
  state.alertsReturn = from
  state.screen = 'alerts'
  state.menuIndex = 0
  render()
}

function openPositions(): void {
  state.screen = 'positions'
  state.menuIndex = 0
  render()
}

function openActions(): void {
  state.screen = 'actions'
  state.menuIndex = 0
  render()
}

function openTicket(side: Side): void {
  state.ticket = { side, notional: 500, leverage: 1 }
  state.screen = 'ticket'
  state.menuIndex = 0
  render()
}

function openAlertSet(): void {
  state.alertStep = 2
  state.screen = 'alertSet'
  state.menuIndex = 0
  render()
}

function addAlert(m: Market, direction: 'above' | 'below'): void {
  if (paper.state.alerts.length >= PAPER_MAX_ALERTS) {
    showToast('PAPER: MAX 5 ALERTS')
    return
  }
  const target = targetFromMark(m.mark, direction, state.alertStep)
  paper.state.alerts.push({
    id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    key: m.key,
    coin: m.coin,
    venue: m.venue,
    direction,
    pct: state.alertStep,
    target,
    createdAt: Date.now(),
  })
  void paper.save()
  showToast(`ALERT SET · ${m.coin} ${direction.toUpperCase()} ${fmtPrice(target)}`, 8_000)
}

function testAlert(m: Market): void {
  if (paper.state.alerts.length >= PAPER_MAX_ALERTS) {
    showToast('PAPER: MAX 5 ALERTS')
    return
  }
  paper.state.alerts.push({
    id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    key: m.key,
    coin: m.coin,
    venue: m.venue,
    direction: 'above',
    pct: 0,
    target: m.mark,
    createdAt: Date.now(),
  })
  void paper.save()
  checkAlerts(new Map([[m.key, m.mark]]))
}

function openPosition(
  marketKey: string,
  side: Side,
  notional: number,
  leverage: number,
): boolean {
  const m = findMarket(marketKey)
  if (!m) {
    showToast('PAPER: MARKET UNAVAILABLE')
    return false
  }
  if (paper.state.positions.length >= PAPER_MAX_POSITIONS) {
    showToast('PAPER: MAX 5 POSITIONS')
    return false
  }
  const required = notional / leverage
  if (paper.state.margin + 1e-9 < required) {
    showToast('PAPER: INSUFFICIENT MARGIN')
    return false
  }
  paper.state.margin -= required
  paper.state.positions.push({
    id: `p${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    key: m.key,
    coin: m.coin,
    symbol: m.symbol,
    venue: m.venue,
    assetClass: m.assetClass,
    side,
    notional,
    leverage,
    entry: m.mark,
    margin: required,
    lastMark: m.mark,
    openedAt: Date.now(),
  })
  void paper.save()
  return true
}

function closePosition(id: string): void {
  const index = paper.state.positions.findIndex(p => p.id === id)
  if (index < 0) return
  const p = paper.state.positions[index]
  const mark = markForPosition(p)
  const pnl = positionPnl(p, mark)
  paper.state.margin += Math.max(0, p.margin + pnl)
  paper.state.realized += pnl
  paper.state.positions.splice(index, 1)
  void paper.save()
  state.screen = 'positions'
  state.menuIndex = Math.min(index, paper.state.positions.length)
  showToast(`PAPER CLOSED · ${p.coin} ${fmtSignedUsd(pnl)}`, 8_000)
}

function confirmYes(): void {
  const c = state.confirm
  if (!c) return
  state.confirm = null

  switch (c.kind) {
    case 'move':
      if (paper.state.spot + 1e-9 < 500) {
        state.screen = 'paper'
        state.menuIndex = 2
        showToast('PAPER: SPOT BALANCE TOO LOW')
        break
      }
      paper.state.spot -= 500
      paper.state.margin += 500
      void paper.save()
      state.screen = 'paper'
      state.menuIndex = 2
      showToast('PAPER: MOVED $500 TO MARGIN', 6_000)
      break
    case 'reset':
      paper.reset()
      state.screen = 'paper'
      state.menuIndex = 0
      showToast('PAPER: ACCOUNT RESET', 6_000)
      break
    case 'open': {
      if (
        !c.marketKey ||
        c.side === undefined ||
        c.notional === undefined ||
        c.leverage === undefined
      ) {
        state.screen = 'ticket'
        state.menuIndex = 0
        showToast('PAPER: MARKET UNAVAILABLE')
        break
      }
      if (!openPosition(c.marketKey, c.side, c.notional, c.leverage)) {
        state.screen = 'ticket'
        state.menuIndex = 0
        break
      }
      const m = findMarket(c.marketKey)
      state.screen = 'positions'
      state.menuIndex = 0
      showToast(`PAPER ${c.side.toUpperCase()} OPENED · ${m?.coin ?? 'MARKET'} ${fmtMoney(c.notional)}`, 6_000)
      break
    }
    case 'close':
      if (c.positionId) closePosition(c.positionId)
      break
    case 'cancelAlert': {
      const index = paper.state.alerts.findIndex(a => a.id === c.alertId)
      if (index >= 0) paper.state.alerts.splice(index, 1)
      void paper.save()
      state.screen = 'alerts'
      state.menuIndex = Math.min(Math.max(0, index), paper.state.alerts.length)
      showToast('PAPER: ALERT CANCELLED', 6_000)
      break
    }
  }
  render()
}

function confirmNo(): void {
  const back = state.confirm?.returnScreen ?? 'paper'
  state.confirm = null
  state.screen = back
  state.menuIndex = 0
  render()
}

function handleActions(): void {
  const m = selectedMarket()
  if (!m) {
    state.screen = 'list'
    render()
    return
  }
  switch (state.menuIndex) {
    case 0: openTicket('long'); break
    case 1: openTicket('short'); break
    case 2: openAlertSet(); break
    case 3: openPaper('detail'); break
    case 4: state.screen = 'detail'; state.menuIndex = 0; render(); break
    default: state.screen = 'list'; state.listFocus = 'market'; state.menuIndex = 0; render(); break
  }
}

function handleTicket(): void {
  const m = selectedMarket()
  if (!m) {
    state.screen = 'actions'
    render()
    return
  }
  switch (state.menuIndex) {
    case 0: {
      const sizes = [100, 500, 1000]
      const i = sizes.indexOf(state.ticket.notional)
      state.ticket.notional = sizes[(i + 1) % sizes.length]
      render()
      break
    }
    case 1:
      state.ticket.leverage = (state.ticket.leverage % 3) + 1
      render()
      break
    case 2: {
      const required = state.ticket.notional / state.ticket.leverage
      if (paper.state.margin + 1e-9 < required) {
        showToast('PAPER: INSUFFICIENT MARGIN')
        return
      }
      if (paper.state.positions.length >= PAPER_MAX_POSITIONS) {
        showToast('PAPER: MAX 5 POSITIONS')
        return
      }
      askConfirm(
        'open',
        `OPEN PAPER ${state.ticket.side.toUpperCase()}?`,
        [
          `${m.coin} ${fmtMoney(state.ticket.notional)} · ${state.ticket.leverage}x`,
          `entry ${fmtPrice(m.mark)} · margin ${fmtMoney(required)}`,
          `liq est. ~${fmtPrice(liqEstimateAt(m.mark, state.ticket.leverage, state.ticket.side))} · buffer ${Math.round(100 / state.ticket.leverage)}%`,
        ],
        'ticket',
        {
          marketKey: m.key,
          side: state.ticket.side,
          notional: state.ticket.notional,
          leverage: state.ticket.leverage,
        },
      )
      break
    }
    default:
      state.screen = 'actions'
      state.menuIndex = 0
      render()
      break
  }
}

function handleAlertSet(): void {
  const m = selectedMarket()
  if (!m) {
    state.screen = 'actions'
    render()
    return
  }
  switch (state.menuIndex) {
    case 0: addAlert(m, 'above'); break
    case 1: addAlert(m, 'below'); break
    case 2:
      state.alertStep = state.alertStep === 1 ? 2 : state.alertStep === 2 ? 5 : 1
      render()
      break
    case 3: testAlert(m); break
    case 4: openAlerts('alertSet'); break
    default: state.screen = 'actions'; state.menuIndex = 0; render(); break
  }
}

function handlePaperMenu(): void {
  switch (state.menuIndex) {
    case 0: openPositions(); break
    case 1: openAlerts('paper'); break
    case 2:
      if (paper.state.spot + 1e-9 < 500) {
        showToast('PAPER: SPOT BALANCE TOO LOW')
        return
      }
      askConfirm(
        'move',
        'MOVE $500 SPOT -> MARGIN?',
        [
          `spot ${fmtMoney(paper.state.spot)} -> ${fmtMoney(paper.state.spot - 500)}`,
          `margin ${fmtMoney(paper.state.margin)} -> ${fmtMoney(paper.state.margin + 500)}`,
        ],
        'paper',
      )
      break
    case 3:
      askConfirm(
        'reset',
        'RESET PAPER ACCOUNT?',
        ['spot -> $9,500 · margin -> $500', 'positions and alerts cleared', 'realized PnL -> $0'],
        'paper',
      )
      break
    default:
      state.screen = state.paperReturn
      state.menuIndex = 0
      render()
      break
  }
}

function handlePositions(): void {
  const p = paper.state.positions[state.menuIndex]
  if (!p) {
    state.screen = 'paper'
    state.menuIndex = 0
    render()
    return
  }
  const mark = markForPosition(p)
  const pnl = positionPnl(p, mark)
  askConfirm(
    'close',
    `CLOSE PAPER ${p.side.toUpperCase()}?`,
    [
      `${p.coin} ${fmtMoney(p.notional)} · ${p.leverage}x`,
      `entry ${fmtPrice(p.entry)} · mark ${fmtPrice(mark)}`,
      `uPnL ${fmtSignedUsd(pnl)} · margin ${fmtMoney(p.margin)}`,
    ],
    'positions',
    { positionId: p.id },
  )
}

function handleAlerts(): void {
  const a = paper.state.alerts[state.menuIndex]
  if (!a) {
    state.screen = state.alertsReturn
    state.menuIndex = 0
    render()
    return
  }
  askConfirm(
    'cancelAlert',
    'CANCEL PAPER ALERT?',
    [
      `${a.coin} ${a.direction.toUpperCase()} ${fmtPrice(a.target)}`,
      `${fmtPct(a.pct, 1)} from mark`,
    ],
    'alerts',
    { alertId: a.id },
  )
}

function open(): void {
  switch (state.screen) {
    case 'list': {
      if (state.listFocus === 'stocks') {
        if (state.mode === 'all') {
          if (!state.stocks.length) {
            showToast('BINANCE STOCKS UNAVAILABLE')
            void refresh()
            return
          }
          state.mode = 'stocks'
        } else {
          state.mode = 'all'
        }
        state.listFocus = 'market'
        state.selected = 0
        render()
        return
      }
      if (state.listFocus === 'paper') {
        openPaper('list')
        return
      }
      const m = selectedMarket()
      if (!m) return
      state.screen = 'detail'
      state.candles = []
      remember(m)
      void loadDetail().then(render)
      render()
      return
    }
    case 'detail': openActions(); break
    case 'actions': handleActions(); break
    case 'ticket': handleTicket(); break
    case 'alertSet': handleAlertSet(); break
    case 'paper': handlePaperMenu(); break
    case 'positions': handlePositions(); break
    case 'alerts': handleAlerts(); break
    case 'confirm':
      if (state.menuIndex === 0) confirmYes()
      else confirmNo()
      break
  }
}

function menuLength(): number {
  switch (state.screen) {
    case 'actions': return 6
    case 'ticket': return 4
    case 'alertSet': return 6
    case 'paper': return 5
    case 'positions': return paper.state.positions.length + 1
    case 'alerts': return paper.state.alerts.length + 1
    case 'confirm': return 2
    default: return 0
  }
}

function move(dir: number): void {
  if (state.screen === 'list') {
    const list = currentMarkets()
    if (!list.length) return
    if (state.listFocus === 'stocks') {
      if (dir > 0) {
        state.listFocus = 'paper'
      } else {
        state.listFocus = 'market'
        state.selected = list.length - 1
      }
    } else if (state.listFocus === 'paper') {
      if (dir < 0) {
        state.listFocus = 'stocks'
      } else {
        state.listFocus = 'market'
        state.selected = 0
      }
    } else if (dir < 0 && state.selected === 0) {
      state.listFocus = 'paper'
    } else {
      state.selected = (state.selected + dir + list.length) % list.length
    }
    render()
    return
  }

  if (state.screen === 'detail') {
    const list = currentMarkets()
    if (!list.length) return
    state.selected = (state.selected + dir + list.length) % list.length
    state.candles = []
    const m = list[state.selected]
    if (m) remember(m)
    void loadDetail().then(render)
    render()
    return
  }

  const n = menuLength()
  if (!n) return
  state.menuIndex = (state.menuIndex + dir + n) % n
  render()
}

/* ------------------------------- G2 bridge ------------------------------- */

let rendering: Promise<unknown> = Promise.resolve()

function renderBridge(): void {
  if (!bridge) return
  const b = bridge
  const header = headerText()
  const body = bodyText()
  const banner = bannerText()
  const footer = footerText()
  rendering = rendering.then(async () => {
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'header', content: header }),
    )
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 2, containerName: 'body', content: body }),
    )
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 3, containerName: 'banner', content: banner }),
    )
    await b.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 4, containerName: 'footer', content: footer }),
    )
  })
}

function renderPreview(): void {
  const h = document.getElementById('pv-header')
  const b = document.getElementById('pv-body')
  const n = document.getElementById('pv-banner')
  const f = document.getElementById('pv-footer')
  if (h) h.textContent = headerText()
  if (b) b.textContent = bodyText()
  if (n) n.textContent = bannerText()
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
    xPosition: 0, yPosition: 30, width: 576, height: 198,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 2, containerName: 'body', content: bodyText(), isEventCapture: 1,
  })
  const banner = new TextContainerProperty({
    xPosition: 0, yPosition: 228, width: 576, height: 24,
    borderWidth: 0, borderColor: 5, paddingLength: 0,
    containerID: 3, containerName: 'banner', content: bannerText(), isEventCapture: 0,
  })
  const footer = new TextContainerProperty({
    xPosition: 0, yPosition: 252, width: 576, height: 36,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: 4, containerName: 'footer', content: footerText(), isEventCapture: 0,
  })
  const created = await b.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 4,
      textObject: [header, body, banner, footer],
    }),
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
  await paper.load(b)
  if (b && (await startBridge(b))) {
    render()
  } else {
    startPreview()
    render()
  }
  await refresh()
  window.setInterval(() => { void refresh() }, 60_000)
  window.setInterval(() => { void tickPaper() }, 5_000)
}

void boot()
