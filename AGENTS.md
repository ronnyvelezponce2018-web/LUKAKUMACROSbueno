# AGENTS.md

## What this project is
NutriTrack ("Lukaku, el terror de los macros") is a **single-file static web app**:
all HTML, CSS and JavaScript live inline in `index.html` (Spanish UI). There is no
package manager, bundler, backend, database, or build step. All user data
(profile, goals, daily log, custom foods, saved measures, the optional Gemini key)
lives in the browser's `localStorage` under keys prefixed `nt-`.

## Running it in the Base44 sandbox
```bash
docker compose -f docker-compose.base44.yml up -d
```
- `web` service: `node:22` running `dev-server.mjs` (dependency-free) with the repo
  bind-mounted at `/app`. Serves the cloned source on host port 3000 and
  live-reloads via an SSE endpoint (`/__dev/reload`) injected into HTML responses.
- Editing `index.html` is enough to change the app; the browser reloads itself.
- There is **no install step and no build**, so nothing needs to be rebuilt.

## Verification
- `curl -s localhost:3000 | grep -o '<title>[^<]*'` should return the app title.
- `docker compose -f docker-compose.base44.yml ps` should show `web` as healthy
  (the healthcheck fetches `/`).
- End-to-end in the browser: the page renders the calorie summary card, typing in
  the search box (e.g. `arroz`) lists catalog results, picking one and pressing
  "Agregar al registro de hoy" adds it to the day's list, and the trash button next
  to an entry removes it.

## Runtime dependencies (browser-side, optional)
These are called **from the browser** at runtime — nothing is configured on the server:
- Open Food Facts (`search.openfoodfacts.org`, `es.openfoodfacts.org`) — search, no key.
- USDA FoodData Central — search via the public `DEMO_KEY` hardcoded in `index.html`
  (rate-limited; swap in a real key in the URL if searches start failing).
- Google Gemini — **only** for the "Foto con IA" tab. The key is not an environment
  variable: the app prompts for it and stores it in `localStorage` (`nt-gkey`). Without
  a key the tab shows a "Poner clave" button and the rest of the app works normally.
  The code path `claude.use("sample")` is a leftover from the original Claude-artifact
  host; it is wrapped in try/catch and stays inert here.

## Gotchas
- `index.html` is ~900 KB because the logo and the celebration video are embedded as
  base64 data URIs; do not "optimize" them away, the page renders them directly.
- All state is per-browser `localStorage`. Clearing site data resets the app; there is
  no server-side persistence to inspect.
