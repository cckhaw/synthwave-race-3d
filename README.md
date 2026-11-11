# Synthwave Racer 3D

An endless arcade sky-track racer built with [Three.js](https://threejs.org/), Vite and a fully procedural Web Audio soundtrack — no image or audio assets at all.

**Play:** https://synthwave-race-3d.vercel.app

## Features

- Four selectable worlds, each with its own scenery, road, lighting and car colour:
  **Sky Stunt** (striped ramp above the ocean), **Country Road** (overcast two-lane
  blacktop with hedgerows and power lines), **Alpine Snow** (snowy mountain highway
  with pines, guard rails and falling snow) and **Sunset Circuit** (kerbed race track
  with fences, trees and a start gantry)
- The road ramps and sweeps left/right (vertex-shader bend), tuned per world
- Glossy cars with environment reflections, blue nitro flames, wind streaks and crash debris
- Three AI rivals that race you and dodge traffic, with floating position tags and a
  race-position readout; finishing higher multiplies your score (rival contact is a nudge, not a wreck)
- Analogue speedometer dial with a digital readout
- Top-5 leaderboard per world with driver names: a global board shared by all players,
  plus a per-device board stored in `localStorage` (also the fallback when offline)
- Continuous steering (keyboard / on-screen buttons) and swipe lane switching
- Nitro boost with FOV expansion, x2 score and a NOS meter refilled by canister pickups
- Traffic that always leaves a reachable gap, speed-based score multiplier
- Procedural synth music, engine hum, boost, pickup and crash sounds

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | `←` `→` / `A` `D` | hold ◀ ▶, or swipe to change lane |
| Nitro | `↑` / `W` / `Space` / `Shift` | NOS button, or swipe up |
| Brake | `↓` / `S` | — |
| Pause / mute | `P` / `M` | top-right buttons |
| Choose world (menu) | `←` `→` or `1`–`4` | tap a world card |

## Development

```bash
npm install
npm run dev      # dev server
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`, which builds and deploys to
Vercel **production** and then deletes every older deployment
(`scripts/prune-deployments.mjs`). Vercel's Git integration is switched off in
`vercel.json`, so branches and pull requests never create preview deployments.

### Global leaderboard

`api/leaderboard.js` is a Vercel Function that keeps one Redis sorted set per world,
reached over the Upstash REST API. It needs a Redis store connected to the Vercel
project (Storage → Upstash for Redis), which provides `KV_REST_API_URL` and
`KV_REST_API_TOKEN`. Without them the API answers 503 and the game shows the
per-device board instead.

Scores are computed in the browser, so the API only limits abuse: a signed, single-use
race token issued at the start of each run, a cap on points per real second elapsed,
per-IP rate limiting and name filtering.

Required GitHub Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID` (and `VERCEL_TEAM_ID` for team projects).
