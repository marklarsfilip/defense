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

**Fixture correction:** the first measurement of this section used
`armor-stack` (armor 30, health 150) vs `health-stack` (armor 6, health 270),
copied verbatim from the task brief. Those are not an equal budget: at the
game's own `STAT_POINT_INCREMENTS` conversion rate (`src/game/allocation.ts`:
health 12/point, armor 1/point) from the shared base of armor 10 / health
200, `armor-stack` spends ~15.8 points and `health-stack` spends ~1.8 points —
armor-stack was simply better funded. The reported "armor is still strictly
better against casters" result was therefore a fixture defect, not a balance
gap: it never measured counterplay, only which fixture had the bigger budget.

The fixture was corrected to an equal 20-point spend from the shared base:
`ARMOR_STACK` = armor 30, health 200 (20 points into armor); `HEALTH_STACK` =
armor 10, health 440 (20 points into health, 20 × 12 = 240). Both fixtures
are now built from a `DEFENSIVE_BASE` constant plus `DEFENSIVE_BUDGET_POINTS`
at the real `STAT_POINT_INCREMENTS` rates, so base and fixtures cannot drift
apart.

**Control test correction:** a first attempt at pinning this equality used a
behavioural control — asserting both builds require exactly equal power on a
non-caster level (8, Restless Dead). Review found this vacuous: level 8 is
bottlenecked by offense, not defence, for a no-ability hero, so
`requiredPower` there stays at 2.85 regardless of how much armor or health
`ARMOR_STACK` has — the same "structurally uninformative" pattern the
baseline document's Original section already flags for levels 4, 7 and 10.
It would have stayed green even if the exact unequal-budget bug it was meant
to catch were reintroduced, so it was removed. The invariant is now pinned
directly as arithmetic instead: `defensivePointCost` recomputes each
fixture's spend from `DEFENSIVE_BASE` and `STAT_POINT_INCREMENTS`, and a test
asserts both fixtures cost exactly `DEFENSIVE_BUDGET_POINTS` (20). A second,
equivalent gap was closed for the ability pair at the same time: `SPREAD` and
`FOCUSED`'s equal per-cast damage budget (`targets × damageMultiplier` = 5
for both) was previously only a comment; it is now an assertion via
`abilityDamageBudget`. Do not re-add a level-based behavioural control for
either invariant — assert the arithmetic directly, as both tests now do.

All numbers below are measured with the corrected fixture.

10 tests, 9 passed, 1 failed.

- PASS `armored counterplay > makes big hits the answer on Shield Line, inverting the baseline` — slow-heavy 4.95 < fast-weak 5.10.
- PASS `armored counterplay > makes big hits the answer on Grave March, where the baseline was noise` — slow-heavy 1.95 < fast-weak 3.40 × 0.9 (3.06).
- PASS `caster counterplay > makes health a better answer than armor, inverting the baseline` — health-stack 2.55 < armor-stack 2.85 (corrected fixture; inverts correctly).
- PASS `caster counterplay > spends an equal stat-point budget on both defensive fixtures` — both fixtures cost exactly 20 points.
- PASS `swarm counterplay > keeps multi-target ahead of single-target on Rot Tide` — spread 1.55 < focused 3.70.
- PASS `swarm counterplay > spends an equal per-cast damage budget on both ability fixtures` — both fixtures budget exactly 5 (targets × damageMultiplier).
- PASS `campaign balance > keeps level 1 clearable by every class with no gear at all`.
- PASS `campaign balance > keeps the worst class within twice the median on every early level`.
- **FAIL** `campaign balance > does not inflate difficulty: median power stays within 20% of the baseline` — level 7 (Shield Line) median is 3.40, baseline × 1.2 allows 2.88.
- PASS `campaign balance > leaves every class able to kill something on every early level`.

