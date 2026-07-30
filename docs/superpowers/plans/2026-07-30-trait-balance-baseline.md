# Trait Balance Baseline

Measurements taken before any trait-teeth changes, at commit `70ff484` on
`feat/enemy-trait-behaviors`.

## Metric

A win/loss matrix at base stats is useless past level 3 — the campaign assumes
you gear up, and at base stats levels 4, 7, 8, 11 and 12 are unwinnable by every
class. So balance is measured as **required gear power**: the smallest uniform
multiplier on `health`, `damage`, `armor` and `abilityPower` (stepped by 0.05,
searched up to 12) at which a class clears the level. `1.00` means a naked
level-1 hero already wins. Lower is easier.

This is implemented in `src/game/balance.ts` as `requiredPower(heroClass, levelNumber)`.

## Original: required power per class per level

| lvl | subtitle | berserker | arcanist | ranger | summoner | guardian | median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The Bone Gate | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | Broken Wings | 1.05 | 1.00 | 1.00 | 1.00 | 1.55 | 1.00 |
| 3 | Glass Knives | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 4 | Grave March | 1.25 | 1.40 | 1.55 | 1.80 | 2.10 | 1.55 |
| 5 | Lantern Storm | 1.40 | 1.00 | 1.05 | 1.00 | 1.90 | 1.05 |
| 6 | Rot Tide | 1.70 | 4.00 | 2.80 | 2.60 | 1.00 | 2.60 |
| 7 | Shield Line | 1.75 | 2.10 | 2.40 | 2.60 | 3.90 | 2.40 |
| 8 | Restless Dead | 1.05 | 1.40 | 1.30 | 1.35 | 1.40 | 1.35 |
| 9 | Broken Wings | 1.70 | 1.00 | 1.20 | 2.40 | 2.35 | 1.70 |
| 10 | The Gate Titan | 1.00 | 1.35 | 1.10 | 1.20 | 1.60 | 1.20 |
| 11 | Grave March | 2.40 | 2.55 | 3.05 | 3.50 | 4.15 | 3.05 |
| 12 | Lantern Storm | 2.40 | 3.30 | 3.15 | 1.60 | 3.20 | 3.15 |

## Original: required power per build shape

Three pairs of fixtures, each pair spending an **equal budget** two opposite
ways, so any difference between them is counterplay rather than raw power.

- `fast-weak` (damage 10, attackSpeed 4) vs `slow-heavy` (damage 40,
  attackSpeed 1) — same damage × attackSpeed product of 40.
- `armor-stack` (armor 30, health 150) vs `health-stack` (armor 6, health 270).
- `spread` (5-target ability at 1.0×) vs `focused` (1-target ability at 5.0×).

| pair | lvl | subtitle | a | b |
| --- | --- | --- | --- | --- |
| fast-weak vs slow-heavy | 4 | Grave March | 1.65 | 1.70 |
| fast-weak vs slow-heavy | 5 | Lantern Storm | 1.70 | 2.85 |
| fast-weak vs slow-heavy | 6 | Rot Tide | 1.25 | >12 |
| fast-weak vs slow-heavy | 7 | Shield Line | 2.40 | 4.25 |
| fast-weak vs slow-heavy | 10 | The Gate Titan | 1.05 | 1.05 |
| armor-stack vs health-stack | 4 | Grave March | 3.00 | 3.00 |
| armor-stack vs health-stack | 5 | Lantern Storm | 2.55 | 2.80 |
| armor-stack vs health-stack | 6 | Rot Tide | >12 | >12 |
| armor-stack vs health-stack | 7 | Shield Line | 8.50 | 8.50 |
| armor-stack vs health-stack | 10 | The Gate Titan | 2.05 | 2.05 |
| spread vs focused | 4 | Grave March | 1.70 | 2.30 |
| spread vs focused | 5 | Lantern Storm | 2.55 | 2.55 |
| spread vs focused | 6 | Rot Tide | 1.55 | 2.65 |
| spread vs focused | 7 | Shield Line | 2.90 | 4.25 |
| spread vs focused | 10 | The Gate Titan | 1.65 | 1.00 |

## What the baseline proves

The `heroDamageMultipliers` in `levels.ts` do not merely fail to create
counterplay — three of them point the **wrong way**:

