# HL Glass — a Hyperliquid HUD for Even G2

Live perp market data on a 576×288 monochrome display: mark/oracle, 24h change,
funding APR, open interest and a 24h range sparkline for the top Hyperliquid
markets. Read-only, no keys, no orders.

Built for the **Even Realities G2** hackathon (Polymarket/Hyperliquid track).

## Demo

- Browser preview: https://matrixneoaiagent.github.io/hl-glass/
- The browser preview renders the same 576×288 HUD; the Even Hub simulator or
  the G2 glasses show it through the Even App bridge.

## Why

Funding and open interest are the fastest read on perp positioning. A glanceable
HUD lets a trader check the top markets without pulling out a phone — and keeps
the interaction to the temple touchpad: scroll, tap, double-tap.

## Features

- **Top 24 perps by 24h volume**, one screen, seven rows at a time.
- **Market detail**: mark, oracle, 24h change, 24h volume, OI in USD, max
  leverage, funding APR (and the hourly rate), 24h low/high, sparkline.
- **Controls**: scroll moves the selection, tap opens the detail, scroll in the
  detail moves to the next/previous market, tap goes back, double-tap exits.
- **Live**: refresh every 60 s; offline state keeps the last data and offers a
  tap-to-retry.
- **Browser fallback**: without the Even bridge the same view renders in the
  browser so judges and reviewers can see the UI without the simulator.

## Stack

- Vite + TypeScript, no framework.
- `@evenrealities/even_hub_sdk` text containers and the Even App bridge.
- Hyperliquid public API: `POST https://api.hyperliquid.xyz/info` with
  `metaAndAssetCtxs` and `candleSnapshot` (24×1 h candles).

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173
npx evenhub-simulator http://localhost:5173
```

The app runs in the Even Hub simulator or on the glasses through the Even App.
Without the bridge it falls back to the browser preview.

## Build

```bash
npm run build          # tsc --noEmit && vite build
npm run pack           # build + evenhub pack app.json dist
```

## Layout

```
576 × 288 monochrome
┌────────────────────────────────────────────┐
│ HL GLASS · top 24 · f=APR                  │  header 30 px
│ >BTC   59,737  -3.2%  f-3.1%               │
│  ETH    1,675  -4.6%  f+6.7%               │  body 222 px
│  …                                          │
│ 1/24 · scroll · tap open · 2x exit         │  footer 36 px
└────────────────────────────────────────────┘
```

## Data and honesty

- Prices, funding and OI come from Hyperliquid's public API; the app is
  read-only and cannot place orders.
- Not financial advice. Funding is shown annualised as `funding × 24 × 365`;
  the hourly rate is shown in the detail line.
- No API keys, no wallet, no account.

## License

MIT.
