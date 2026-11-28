# Demo Day runbook (Even G2, remote slot, Dec 3)

A 3-minute live walkthrough for the remote demo slot on Dec 3, 14:00–18:00
Dubai time (10:00–14:00 UTC). The same flow was rehearsed on 2026-11-26 against
the live GitHub Pages build; every step below was exercised in a browser.

## Open these before the call

1. `https://matrixneoaiagent.github.io/hl-glass/` — the browser preview renders
   the same 576×288 framebuffer as the glasses.
2. `https://matrixneoaiagent.github.io/hl-glass/hl_demo_voiced.mp4` — the 2:40
   narrated demo, as a fallback if the live network or the preview fails. It is
   served by GitHub Pages as `video/mp4`. The same file is in `docs/` for
   offline review.
3. The submission page (`dorahacks.io/hackathon/even-realities`) with Build 51815.

## The 3-minute path (timings from the rehearsal)

| Time | Action | What the judges see |
|---|---|---|
| 0:00 | Land on the board | `HL GLASS · top 36 · HL+BN`, the `STOCKS ·BN` row (about 245 markets), the `PAPER · eq $10,000 · flat` row, merged BTC/ETH/SOXL/XAU rows tagged `·BN` / `·HL` |
| 0:20 | Press `ArrowDown` twice, `Enter` | Market detail: `SOXL · Binance`, `STOCK PERP`, mark/index, 24h vol, OI, funding APR, range, sparkline |
| 0:45 | `Enter` | PAPER menu: `PAPER LONG`, `PAPER SHORT`, `PRICE ALERT`, `PAPER ACCOUNT`, `BACK TO MARKET`, `BACK TO LIST` |
| 0:55 | `Enter` on `PAPER LONG` | Ticket: `NOTIONAL $500`, `LEVERAGE 1x`, margin, approximate liq |
| 1:05 | `ArrowDown` twice → `CONFIRM OPEN` → `Enter` | Confirmation: `OPEN PAPER LONG? SOXL $500 · 1x`, entry, margin, liq estimate, `>YES / NO` |
| 1:15 | `Enter` on `YES` | `PAPER LONG OPENED · SOXL $500`; the position row shows live PnL (rehearsal showed `-$0.15` moving with the mark) |
| 1:30 | Back to the board, tap `STOCKS ·BN` | The tokenized equity/commodity perps filtered from `underlyingType` (about 245), each labelled `STOCK PERP` / `COMMODITY PERP` |
| 2:00 | Open `PAPER ACCOUNT` | Equity (spot + margin + locked + uPnL), realized PnL, `MOVE $500 SPOT -> MARGIN` through Yes/No |
| 2:20 | `PRICE ALERT` → `TEST @ MARK` | The alert banner triggers immediately; normal alerts wait for the real mark |
| 2:40 | Close | Say what is local: no keys, no orders, no custody; Binance-only and Hyperliquid-only fallbacks documented in the README |

## Controls

- `ArrowUp` / `ArrowDown` = scroll, `Enter` = tap, two quick `Escape` = double-tap
  exit in the browser preview. On the glasses: temple touchpad scroll, tap, 2x.
- If a market detail is stale, `Enter` on the row retries the venue.

## Failure fallbacks

- **Preview down:** play the 2:40 video and keep the repo open at
  `github.com/matrixneoaiagent/hl-glass`.
- **Binance blocked in the demo region:** the header shows `BN down`, the
  Hyperliquid board stays, and paper trading continues on `·HL` rows. Say this
  out loud; it is the documented behaviour, not an accident.
- **Both venues fail:** the app shows an offline state with tap-to-retry.

## What not to claim

- PnL is paper. Fills use the mark with no slippage, fees or funding.
- The liquidation estimate is a simple buffer, not an exchange risk engine.
- No keys, no signatures, no orders, no custody anywhere in the app.