**Deviation from the brief's prediction:** the brief anticipated three failing
inversion tests (armored ×2, caster ×1). With the corrected fixture, zero
inversion tests fail. The armored inversions already passed even before the
fixture fix, because the `plating` mechanic wired in Tasks 1-5 is a flat
post-armor subtraction, which already structurally favours big hits over chip
damage (a fixed subtraction removes a much larger fraction of a small hit
than a large one) — independent of any `content.ts`/`levels.ts` numbers. The
caster inversion, once measured on an equal-budget fixture, also already
passes: health beats armor against casters (2.55 vs 2.85) because the
`armorPierce: 0.7` rule on the caster trait already lets spellfire bypass
most of the armor-stack's defensive investment. The one remaining failure —
the Shield Line (level 7) median ceiling — is a genuine balance gap, not a
fixture artifact: fixing armored counterplay pushed Shield Line's overall
difficulty up (median 3.40 vs baseline 2.40), past the +20% ceiling (2.88),
because the trait teeth that reward `slow-heavy` did not proportionally
cheapen the level for classes with more balanced builds. Task 7 must bring
this median back down without undoing the now-passing armored inversions.

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
| armor-stack vs health-stack (corrected, equal 20-pt budget) | 4 | Grave March | 3.85 | 3.85 |
| armor-stack vs health-stack (corrected, equal 20-pt budget) | 5 | Lantern Storm | 2.85 | 2.55 |
| armor-stack vs health-stack (corrected, equal 20-pt budget) | 6 | Rot Tide | >12 | >12 |
| armor-stack vs health-stack (corrected, equal 20-pt budget) | 7 | Shield Line | 9.85 | 9.85 |
| armor-stack vs health-stack (corrected, equal 20-pt budget) | 8 | Restless Dead (non-caster, offense-bottlenecked — informational only, not a test) | 2.85 | 2.85 |
| armor-stack vs health-stack (corrected, equal 20-pt budget) | 10 | The Gate Titan | 2.05 | 2.05 |
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
- `armor-stack` vs `health-stack`, on the corrected equal-budget fixture, is
  tied on levels 4, 6, 7 and 10 for the same structural reason noted in the
  Original section (those thresholds are set by damage output, not defensive
  shape), and also tied on level 8 (Restless Dead) — but level 8 is
  offense-bottlenecked for this fixture (see the removed-control note above),
  so that tie is not evidence either way, only a data point. Level 5 (Lantern
  Storm, the caster level) is the only discriminating level, and health now
  correctly wins (2.55 vs 2.85) — this guardrail passes with the corrected
  fixture.
- `spread` vs `focused` on Rot Tide widened from 1.55/2.65 to 1.55/3.70,
  matching the brief's expectation that pack scaling would widen the existing
  correct gap.

## After trait teeth and re-tune

Task 7 measurements, taken after re-tuning `content.ts` and `levels.ts` on
`feat/enemy-trait-behaviors`. Produced by `npx vitest run traitBalance
--reporter=verbose` and by `src/game/balance.ts`.

### Changes made

**Enemy stats (`src/game/content.ts`):**

- `graveBrute.armor`: `9` → `6`. Plating (a flat 9-damage subtraction per hit,
  wired in Tasks 1–5) now carries the armored identity; the raw armor stat is
  cut so mitigation isn't double-counted.
- `shieldBearer.armor`: `18` → `12`. Same reasoning.
- `gateTitan.armor`: `18` → `14`. Same reasoning.
- `glassCultist.damage`: `7` → `4`. Pays for `dangerous` doubling every hit.
- `rotImp.damage`: `3` → `2`. Pays for `swarm` pack scaling (+60% at max
  stacks).
- `spellWisp.damage`: `9` → `8`. The brief suggested `9` → `5`, matched to a
  much softer `enemyDamageMultiplier` curve on Lantern Storm. That
  combination was tried first and made the level *offense-bottlenecked*
  instead of *defense-bottlenecked*: a no-ability hero one-shots each
  18-health Spell Wisp well before the gear factor needed to survive the
  swarm, so `ARMOR_STACK` and `HEALTH_STACK` require identical gear
  regardless of their armor/health split — the same structural failure mode
  the baseline document already documents for level 8. Restoring most of the
  raw damage (and raising the curve, below) keeps survival the binding
  constraint so the armor-pierce mechanic has something to bite on. See
  "Deviation from the brief" below.

