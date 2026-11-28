import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FUNDING_PERIOD,
  VENUE_LABEL,
  VENUE_TAG,
  annualiseFunding,
} from '../src/market.ts'

test('annualises Hyperliquid hourly funding to APR', () => {
  // 0.0001 per hour -> 0.0001 * 24 * 365 * 100 = 87.6% APR
  assert.equal(annualiseFunding(0.0001, 24 * 365), 87.6)
})

test('annualises Binance 8-hour funding to APR', () => {
  // 0.0001 per 8h -> 3 payments/day -> 10.95% APR
  assert.equal(annualiseFunding(0.0001, 3 * 365), 10.95)
})

test('returns NaN for a non-finite funding rate', () => {
  assert.ok(Number.isNaN(annualiseFunding(Number.NaN, 24 * 365)))
  assert.ok(Number.isNaN(annualiseFunding(Number.POSITIVE_INFINITY, 3 * 365)))
})

test('keeps venue labels and funding periods explicit', () => {
  assert.equal(VENUE_LABEL.HL, 'Hyperliquid')
  assert.equal(VENUE_LABEL.BN, 'Binance')
  assert.equal(VENUE_TAG.HL, 'HL')
  assert.equal(VENUE_TAG.BN, 'BN')
  assert.equal(FUNDING_PERIOD.HL, '1h')
  assert.equal(FUNDING_PERIOD.BN, '8h')
})