1. **Armored levels favour chip damage, the opposite of their intent.** On
   Shield Line, `fast-weak` needs 2.40× gear and `slow-heavy` needs 4.25×. On
   Grave March they are within noise (1.65 vs 1.70). Armor is a pure multiplier,
   so it cannot distinguish one big hit from many small ones; the slow build is
   *punished* instead, because a 1/second attack wastes overkill on 58-health
   Shield Bearers. The notes claiming "Low single-target builds are slower" are
   backwards.

2. **Armor is currently the better answer to casters.** On Lantern Storm,
   `armor-stack` needs 2.55× and `health-stack` needs 2.80×. Nothing in the
   simulation lets a caster bypass armor, so stacking armor is strictly correct
   against them.

3. **Rot Tide is the Arcanist's worst level in the campaign**, needing 4.00×
   gear — against the Guardian's 1.00× — despite the level handing magic a 1.2×
   damage bonus and the notes advertising "Area damage favored". The level is
   actually a survivability check: 48+ fast-attacking Rot Imps against a
   130-health hero. The AoE bonus is swamped.

Two measurements are structurally uninformative and should not be used as
guardrails:

- The `armor-stack` / `health-stack` pair returns identical values on levels 4,
  7 and 10, because the win threshold there is set by damage output, not by
  defensive shape. Only Lantern Storm (level 5) discriminates.
- Both defensive fixtures read `>12` on Rot Tide: a 20-damage hero with no
  abilities cannot clear 48+ enemies at any gear level.

## Targets for the re-tune

After trait teeth and re-tuning, these inversions must hold, and each is
currently false or marginal:

- `requiredPower(slow-heavy, 7) < requiredPower(fast-weak, 7)` — currently
  4.25 > 2.40. Plating must invert this.
- `requiredPower(slow-heavy, 4) < requiredPower(fast-weak, 4)` — currently
  1.70 > 1.65. Marginal today; must become a clear gap.
- `requiredPower(health-stack, 5) < requiredPower(armor-stack, 5)` — currently
  2.80 > 2.55. Armor pierce must invert this.
- `requiredPower(spread, 6) < requiredPower(focused, 6)` — currently 1.55 <
  2.65, already correct. Pack scaling should widen it; this assertion is a
  regression guard, not a new property.

And these must not regress:

- Level 1 stays at 1.00 for all five classes.
- Per level, `max(required) / median(required)` stays at or below 2.0. The worst
  case today is level 5 at 1.81 (1.90 / 1.05).
- Per level, the median required power must not exceed the Original median above
  by more than 20%. The point of this slice is redistributing difficulty across
  build shapes, not inflating it.

## Traits wired, content not yet re-tuned

Measured at commit `3ff4e9e` on `feat/enemy-trait-behaviors`, after Tasks 1-5
wired real trait mechanics (plating, melee penalty, crit vulnerability, armor
pierce, spread resistance, damage amplifier, pack scaling) into
`simulateCombat`, but before `content.ts` / `levels.ts` were re-tuned. Produced
by `src/game/balance.ts` and `npx vitest run traitBalance --reporter=verbose`.

### Guardrail results (`npm test -- traitBalance`)

8 tests, 6 passed, 2 failed.

- PASS `armored counterplay > makes big hits the answer on Shield Line, inverting the baseline` — slow-heavy 4.95 < fast-weak 5.10.
- PASS `armored counterplay > makes big hits the answer on Grave March, where the baseline was noise` — slow-heavy 1.95 < fast-weak 3.40 × 0.9 (3.06).
- **FAIL** `caster counterplay > makes health a better answer than armor, inverting the baseline` — expected health-stack < armor-stack, got health-stack 3.85 vs armor-stack 3.20 (armor is still strictly better against casters).
- PASS `swarm counterplay > keeps multi-target ahead of single-target on Rot Tide` — spread 1.55 < focused 3.70.
- PASS `campaign balance > keeps level 1 clearable by every class with no gear at all`.
- PASS `campaign balance > keeps the worst class within twice the median on every early level`.
- **FAIL** `campaign balance > does not inflate difficulty: median power stays within 20% of the baseline` — level 7 (Shield Line) median is 3.40, baseline × 1.2 allows 2.88.
- PASS `campaign balance > leaves every class able to kill something on every early level`.

