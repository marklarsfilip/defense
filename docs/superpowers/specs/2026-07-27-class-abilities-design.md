# Class Ability System — Design

Date: 2026-07-27
Status: Approved for planning

Part of the "combat depth" work item, built as the first sequenced slice (abilities
first; enemy behaviors, per-class mechanics, and level modifiers come in later slices).

## Problem

The combat simulation is shallow in ways that make several systems inert:

- `abilityPower` only adds a flat `0.55×` to basic-attack damage; `cooldownReduction`
  only nudges basic-attack cadence. Both are effectively dead stats.
- Each class's "special" is just an every-Nth-basic-attack cleave with a damage
  multiplier (`HeroClass.special`) — classes barely feel different in combat.
- There is no cooldown-based ability, no buffs, no shields, no summons (despite a
  Summoner class).

## Goals

- A **data-driven ability system**: abilities defined in content, referenced by
  classes, firing on cooldowns during the simulation.
- Make `abilityPower` and `cooldownReduction` meaningful (they scale ability
  magnitude and cooldown).
- Give each of the five classes a distinct combat identity via one signature
  ability (the system supports more per class later).
- Keep the simulation pure, deterministic, and seed-reproducible; emit a typed
  event timeline the 3D replay can render (minimally for now) without breaking.

## Non-goals (YAGNI)

- A `heal` effect kind (Guardian uses `shield` instead).
- Multiple abilities per class in this slice (the data model supports an array; v1
  content gives each class exactly one).
- Rich per-ability 3D VFX (replay shows a simple cast flash; richer visuals later).
- Enemy abilities, per-class passive mechanics, and level-modifier rules — later
  slices of the combat-depth work item.

## Data model

New types in `src/game/types.ts`:

```ts
export type AbilityEffect =
  | { kind: "damage"; targets: number; damageMultiplier: number; apScaling: number }
  | { kind: "buff"; duration: number; modifiers: Partial<Stats> }
  | { kind: "shield"; amount: number; apScaling: number; duration: number }
  | { kind: "summon"; dps: number; apScaling: number; interval: number; duration: number };

export interface AbilityDefinition {
  id: string;
  name: string;
  description: string;
  cooldown: number; // base seconds
  effect: AbilityEffect;
}
```

`HeroClass.special` is **removed** and replaced with:

```ts
  abilities: AbilityDefinition[];
```

(The current `special: { name, everyNthAttack, cleaveTargets, damageMultiplier }` field
and its every-Nth-attack use in the sim go away.)

## Cooldowns and stat scaling

- `effectiveCooldown = cooldown * (1 - cooldownReduction)` (cooldownReduction is
  already clamped to `[0, 0.75]`).
- Magnitude scales with `abilityPower`:
  - **damage**: `round((heroDamage + abilityPower * apScaling) * damageMultiplier)`
    per target, then armor-mitigated per target as basic attacks already are.
  - **shield**: `round(amount + abilityPower * apScaling)` absorb.
  - **summon**: per-tick damage `round(dps * interval + abilityPower * apScaling)`.
  - **buff**: fixed `modifiers` (no AP scaling; it multiplies the hero's own output
    for its duration).

## Simulation changes (`simulateCombat`)

The fixed-timestep loop (0.05s) gains transient state and, each tick, fires any
ability whose cooldown has elapsed (offensive abilities only fire when at least one
enemy is alive):

- **Cooldown timers**: `nextAbilityReady: Map<abilityId, number>`, initialized so
  abilities can first fire after a short warmup (their `effectiveCooldown`), then
  reset to `time + effectiveCooldown` on each cast.
- **damage**: pick up to `targets` living enemies (oldest-first, same ordering as the
  current cleave), deal scaled+mitigated damage, award xp/gold + death events exactly
  as basic attacks do. Reuses the existing damage/mitigation/death code path.
