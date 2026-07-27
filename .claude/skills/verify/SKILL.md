---
name: verify
description: How to build, launch, and drive the HeroDefense app in a real browser to verify a change end-to-end.
---

# Verifying HeroDefense

Browser-first Vite + React 19 + React Three Fiber game. Combat is a pure,
deterministic TypeScript simulation (`src/game/*`) rendered as a 3D replay.

## Deterministic checks (setup, not evidence)
- `npm test` — Vitest suite over combat/loot/progression/equipment/shop math.
- `npm run build` — `tsc --noEmit && vite build`. Expect a benign >500 kB
  chunk-size warning; that is not a failure.

These prove the math, not that the app runs. Do NOT stop here for UI changes.

## Drive the real UI (the actual surface)
There is no bundled browser driver. Cold-start recipe that worked:

1. Start the dev server (background), log to the scratchpad, confirm it serves:
   ```bash
   (npm run dev > "$SCRATCH/vite.log" 2>&1 &) ; sleep 5
   curl -s -o /dev/null -w "HTTP %{code}\n" http://localhost:5173/
   ```
   Vite serves on 5173 (HTTP 200). Kill it when done:
   `taskkill //PID <pid-listening-on-5173> //F` (find via `netstat -ano | grep :5173`).
2. Install Playwright once, globally (do NOT add to package.json):
   ```bash
   npm install -g playwright@latest && playwright install chromium
   ```
3. Drive with a Node ESM script. Global Playwright is CommonJS and ESM ignores
   NODE_PATH, so import via absolute file URL + default export:
   ```js
   import pw from "file:///C:/Users/<user>/AppData/Roaming/npm/node_modules/playwright/index.js";
   const { chromium } = pw;
   ```
   `chromium.launch()` (headless) renders the R3F WebGL canvas fine.

## Gotchas / what to actually observe
- State is a single `CampaignState` in localStorage under `tbd-defense:campaign`.
  Start from a clean slate with `page.evaluate(() => localStorage.clear())` then reload.
- `startLevel` runs the sim synchronously and banks rewards immediately — the DOM
  (gold, level, equipment slots, "Current build" stats) updates without waiting for
  the 3D animation. Level 1 is near-unloseable; later levels can legitimately lose.
- To prove **gear affects combat**: the left "Current build" readout shows
  Damage / Speed / Health from `effectiveHero.stats`, which `simulateCombat` also
  consumes. Equip an item whose modifier maps to one of those three and watch the
  number move (uncommon items have only 1 random modifier, so pick one that hits a
  displayed stat). Item labels read "+X% attack speed" but stacking is additive-flat.
- Selectors: `.hero-detail dl div` (stats), `.resource-strip span` (gold/level),
  `.equip-slot`, `.inventory-item`, `.shop-offer`, `button.primary-action` (Start).
