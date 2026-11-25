// Paper-session screens. All text is local; no order is ever sent.

import type { Market } from './market'
import { VENUE_TAG } from './market'
import {
  liqEstimate,
  liqEstimateAt,
  lockedMargin,
  paperEquity,
  positionPnl,
  targetFromMark,
  unrealizedPnl,
  type PaperPosition,
  type PaperState,
  type Side,
} from './paper'
import { fmtMoney, fmtPct, fmtPrice, fmtSignedUsd } from './render'

type MarkOf = (position: PaperPosition) => number

export function paperRow(paper: PaperState, markOf: MarkOf): string {
  const positions = paper.positions.length
  return `PAPER · eq ${fmtMoney(paperEquity(paper, markOf))} · ${positions ? `${positions} pos` : 'flat'}`
}

export function paperBanner(paper: PaperState, markOf: MarkOf): string {
  return (
    `PAPER · LOCAL ONLY · eq ${fmtMoney(paperEquity(paper, markOf))} · ` +
    `uPnL ${fmtSignedUsd(unrealizedPnl(paper, markOf))} · realized ${fmtSignedUsd(paper.realized)}`
  )
}

function assetLabel(m: Market): string {
  if (m.assetClass === 'stock') return 'STOCK'
  if (m.assetClass === 'commodity') return 'COMMODITY'
  return VENUE_TAG[m.venue]
}

export function actionsBody(m: Market, selected: number): string {
  const marker = (i: number) => (selected === i ? '>' : ' ')
  return [
    `PAPER · ${m.coin} · ${assetLabel(m)} · ${fmtPrice(m.mark)}`,
    `${marker(0)}PAPER LONG`,
    `${marker(1)}PAPER SHORT`,
    `${marker(2)}PRICE ALERT`,
    `${marker(3)}PAPER ACCOUNT`,
    `${marker(4)}BACK TO MARKET`,
    `${marker(5)}BACK TO LIST`,
  ].join('\n')
}

export function ticketBody(
  m: Market,
  side: Side,
  notional: number,
  leverage: number,
  paper: PaperState,
  selected: number,
): string {
  const marker = (i: number) => (selected === i ? '>' : ' ')
  const required = notional / leverage
  const enough = paper.margin + 1e-9 >= required
  const sizeLine = enough
    ? `margin ${fmtMoney(required, 2)} · liq ~${fmtPrice(liqEstimateAt(m.mark, leverage, side))}`
    : `! NEED ${fmtMoney(required, 2)} · free ${fmtMoney(paper.margin, 2)}`
  return [
    `PAPER ${side.toUpperCase()} · ${m.coin}`,
    `entry ${fmtPrice(m.mark)} · mark ${fmtPrice(m.mark)}`,
    `${marker(0)}NOTIONAL ${fmtMoney(notional)}`,
    `${marker(1)}LEVERAGE ${leverage}x`,
    sizeLine,
    `${marker(2)}CONFIRM OPEN`,
    `${marker(3)}CANCEL`,
  ].join('\n')
}

export function alertSetBody(m: Market, step: number, selected: number): string {
  const marker = (i: number) => (selected === i ? '>' : ' ')
  const above = targetFromMark(m.mark, 'above', step)
  const below = targetFromMark(m.mark, 'below', step)
  return [
    `ALERT · ${m.coin} @ ${fmtPrice(m.mark)}`,
    `${marker(0)}ABOVE +${step}% · ${fmtPrice(above)}`,
    `${marker(1)}BELOW -${step}% · ${fmtPrice(below)}`,
    `${marker(2)}STEP +/-1/2/5% · tap`,
    `${marker(3)}TEST @ MARK`,
    `${marker(4)}ALERTS`,
    `${marker(5)}BACK`,
  ].join('\n')
}

export function paperMenuBody(
  paper: PaperState,
  markOf: MarkOf,
  selected: number,
): string {
  const marker = (i: number) => (selected === i ? '>' : ' ')
  return [
    `spot ${fmtMoney(paper.spot, 2)}  free ${fmtMoney(paper.margin, 2)}  locked ${fmtMoney(lockedMargin(paper), 2)}`,
    `realized ${fmtSignedUsd(paper.realized)}  uPnL ${fmtSignedUsd(unrealizedPnl(paper, markOf))}`,
    `${marker(0)}POSITIONS (${paper.positions.length})`,
    `${marker(1)}ALERTS (${paper.alerts.length})`,
    `${marker(2)}MOVE $500 SPOT -> MARGIN`,
    `${marker(3)}RESET PAPER`,
    `${marker(4)}BACK`,
  ].join('\n')
}

export function positionsBody(
  paper: PaperState,
  markOf: MarkOf,
  selected: number,
): string {
  const lines: string[] = []
  if (!paper.positions.length) {
    lines.push('no open paper positions')
    lines.push('')
  } else {
    const current = paper.positions[Math.min(selected, paper.positions.length - 1)]
    lines.push(
      `${current.coin} entry ${fmtPrice(current.entry)} · mark ${fmtPrice(markOf(current))} · ` +
        `liq ~${fmtPrice(liqEstimate(current))}`,
    )
    for (let i = 0; i < paper.positions.length; i++) {
      const p = paper.positions[i]
      const pnl = positionPnl(p, markOf(p))
      lines.push(
        `${selected === i ? '>' : ' '}${p.coin.padEnd(6)} ${p.side.toUpperCase().padEnd(5)} ` +
          `${fmtMoney(p.notional)} ${p.leverage}x · ${fmtSignedUsd(pnl)}`,
      )
    }
  }
  const back = paper.positions.length
  lines.push(`${selected === back ? '>' : ' '}BACK`)
  return lines.join('\n')
}

export function alertsBody(paper: PaperState, selected: number): string {
  const lines: string[] = []
  if (!paper.alerts.length) {
    lines.push('no paper alerts')
    lines.push('')
  } else {
    const current = paper.alerts[Math.min(selected, paper.alerts.length - 1)]
    lines.push(
      `${current.coin} ${current.direction} ${fmtPrice(current.target)} · ` +
        `${fmtPct(current.pct, 1)} from mark`,
    )
    for (let i = 0; i < paper.alerts.length; i++) {
      const a = paper.alerts[i]
      lines.push(
        `${selected === i ? '>' : ' '}${a.coin.padEnd(6)} ` +
          `${a.direction.toUpperCase().padEnd(5)} ${fmtPrice(a.target)} · ${fmtPct(a.pct, 0)}`,
      )
    }
  }
  const back = paper.alerts.length
  lines.push(`${selected === back ? '>' : ' '}BACK`)
  return lines.join('\n')
}

export function confirmBody(
  title: string,
  detail: string[],
  yesSelected: boolean,
): string {
  const lines = ['CONFIRM · PAPER', title, ...detail.slice(0, 3)]
  while (lines.length < 5) lines.push('')
  lines.push(`${yesSelected ? '>' : ' '}YES`)
  lines.push(`${yesSelected ? ' ' : '>'}NO`)
  return lines.join('\n')
}