- **buff**: push `{ modifiers, expiresAt }` to an `activeBuffs` list. The hero's
  **effective** attack speed and damage are computed from base stats plus the sum of
  active (non-expired) buff modifiers wherever the loop currently reads
  `heroClass.stats.attackSpeed` / `.damage` for basic attacks. Expired buffs are
  dropped.
- **shield**: set/refresh a `shield` pool `{ amount, expiresAt }`. Incoming enemy
  damage is absorbed by the shield first (down to 0) before reducing `heroHealth`;
  the shield expires at `expiresAt`.
- **summon**: push `{ nextTick, expiresAt, perTick }` to `activeSummons`. On each tick
  while alive and enemies exist, deal `perTick` to the oldest enemy (mitigated),
  award rewards/deaths, and emit a summon-tick event. Drop expired summons.

New `CombatEvent` variants (all with `time`), so the timeline stays fully typed:

```ts
| { type: "abilityCast"; time; abilityId; label; targetIds: string[] }
| { type: "buff"; time; abilityId; label; duration: number }
| { type: "shield"; time; abilityId; amount: number }
| { type: "summonTick"; time; abilityId; targetId: string; damage: number }
```

Damage abilities also emit the existing `attack`/`projectile`/`death` events so the
replay renders their hits with no new rendering code. **Ability damage does not roll
crit in v1** — it is deterministic and draws no `random()` values. This keeps the
seeded RNG draw order identical to today's basic-attack crit sequence, so ability
firing never perturbs unrelated randomness; cooldowns are purely time-driven. Same
seed → same timeline.

## Content (`content.ts`)

Replace each class's `special` with an `abilities` array of one ability:

- **Berserker — "Bloodlust"** (buff): +attackSpeed & +damage for a few seconds,
  short cooldown.
- **Arcanist — "Arcane Nova"** (damage): many targets, high `apScaling`, medium
  cooldown.
- **Ranger — "Piercing Volley"** (damage): few targets, high `damageMultiplier`,
  medium cooldown.
- **Guardian — "Bulwark"** (shield): sizable absorb scaling with AP, medium cooldown.
- **Summoner — "Spirit Pack"** (summon): spirits dealing periodic damage for a
  duration, medium cooldown, scales with AP.

Numbers are first-pass and tunable; the plan will set concrete values.

## Replay & UI

- **CombatReplay** (`components/CombatReplay.tsx`): add a lightweight cast indicator
  (e.g. a brief flash/label on the hero when an `abilityCast` occurs). It already
  filters events by `type`, so the new event variants are safely ignored where not
  explicitly handled — nothing breaks.
- **Combat log** (`App.tsx`): include `abilityCast` (and optionally `buff`/`shield`)
  in the recent-events list so the player can read what fired.
- **Hero detail** (`App.tsx`): the "Special" line becomes the class's ability
  name(s) (from `abilities`), replacing the removed `special.name`.

## Testing (Vitest)

Pure `simulateCombat` tests (deterministic seeds):

- **damage ability**: hits up to `targets` enemies; higher `abilityPower` increases
  its damage (AP scaling is live).
- **buff**: while active, the hero's basic-attack cadence is faster / hits harder
  than the same build without the buff; after `duration` the effect expires.
- **shield**: an incoming enemy hit is absorbed by the shield before `heroHealth`
  drops; once depleted/expired, damage falls through to health.
- **summon**: over its `duration`, it deals the expected number of ticks
  (`floor(duration / interval)`), each scaled by AP.
- **cooldown/AP math**: `effectiveCooldown` shrinks with `cooldownReduction`;
  ability magnitude grows with `abilityPower`.
- **determinism**: same hero + level + seed → identical event timeline.
- Existing combat tests are updated for the removal of the every-Nth-attack special.

## Impact on Milestone plan

First slice of Milestone-3+ combat depth; revives `abilityPower`/`cooldownReduction`
and differentiates the five classes in actual combat. Enemy behaviors, per-class
passive mechanics, and level-modifier rules follow as later slices.
