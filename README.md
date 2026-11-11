# Synthwave Racer 3D

An endless low-poly neon highway racer built with [Three.js](https://threejs.org/), Vite and a fully procedural Web Audio soundtrack — no image or audio assets at all.

**Play:** https://synthwave-race-3d.vercel.app

## Features

- Neon grid highway, wireframe mountains, striped synthwave sun, fog and bloom
- Exhaust and velocity-streak particles that stretch with speed
- Continuous steering (keyboard / on-screen buttons) and swipe lane switching
- Turbo boost with FOV expansion, x2 score and an energy meter refilled by orbs
- Traffic that always leaves a reachable gap, speed-based score multiplier
- Procedural synth music, engine hum, boost, pickup and crash sounds
- High score persisted in `localStorage`

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | `←` `→` / `A` `D` | hold ◀ ▶, or swipe to change lane |
| Turbo | `↑` / `W` / `Space` / `Shift` | TURBO button, or swipe up |
| Brake | `↓` / `S` | — |
| Pause / mute | `P` / `M` | top-right buttons |

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

Required GitHub Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID` (and `VERCEL_TEAM_ID` for team projects).