**Level curves and multipliers (`src/game/levels.ts`):**

- `heroDamageMultipliers` set to `{}` in `createBruteLevel`, `createShieldLevel`,
  `createSwarmLevel`, `createCasterLevel`, `createGlassLevel` — removing the
  faked class-vs-level counterplay now that traits provide the real thing.
  `createFlyingLevel` keeps its multipliers unchanged, per the brief: `flying`
  is the one trait that is genuinely class-keyed (melee can't reach a flyer),
  and the melee-vs-flying test depends on it.
- `createGlassLevel.enemyDamageMultiplier`: `1.25 + levelNumber * 0.035` →
  `0.85 + levelNumber * 0.02`, as the brief specified — pays for `dangerous`'s
  ×2 damage amplifier.
- `createCasterLevel.enemyDamageMultiplier`: `1.45 + levelNumber * 0.035` →
  `1.6 + levelNumber * 0.034`. The brief's suggested cut (`0.95 + 0.02n`) is
  what was tried first; see the `spellWisp.damage` note above and "Deviation
  from the brief" below for why the curve ended up *higher* than the
  original instead of lower.
- Boss levels (`createBossLevel`) gained an escort — `rotImp` and `skeleton`
  waves alongside the `gateTitan` — per the brief, so `spreadResistance` has
  more than one target to matter against. `enemyHealthMultiplier` dropped
  `1 + levelNumber * 0.14` → `1 + levelNumber * 0.11` to partially pay for
  the added enemies.
- `notes` rewritten on every archetype level (brute, shield, swarm, caster,
  glass, flying, boss) to flavour-only text, per the brief's exact strings.
  The roster panel is now the single source of counterplay claims.

**Tests updated outside the guardrail suite:** `src/game/levels.test.ts` had
two assertions hardcoded to text/shape this task intentionally changed —
`"Melee burst favored"` in the glass-level notes (replaced with the new
`"Fragile but deadly"`) and `toHaveLength(1)` on boss-level waves (replaced
with `.length > 1` now that bosses have an escort). Neither is a balance
guardrail; both were pinned to content this task was directed to rewrite.

### Deviation from the brief

The brief's starting numbers for the caster archetype (`spellWisp.damage`
`9→5`, curve `1.45+0.035n → 0.95+0.02n`) were tried first, exactly as
written. They fixed the Shield Line median (the one guardrail that was
failing) but broke a guardrail that had been passing: the caster inversion
test tied at 2.35 = 2.35 instead of `health-stack < armor-stack`. Tracing it
with `simulateCombat` directly showed both fixtures dying at gear factor 2.30
and both clearing comfortably at 2.35 — the offense/defense balance had
shifted so far toward "hero one-shots everything" that armor and health
stopped mattering before the harness's 0.05 gear-factor resolution could
tell them apart. Restoring `spellWisp.damage` most of the way back to its
original value and raising the curve (ending at `8` and `1.6+0.034n`, rather
than cutting both) kept enough raw incoming damage that survival, not raw
kill speed, decides the outcome — which is what let armor-pierce actually
discriminate between the two fixtures again.

This was found by sweeping `spellWisp.damage` (6–9) against curve
coefficients directly against `simulateCombat`, checking each combination
against both the fixture-inversion gap and the "worst class within 2x
median" guardrail (Guardian, the highest-armor class, is the one most exposed
to the same lever that separates the fixtures). The chosen values
(`damage: 8`, curve `1.6 + levelNumber * 0.034`) land with comfortable margin
on both: Lantern Storm's worst/median ratio is 1.96 (cap 2.0) and its median
(1.15) sits under its 1.26 ceiling; the fixture gap is 0.5 gear-factor steps,
not a single borderline step.

