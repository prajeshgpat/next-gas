# NextGas

Cheapest reachable gas along a route. Plan: `docs/PLAN.md`. Overview and commands: `README.md`.

## Workflow

- Work on `dev`; never commit or push to `main`. Changes reach `main` only via PR (merging deploys).
- Run `pnpm check` before pushing.

## Conventions

- Imperial units everywhere (mi, ft, gal, $/gal, minutes) in code, data and UI.
- A missing measurement or price is `null` / "No data", never 0.
- `packages/core` stays pure (no I/O) so it runs in the browser and in tests.
- Station reachability is a safety rule: never suggest a station outside `safeRangeMi`.

## GasBuddy

- Keep request volume minimal: no scheduled scraping, no retries on 403/429, one lookup per point.
- Never call GasBuddy from tests or CI checks; use the fixture in `worker/test/fixtures/`.
- Run `pnpm spike:gasbuddy` or the spike workflow only when asked.
