import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PAPER_MAX_ALERTS,
  PAPER_MAX_POSITIONS,
  PAPER_START_MARGIN,
  PAPER_START_SPOT,
  defaultPaper,
  liqEstimate,
  liqEstimateAt,
  lockedMargin,
  paperEquity,
  positionPnl,
  positionPnlPct,
  targetFromMark,
  unrealizedPnl,
} from '../src/paper.ts'

function position(overrides = {}) {
  return {
    id: 'p1',
    key: 'BN:BTCUSDT',
    coin: 'BTC',
    symbol: 'BTCUSDT',
    venue: 'BN',
    assetClass: 'crypto',
    side: 'long',
    notional: 500,
    leverage: 1,
    entry: 100,
    margin: 500,
    lastMark: 100,
    openedAt: 1,
    ...overrides,
  }
}

test('starts with a $10,000 paper account split 9,500 / 500', () => {
  const paper = defaultPaper()
  assert.equal(paper.spot, PAPER_START_SPOT)
  assert.equal(paper.margin, PAPER_START_MARGIN)
  assert.equal(paper.spot + paper.margin, 10_000)
  assert.equal(paper.realized, 0)
  assert.equal(paper.positions.length, 0)
  assert.equal(paper.alerts.length, 0)
  assert.equal(PAPER_MAX_POSITIONS, 5)
  assert.equal(PAPER_MAX_ALERTS, 5)
})

test('calculates long paper PnL from mark, entry, notional and side', () => {
  assert.equal(positionPnl(position(), 110), 50)
  assert.equal(positionPnl(position(), 90), -50)
})

test('calculates short paper PnL with the opposite sign', () => {
  assert.equal(positionPnl(position({ side: 'short' }), 90), 50)
  assert.equal(positionPnl(position({ side: 'short' }), 110), -50)
})

test('returns zero PnL for an invalid mark instead of NaN', () => {
  assert.equal(positionPnl(position(), Number.NaN), 0)
  assert.equal(positionPnl(position(), 0), 0)
  assert.equal(positionPnl(position({ entry: 0 }), 110), 0)
})

test('reports paper PnL as a percentage of entry', () => {
  assert.equal(positionPnlPct(position(), 110), 10)
  assert.equal(positionPnlPct(position({ side: 'short' }), 90), 10)
})

test('locks exactly the margin of open positions', () => {
  assert.equal(lockedMargin(defaultPaper()), 0)
  assert.equal(
    lockedMargin({
      ...defaultPaper(),
      positions: [position(), position({ id: 'p2', margin: 250 })],
    }),
    750,
  )
})

test('sums unrealized PnL across positions', () => {
  const paper = {
    ...defaultPaper(),
    positions: [position(), position({ id: 'p2', side: 'short', margin: 500 })],
  }
  assert.equal(unrealizedPnl(paper, p => (p.side === 'long' ? 110 : 90)), 100)
})

test('includes locked margin and unrealized PnL in equity', () => {
  const paper = {
    spot: 9500,
    margin: 400,
    realized: 0,
    positions: [position({ margin: 100, notional: 100, leverage: 1 })],
    alerts: [],
  }
  // 9,500 spot + 400 free + 100 locked + 10 uPnL
  assert.equal(paperEquity(paper, p => 110), 10_010)
})

test('estimates a long liquidation below entry', () => {
  const liq = liqEstimateAt(100, 3, 'long')
  assert.ok(liq > 66 && liq < 68)
  assert.equal(liqEstimate(position({ entry: 100, leverage: 3, side: 'long' })), liq)
})

test('estimates a short liquidation above entry', () => {
  const liq = liqEstimateAt(100, 3, 'short')
  assert.ok(liq > 132 && liq < 134)
})

test('places above and below alerts at the requested distance', () => {
  assert.equal(targetFromMark(100, 'above', 2), 102)
  assert.equal(targetFromMark(100, 'below', 5), 95)
  assert.equal(targetFromMark(100, 'above', 0), 100)
})