No other deviations from the brief. `graveBrute`/`shieldBearer`/`gateTitan`
armor and `glassCultist`/`rotImp` damage were changed exactly as specified.

### Guardrail results (`npm test -- traitBalance`)

10 tests, 10 passed, 0 failed.

- PASS `armored counterplay > makes big hits the answer on Shield Line, inverting the baseline`.
- PASS `armored counterplay > makes big hits the answer on Grave March, where the baseline was noise`.
- PASS `caster counterplay > makes health a better answer than armor, inverting the baseline`.
- PASS `caster counterplay > spends an equal stat-point budget on both defensive fixtures`.
- PASS `swarm counterplay > keeps multi-target ahead of single-target on Rot Tide`.
- PASS `swarm counterplay > spends an equal per-cast damage budget on both ability fixtures`.
- PASS `campaign balance > keeps level 1 clearable by every class with no gear at all`.
- PASS `campaign balance > keeps the worst class within twice the median on every early level`.
- PASS `campaign balance > does not inflate difficulty: median power stays within 20% of the baseline`.
- PASS `campaign balance > leaves every class able to kill something on every early level`.

### Full class matrix (required power per class per level)

| lvl | subtitle | berserker | arcanist | ranger | summoner | guardian | median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | The Bone Gate | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | Broken Wings | 1.00 | 1.00 | 1.00 | 1.00 | 1.15 | 1.00 |
| 3 | Glass Knives | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 4 | Grave March | 1.40 | 1.65 | 1.70 | 2.05 | 2.55 | 1.70 |
| 5 | Lantern Storm | 1.25 | 1.00 | 1.15 | 1.00 | 2.25 | 1.15 |
| 6 | Rot Tide | 1.90 | 4.00 | 3.15 | 2.60 | 1.05 | 2.60 |
| 7 | Shield Line | 1.90 | 2.45 | 2.50 | 2.95 | 4.25 | 2.50 |
| 8 | Restless Dead | 1.15 | 1.40 | 1.30 | 1.55 | 1.85 | 1.40 |
| 9 | Broken Wings | 1.70 | 1.00 | 1.20 | 2.40 | 2.40 | 1.70 |
| 10 | The Gate Titan | 1.35 | 1.40 | 1.40 | 2.10 | 1.50 | 1.40 |
| 11 | Grave March | 2.70 | 3.20 | 3.05 | 3.95 | 4.75 | 3.20 |
| 12 | Lantern Storm | 2.80 | 4.35 | 4.35 | 1.85 | 3.30 | 3.30 |

### Required power per build shape

| pair | lvl | subtitle | a | b |
| --- | --- | --- | --- | --- |
| fast-weak vs slow-heavy | 4 | Grave March | 3.00 | 1.70 |
| fast-weak vs slow-heavy | 5 | Lantern Storm | 2.25 | 3.80 |
| fast-weak vs slow-heavy | 6 | Rot Tide | 1.55 | >12 |
| fast-weak vs slow-heavy | 7 | Shield Line | 4.30 | 4.10 |
| fast-weak vs slow-heavy | 10 | The Gate Titan | 1.75 | 1.80 |
| armor-stack vs health-stack (equal 20-pt budget) | 4 | Grave March | 3.40 | 3.40 |
| armor-stack vs health-stack (equal 20-pt budget) | 5 | Lantern Storm | 2.85 | 2.35 |
| armor-stack vs health-stack (equal 20-pt budget) | 6 | Rot Tide | >12 | >12 |
| armor-stack vs health-stack (equal 20-pt budget) | 7 | Shield Line | 8.15 | 8.15 |
| armor-stack vs health-stack (equal 20-pt budget) | 8 | Restless Dead (offense-bottlenecked — informational only) | 2.85 | 2.85 |
| armor-stack vs health-stack (equal 20-pt budget) | 10 | The Gate Titan | 2.25 | 2.25 |
| spread vs focused | 4 | Grave March | 2.10 | 2.80 |
| spread vs focused | 5 | Lantern Storm | 2.35 | 2.40 |
| spread vs focused | 6 | Rot Tide | 1.55 | 2.65 |
| spread vs focused | 7 | Shield Line | 3.50 | 4.65 |
| spread vs focused | 10 | The Gate Titan | 1.45 | 1.70 |