**Deviation from the brief's prediction:** the brief anticipated three failing
inversion tests (armored ×2, caster ×1). In this measurement only one
inversion test fails (caster); both armored inversions already pass. This is
because the plating mechanic wired in Tasks 1-5 is a flat post-armor
subtraction, which already structurally favours big hits over chip damage
(a fixed subtraction removes a much larger fraction of a small hit than a
large one) — independent of any `content.ts`/`levels.ts` numbers. The
caster inversion still fails because nothing in the sim lets armor stop
mattering fast enough relative to raw health for a caster fight, and the
Shield Line median failure is new: fixing the armored counterplay pushed
Shield Line's overall difficulty up (median 3.40 vs baseline 2.40), past the
+20% ceiling (2.88), because the trait teeth that reward `slow-heavy` did not
proportionally cheapen the level for classes with more balanced builds. Task 7
must address both: invert the caster result and bring Shield Line's median
back down.

### Full class matrix (required power per class per level)

| lvl | subtitle | berserker | arcanist | ranger | summoner | guardian | median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The Bone Gate | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | Broken Wings | 1.00 | 1.00 | 1.00 | 1.00 | 1.15 | 1.00 |
| 3 | Glass Knives | 1.00 | 1.40 | 1.45 | 1.00 | 1.00 | 1.00 |
| 4 | Grave March | 1.50 | 1.55 | 1.80 | 2.10 | 2.85 | 1.80 |
| 5 | Lantern Storm | 1.40 | 1.00 | 1.25 | 1.00 | 2.45 | 1.25 |
| 6 | Rot Tide | 2.95 | 4.00 | 3.95 | 3.10 | 1.75 | 3.10 |
| 7 | Shield Line | 2.30 | 2.45 | 3.40 | 3.60 | 5.15 | 3.40 |
| 8 | Restless Dead | 1.20 | 1.40 | 1.30 | 1.65 | 2.15 | 1.40 |
| 9 | Broken Wings | 1.70 | 1.00 | 1.20 | 2.40 | 2.40 | 1.70 |
| 10 | The Gate Titan | 1.00 | 1.35 | 1.10 | 1.20 | 1.60 | 1.20 |
| 11 | Grave March | 3.05 | 3.05 | 3.45 | 4.20 | 5.35 | 3.45 |
| 12 | Lantern Storm | 2.80 | 4.75 | 4.45 | 1.95 | 3.55 | 3.55 |

### Required power per build shape

| pair | lvl | subtitle | a | b |
| --- | --- | --- | --- | --- |
| fast-weak vs slow-heavy | 4 | Grave March | 3.40 | 1.95 |
| fast-weak vs slow-heavy | 5 | Lantern Storm | 2.40 | 4.25 |
| fast-weak vs slow-heavy | 6 | Rot Tide | 1.45 | >12 |
| fast-weak vs slow-heavy | 7 | Shield Line | 5.10 | 4.95 |
| fast-weak vs slow-heavy | 10 | The Gate Titan | 1.05 | 1.05 |
| armor-stack vs health-stack | 4 | Grave March | 3.85 | 3.85 |
| armor-stack vs health-stack | 5 | Lantern Storm | 3.20 | 3.85 |
| armor-stack vs health-stack | 6 | Rot Tide | >12 | >12 |
| armor-stack vs health-stack | 7 | Shield Line | 9.85 | 9.85 |
| armor-stack vs health-stack | 10 | The Gate Titan | 2.05 | 2.05 |
| spread vs focused | 4 | Grave March | 2.35 | 3.15 |
| spread vs focused | 5 | Lantern Storm | 2.55 | 2.55 |
| spread vs focused | 6 | Rot Tide | 1.55 | 3.70 |
| spread vs focused | 7 | Shield Line | 4.25 | 5.60 |
| spread vs focused | 10 | The Gate Titan | 1.65 | 1.00 |

Notes on this table:

- `fast-weak` vs `slow-heavy` on Shield Line (7) is now inverted from the
  original baseline (4.25/2.40, slow-heavy worse) to 4.95/5.10 (slow-heavy
  better), confirming the plating mechanic works as intended, though the gap
  is narrower than on Grave March.
- `armor-stack` vs `health-stack` is unchanged/tied on levels 4, 6, 7 and 10
  for the same structural reason noted in the Original section (those
  thresholds are set by damage output, not defensive shape); level 5
  (Lantern Storm, the caster level) is the only discriminating level, and it
  still favours armor (3.20 vs 3.85) — the still-failing guardrail.
- `spread` vs `focused` on Rot Tide widened from 1.55/2.65 to 1.55/3.70,
  matching the brief's expectation that pack scaling would widen the existing
  correct gap.

## After trait teeth and re-tune

_To be filled in at Task 7 Step 6._
