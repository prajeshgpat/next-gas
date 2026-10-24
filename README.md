# NextGas

Find the cheapest gas you can safely reach on your route: enter where you're going and how much
range is left, and NextGas tells you whether to fill now or which cheaper station ahead you can
reach, warns you before long stretches with no stations, and can show TopTier stations only.

See [docs/PLAN.md](docs/PLAN.md) for the full plan. Status: **M0** (scaffold, CI, GasBuddy spike).

## Layout

| Path | What |
|---|---|
| `apps/web` | Vite + React + TypeScript app, deployed to GitHub Pages |
| `packages/core` | Route/range logic, pure TypeScript, no I/O |
| `worker` | Cloudflare Worker that proxies live GasBuddy price lookups |
| `scripts/gasbuddy-spike.ts` | One GasBuddy lookup from any machine, for the go/no-go test |

## Commands

Node 22 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm check                      # lint + typecheck + tests + build (what CI runs)
pnpm --filter @next-gas/web dev # http://localhost:5173/next-gas/
pnpm --filter @next-gas/worker dev
pnpm spike:gasbuddy [lat] [lon] # ONE real GasBuddy lookup (two requests)
```

Tests never contact GasBuddy; they use a fake `fetch` and a fixture response.

## Workflow

- Work on `dev`. Changes reach `main` by pull request.
- Pushing to `main` deploys the web app to GitHub Pages and, once Cloudflare secrets are set, the Worker.

## One-time setup

1. **GitHub Pages:** Settings → Pages → Source: **GitHub Actions**.
2. **Cloudflare Worker** (free account): create an API token with the "Edit Cloudflare Workers"
   template, then add repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. To use the
   one-off spike endpoint, run `pnpm --filter @next-gas/worker exec wrangler secret put SPIKE_TOKEN`,
   then `curl -H "Authorization: Bearer <token>" "https://next-gas-prices.<subdomain>.workers.dev/spike?lat=40.7895&lon=-74.0565"`.

## GasBuddy

Prices come from GasBuddy's own site search endpoint, looked up live and only for the reachable
part of a planned route. GasBuddy's terms don't allow automated access, so this is for personal
use, kept to a handful of requests per ride, and stops at the first sign of blocking. Kill switch:
set `LOOKUPS_ENABLED = "false"` in `worker/wrangler.toml` (or in the Cloudflare dashboard).

## Data credits

Station data © OpenStreetMap contributors (ODbL), from M1 on.