### Comparison to Original

All three targeted inversions from "Targets for the re-tune" now hold, and
held already once the fixture correction landed in the "traits wired, not
retuned" measurement — this task's job was closing the one remaining
guardrail gap without undoing them:

- `slow-heavy < fast-weak` on Shield Line: Original 4.25 > 2.40 (backwards);
  now 4.10 < 4.30 — inverted and holds after re-tune.
- `slow-heavy < fast-weak` on Grave March: Original 1.70 ≈ 1.65 (noise); now
  1.70 < 3.00 — a clear gap, not a coin flip.
- `health-stack < armor-stack` on Lantern Storm: Original 2.80 > 2.55
  (armor strictly better); now 2.35 < 2.85 — inverted, and the gap widened
  from the "traits wired" measurement's 2.55/2.85 to 2.35/2.85 as the caster
  retune above was tuned specifically to keep this discriminating.
- `spread < focused` on Rot Tide: already correct at 1.55 < 2.65 in the
  Original; now 1.55 < 2.65 — unchanged, regression guard holds.

Every level whose median rose above the Original, and why:

- **Level 4 / 11 (Grave March, brute archetype, +9.7% / +4.9%):** stripping
  `heroDamageMultipliers` removed the old 1.18×/1.12× magic/summon discount,
  which raises required power for exactly the classes that discount used to
  help (Arcanist, Summoner) — visible in the per-class matrix. This is the
  intended effect: the discount was fake counterplay with no mechanical
  basis, and removing it lets the real armored-counterplay mechanic (plating)
  set the level's difficulty instead.
- **Level 5 / 12 (Lantern Storm, caster archetype, +9.5% / +4.8%):** the
  caster retune (see "Deviation from the brief") intentionally keeps more
  raw damage on this level than the brief's first-pass numbers, specifically
  so the armor-pierce mechanic has enough magnitude to discriminate
  `armor-stack` from `health-stack` at the harness's gear-factor resolution.
  The median cost of that choice is a single-digit percentage, well inside
  the +20% ceiling on both levels it touches.
- **Level 7 (Shield Line, +4.2%):** this is the guardrail that was failing
  (median 3.40 against a 2.88 ceiling, i.e. +41.7%). Stripping the level's
  `heroDamageMultipliers` and cutting `shieldBearer`/`glassCultist` stats
  brought it back to 2.50 (+4.2%) — under the ceiling, and still reflects a
  real (if modest) net increase from Original because plating is a
  permanent, deliberate addition to this level's difficulty budget that the
  Original baseline never had.
- **Level 8 (Restless Dead, mixed archetype, +3.7%):** this archetype's
  `heroDamageMultipliers` were already `{}` before this task, so nothing here
  changed by hand. The rise is entirely the `graveBrute` waves in this
  level's mix picking up plating (a Tasks 1–5 addition, not present in the
  Original baseline at all) — partially offset, not fully, by cutting
  `graveBrute.armor` 9→6.
- **Level 10 (The Gate Titan, boss level, +16.7%):** the boss escort added in
  Step 4 (`rotImp` + `skeleton` waves) is new content that did not exist in
  the Original baseline; `enemyHealthMultiplier`'s coefficient was cut
  (`0.14` → `0.11`) to partially pay for it, but not fully, by design — the
  escort's purpose is to give `spreadResistance` something to bite on, which
  necessarily makes the fight busier. +16.7% is the largest rise of any
  level but still inside the +20% ceiling.

No level's median fell outside its ceiling, level 1 remains exactly 1.00 for
every class, and the swarm regression guard (`spread < focused` on Rot Tide)
was never at risk during this task — it was passing before Task 7 and
required no changes to keep passing.
