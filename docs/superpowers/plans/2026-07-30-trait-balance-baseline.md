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
`feat/enemy-trait-behaviors`, **including a fix round** after independent
review swept the parameter space and found seven issues in the first pass.
This section reflects the corrected, final state. Produced by `npx vitest
run traitBalance --reporter=verbose` and by `src/game/balance.ts`.

### Changes made (final)

**Enemy stats (`src/game/content.ts`):**

- `graveBrute.armor`: `9` → `6`. Plating (a flat 9-damage subtraction per hit,
  wired in Tasks 1–5) now carries the armored identity; the raw armor stat is
  cut so mitigation isn't double-counted.
- `shieldBearer.armor`: `18` → `12`. Same reasoning.
- `gateTitan.armor`: unchanged at `18`. A first pass cut this to `14` on the
  same "plating carries the armored identity" reasoning applied to
  `graveBrute`/`shieldBearer` — but `boss` grants no plating, so that
  reasoning doesn't transfer, and the cut had no independent justification.
  Restored to the original value.
- `glassCultist.damage`: `7` → `4`. Pays for `dangerous` doubling every hit.
- `rotImp.damage`: `3` → `2`. Pays for `swarm` pack scaling (+60% at max
  stacks).
- `spellWisp.damage`: `9` → `9` (**unchanged**). A first pass cut this to `8`
  (having tried the brief's `5` first and found it broke a guardrail — see
  "Level 5 caster retune" below). Review found an equally effective fix that
  needed no cut to this value at all: see below.

**Level curves and multipliers (`src/game/levels.ts`):**

- `heroDamageMultipliers` set to `{}` in `createBruteLevel`,
  `createShieldLevel`, `createSwarmLevel`, `createCasterLevel`,
  `createGlassLevel`, **and `createFlyingLevel`**. The brief said to leave
  `createFlyingLevel`'s multipliers in place, reasoning that `flying` is
  the one genuinely class-keyed trait. Review challenged that: the `flying`
  trait's own `meleePenalty: 0.38` already delivers ranged-beats-melee
  mechanically, so the level's `ranged: 1.2 / magic: 1.12 / summon: 1.08`
  multipliers were a double-count of the exact kind this slice exists to
  remove. Stripped them; the full suite (146 tests, including the
  melee-vs-flying test in `simulateCombat.test.ts`) stayed green, so the
  removal stands.
- `createGlassLevel.enemyDamageMultiplier`: `1.25 + levelNumber * 0.035` →
  `0.85 + levelNumber * 0.02` — pays for `dangerous`'s ×2 damage amplifier.
- `createCasterLevel.enemyDamageMultiplier`: `1.45 + levelNumber * 0.035` →
  **`1.35 + levelNumber * 0.03`** — below the original at every level
  number, as the design intent requires (armor pierce already compounds with
  caster damage, so caster damage should come down). See "Level 5 caster
  retune" below for why this number, not the brief's steeper `0.95+0.02n`
  cut, is the one that works.
- `createBossLevel` gained an escort, went through two more revisions:
  currently `rotImp: 6, interval: 6` alongside `gateTitan` (no `skeleton`
  wave). `enemyHealthMultiplier`: `1 + levelNumber * 0.14` → `1 + levelNumber
  * 0.13`. See "Boss escort size" below — the first escort (6–9 `rotImp` +
  4–6 `skeleton`) made spread strictly better than focused fire, contradicting
  the `boss` trait's own description (`"sustained single-target damage
  wins"`); the second (`rotImp: 3` in a clustered burst) fixed the inversion
  but was mechanically inert — `spreadResistance` had nothing to act on,
  since the imps were all dead early in the fight. Spacing 6 imps 6 seconds
  apart keeps the escort alive across most of the fight, which is what makes
  the trait actually load-bearing.
- `notes` rewritten to flavour-only text on every archetype level (brute,
  shield, swarm, caster, glass, flying, boss). Four of the brief's exact
  strings (`"Heavy reward chest"` / `"High reward chest"` on brute, shield,
  caster, glass) were themselves false — see "Reward-chest notes" below —
  and were corrected to `"Higher reward per kill"`, which is what those
  levels actually have.

**Tests updated outside the guardrail suite:** `src/game/levels.test.ts` had
two assertions hardcoded to text/shape this task intentionally changed —
`"Melee burst favored"` in the glass-level notes (replaced with the new
`"Fragile but deadly"`) and `toHaveLength(1)` on boss-level waves (replaced
with `.length > 1` now that bosses have an escort). Neither is a balance
guardrail; both were pinned to content this task was directed to rewrite.
`src/game/traitBalance.test.ts` gained a comment (no assertion change) at the
worst/median guardrail — see "Level 5 fragility" below.

### Level 5 caster retune — corrected narrative

A first pass tried the brief's caster numbers verbatim (`spellWisp.damage`
`9→5`, curve `1.45+0.035n → 0.95+0.02n`). They fixed the Shield Line median
(the guardrail that was failing) but broke a guardrail that had been
passing: the caster inversion test tied at 2.35 = 2.35 instead of asserting
`health-stack < armor-stack`. Tracing it with `simulateCombat` directly
showed both fixtures dying at gear factor 2.30 and both clearing comfortably
at 2.35 — the cut was steep enough that a no-ability hero one-shots every
18-health Spell Wisp well before the gear factor needed to survive the
swarm, so armor and health stopped mattering before the harness's 0.05
gear-factor resolution could tell the fixtures apart (the same
offense-bottleneck failure mode already documented for level 8).

That diagnosis was correct. The conclusion drawn from it — that fixing the
tie required pushing `spellWisp.damage` and the curve back up, past the
*original* values (landing at `damage: 8`, curve `1.6+0.034n`, both above
`content.ts`'s pre-task numbers) — was wrong, and review caught it. A wider
sweep found `spellWisp.damage: 9` (the *original*, unchanged) paired with
curve `1.35 + levelNumber * 0.03` (*below* the original at every level)
produces results identical to the over-corrected pair: median 1.15, ratio
1.96, armor-stack 2.85 vs health-stack 2.35. The real fix was landing
*somewhere below the offense-bottleneck threshold*, not landing *above the
original*; the first pass overshot in the other direction because it kept
testing points above the original rather than searching the space between
the brief's cut and the original itself. Design intent — caster damage comes
down because armor pierce already compounds — holds with this pairing,
where it did not with the committed-then-corrected `8`/`1.6+0.034n`.

### Boss escort size

The first-pass escort (`rotImp: 6 + floor(n/5)`, `skeleton: 4 + floor(n/10)`)
made AoE strictly better on boss levels: measured `requiredPower(spread, 10)
= 1.45` vs `requiredPower(focused, 10) = 1.70`, and at level 20, `spread =
2.10` vs `focused = 2.65` — spread winning both times. That directly
contradicts the `boss` trait's own summary in `traits.ts`
(`"sustained single-target damage wins"`), which a lone boss honoured
correctly (`focused 1.00 < spread 1.25`) before any escort existed.

A second-pass escort (`rotImp: 3`, no `skeleton`, spawned in a single
clustered burst at `startsAt: 6, interval: 0.9`) fixed the inversion
(`focused 1.35 < spread 1.55` at level 10) but turned out to be a **false
fix**: disabling `spreadResistance` outright (setting the multiplier to `1`
at runtime, not editing `traits.ts`) changed `requiredPower(spread, …)` by
exactly zero at every level tested. Cause: with only 3 imps spawned in a
tight burst starting at t=6, all three were dead well before the boss
became vulnerable to a joint hit later in the fight — 2 of 17 spread casts
ever struck more than one enemy, and the escort was gone by t≈13 in a
65-second fight. `focused < spread` held for the same reason it holds for a
*lone* boss (offense parity), not because of the trait. This is exactly the
failure mode the `boss` trait exists to avoid, and it looked identical to a
working fix from every guardrail's perspective — see "campaign balance >
boss counterplay" below for the regression test this added.

Swept escort configurations directly against `simulateCombat`, checking not
just the inversion but whether disabling `spreadResistance` actually moves
the number:

| escort | lvl 10: spread / focused | lvl 20: spread / focused | resistance live? |
| --- | --- | --- | --- |
| `rotImp 6+n/5` + `skeleton 4+n/10` (first pass) | 1.45 / 1.70 (wrong) | 2.10 / 2.65 (wrong) | — |
| `rotImp 3`, clustered burst, no skeleton | 1.55 / 1.35 (right) | 2.45 / 1.80 (right) | **no** — inert |
| **`rotImp 6`, `interval: 6` (chosen)** | **1.65 / 1.45 (right)** | **2.50 / 2.05 (right)** | **yes** |

Spreading 6 imps 6 seconds apart keeps at least one alive across most of the
65-second fight, overlapping with the boss for genuine multi-target casts.
Confirmed directly: with `spreadResistance` at its real value (`0.6`),
`requiredPower(spread, 10) = 1.65`; with it disabled (`1`, measured at
runtime, `traits.ts` untouched), `requiredPower(spread, 10) = 1.55` — a real
0.10 gap, not zero. Same at level 20: `2.50` (resistance on) vs `2.45`
(resistance off). `enemyHealthMultiplier`'s coefficient stayed at `0.13`
(raised from the original `0.11` in an earlier pass; no further change was
needed here). `gateTitan.armor` is `18` (see below). Level 10's median
lands at **1.40** against the **1.44** ceiling — inside the cap, but with
little room; worst/median ratio is 1.18.

A guardrail now pins both properties directly in
`src/game/traitBalance.test.ts` (`describe("boss counterplay", ...)`): one
asserts `focused < spread` on a boss level, and a second — the one that
actually catches an inert escort — measures `spread`'s required power with
`spreadResistance` enabled and disabled (toggled at runtime, restored in a
`finally` block) and asserts the two differ. An inert escort, like the
`rotImp: 3` clustered-burst configuration above, passes the first test and
fails the second.

### Level 5 fragility (known, documented, not fixed)

Independent review found that level 5's (Lantern Storm) worst/median ratio
sits at **1.96 against the 2.0 cap** — passing, but with a per-hit-value
failure band from 9.6 to 12.4 (ratio 2.05–2.20) immediately adjacent to it.
The mechanism: the median (1.15) is held solely by the Ranger. Arcanist and
Summoner both sit on the 1.00 gear floor (level 5's easiest possible
reading), so any future buff to either of them — independent of anything on
this level — would drop the median to 1.00 and push Guardian's required
power (2.25) over the 2.0 cap without Guardian changing at all. This is
recorded here, and as a comment on the guardrail in
`src/game/traitBalance.test.ts`, rather than fixed: the assertion itself is
correct and must not be weakened, and there is no single number on this
level whose change wouldn't just relocate the same fragility (e.g. lowering
Guardian's requirement risks breaking the armor-pierce inversion this level
exists to test; raising the floor classes' requirement risks the median
ceiling on the level below it). Watch this level first if any of the three
floor/near-floor classes (Arcanist, Summoner, Ranger) gets buffed later.

### Reward-chest notes were wrong in the brief

Four of the brief's exact note strings — `"Heavy reward chest"` on Grave
March and Shield Line, `"High reward chest"` on Lantern Storm and Glass
Knives — are false. All four archetypes call `createChest(levelNumber, 1)`,
identical to the mixed level's chest and nowhere near boss (`1.9`) or bonus
(`2.8`) luck. What they actually have is an elevated `rewardMultiplier`
(1.16–1.2, vs. baseline 1), which scales per-kill XP/gold, not chest luck.
Replaced all four with `"Higher reward per kill"`, which is what's true.

`createBossLevel`'s original note, `"Higher reward chest"`, is also
accurate (its chest luck multiplier really is 1.9, unlike the four
archetypes above) — but an earlier pass of this task changed it to
`"Higher reward per kill"` anyway, apparently by over-applying the same
find-and-replace as the four genuine fixes. That dropped the one chest
claim in the whole file that was actually true. Restored `createBossLevel`'s
note to `"Higher reward chest"`.

### Glass retune verification (level 17)

Levels 1–12 are the only range the guardrail harness measures, but the glass
archetype's *next* occurrence after level 3 is level 17 — outside that
range, so the `glassCultist` damage cut (`7→4`) and curve cut
(`1.25+0.035n → 0.85+0.02n`) were unverified by anything. Measured directly:

| | berserker | arcanist | ranger | summoner | guardian | median |
| --- | --- | --- | --- | --- | --- | --- |
| Before (original numbers) | 5.05 | 8.65 | 7.80 | 5.80 | 3.80 | 5.80 |
| After (current numbers) | 2.95 | 5.10 | 4.50 | 2.95 | 2.00 | 2.95 |

The median roughly halved (5.80 → 2.95). Checked against neighbouring levels
at the same (post-retune) settings to see whether this is a problem or an
improvement:

| lvl | 13 | 14 | 15 | 16 | **17** | 18 | 19 | 20 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| median | 3.40 | 4.20 | 2.80 | 2.90 | **2.95** | 4.40 | 5.35 | 1.90 |

Before the retune, level 17 (5.80) was a difficulty spike well above its
neighbours (15: 2.80, 16: 2.90, 18: 4.40) — closer to level 19's 5.35 than to
the levels either side of it. After the retune, level 17 (2.95) sits
smoothly between 16 (2.90) and 18 (4.40), consistent with the surrounding
curve. The retune is confirmed to have removed an anomalous spike rather
than trivializing or overtuning the level — no correction needed.

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

Full repo suite: `npm test` — 148/148 passed (12 in `traitBalance.test.ts`,
including the two new boss-counterplay tests). `npm run build` — clean.

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
| 9 | Broken Wings | 1.70 | 1.10 | 1.45 | 2.40 | 2.40 | 1.70 |
| 10 | The Gate Titan | 1.00 | 1.40 | 1.10 | 1.65 | 1.60 | 1.40 |
| 11 | Grave March | 2.70 | 3.20 | 3.05 | 3.95 | 4.75 | 3.20 |
| 12 | Lantern Storm | 2.55 | 4.25 | 4.00 | 1.75 | 3.30 | 3.30 |

Levels 9 and 10 shifted from the pre-fix-round table: level 9 (Broken Wings)
because stripping its `heroDamageMultipliers` (item 4) removed the
ranged/magic/summon discount, raising Arcanist (1.00→1.10) and Ranger
(1.20→1.45) modestly; level 10 (boss) because the escort was rebuilt twice —
first shrunk to `rotImp: 3`, then rebuilt as `rotImp: 6, interval: 6` once
that was found to be mechanically inert (see "Boss escort size" below).
Level 9's median is unchanged from baseline (1.70). Level 10's median is
**1.40** against a **1.44** ceiling — passing, but the tightest margin of
any level in this table (worst/median ratio 1.18).

### Required power per build shape

| pair | lvl | subtitle | a | b |
| --- | --- | --- | --- | --- |
| fast-weak vs slow-heavy | 4 | Grave March | 3.00 | 1.70 |
| fast-weak vs slow-heavy | 5 | Lantern Storm | 2.25 | 3.80 |
| fast-weak vs slow-heavy | 6 | Rot Tide | 1.55 | >12 |
| fast-weak vs slow-heavy | 7 | Shield Line | 4.30 | 4.10 |
| fast-weak vs slow-heavy | 10 | The Gate Titan | 1.55 | 1.55 |
| armor-stack vs health-stack (equal 20-pt budget) | 4 | Grave March | 3.40 | 3.40 |
| armor-stack vs health-stack (equal 20-pt budget) | 5 | Lantern Storm | 2.85 | 2.35 |
| armor-stack vs health-stack (equal 20-pt budget) | 6 | Rot Tide | >12 | >12 |
| armor-stack vs health-stack (equal 20-pt budget) | 7 | Shield Line | 8.15 | 8.15 |
| armor-stack vs health-stack (equal 20-pt budget) | 8 | Restless Dead (offense-bottlenecked — informational only) | 2.85 | 2.85 |
| armor-stack vs health-stack (equal 20-pt budget) | 10 | The Gate Titan | 2.15 | 2.15 |
| spread vs focused | 4 | Grave March | 2.10 | 2.80 |
| spread vs focused | 5 | Lantern Storm | 2.35 | 2.40 |
| spread vs focused | 6 | Rot Tide | 1.55 | 2.65 |
| spread vs focused | 7 | Shield Line | 3.50 | 4.65 |
| spread vs focused | 10 | The Gate Titan | 1.65 | 1.45 |

`spread vs focused` on The Gate Titan (level 10) is the boss inversion:
`focused` (1.45) beats `spread` (1.65), matching the `boss` trait's design
intent, and — unlike the intermediate `rotImp: 3` escort, which produced the
same inversion (1.55/1.35) for the wrong reason — this is now confirmed
mechanically live (see "Boss escort size" below): disabling
`spreadResistance` at runtime moves `spread`'s required power from 1.65 down
to 1.55, a real change, not zero.

### Comparison to Original

All three targeted inversions from "Targets for the re-tune" hold:

- `slow-heavy < fast-weak` on Shield Line: Original 4.25 > 2.40 (backwards);
  now 4.10 < 4.30 — inverted and holds after re-tune.
- `slow-heavy < fast-weak` on Grave March: Original 1.70 ≈ 1.65 (noise); now
  1.70 < 3.00 — a clear gap, not a coin flip.
- `health-stack < armor-stack` on Lantern Storm: Original 2.80 > 2.55
  (armor strictly better); now 2.35 < 2.85 — inverted, on numbers below the
  original (see "Level 5 caster retune" above).
- `spread < focused` on Rot Tide: already correct at 1.55 < 2.65 in the
  Original; now 1.55 < 2.65 — unchanged, regression guard holds.
- `focused < spread` on The Gate Titan (boss levels): the Original had no
  escort to test against (a lone boss trivially honours this — nothing for
  `spreadResistance` to act on). With the final escort (`rotImp: 6,
  interval: 6`), `focused` (1.45) < `spread` (1.65), and — the property that
  actually matters here — the gap is confirmed mechanically live, not a
  coincidence of offense parity (see "Boss escort size" below).

Every level whose median rose above the Original, and why:

- **Level 4 / 11 (Grave March, brute archetype, +9.7% / +4.9%):** stripping
  `heroDamageMultipliers` removed the old 1.18×/1.12× magic/summon discount,
  which raises required power for exactly the classes that discount used to
  help (Arcanist, Summoner). The discount was fake counterplay with no
  mechanical basis; removing it lets plating set the level's difficulty
  instead.
- **Level 5 / 12 (Lantern Storm, caster archetype, +9.5% / +4.8%):** the
  caster curve (`1.35+0.03n`, below the original `1.45+0.035n`) is a genuine
  cut, but `spellWisp.damage` staying at its original `9` means the level's
  base threat didn't fall as far as the curve alone suggests. The median
  cost is a single-digit percentage on both levels this archetype touches,
  well inside the +20% ceiling, and buys the armor-pierce mechanic enough
  magnitude to discriminate `armor-stack` from `health-stack` at the
  harness's gear-factor resolution (see "Level 5 fragility" above for the
  associated risk).
- **Level 7 (Shield Line, +4.2%):** this is the guardrail that was failing
  pre-task (median 3.40 against a 2.88 ceiling, +41.7%). Stripping the
  level's `heroDamageMultipliers` and cutting `shieldBearer`/`glassCultist`
  stats brought it back to 2.50 (+4.2%) — under the ceiling, and still
  reflects a real (if modest) net increase from Original because plating is
  a permanent, deliberate addition to this level's difficulty budget that
  the Original baseline never had.
- **Level 8 (Restless Dead, mixed archetype, +3.7%):** this archetype's
  `heroDamageMultipliers` were already `{}` before this task, so nothing
  here changed by hand. The rise is entirely the `graveBrute` waves in this
  level's mix picking up plating (a Tasks 1–5 addition, not present in the
  Original baseline at all) — partially offset, not fully, by cutting
  `graveBrute.armor` 9→6.
- **Level 9 (Broken Wings, +0%, no median change):** stripping this level's
  `heroDamageMultipliers` (fix-round item 4) raised Arcanist and Ranger's
  individual requirements, but not enough to move the median (still 1.70).
- **Level 10 (The Gate Titan, boss level, +16.7%):** the boss escort
  (`rotImp: 6, interval: 6`) is new content that did not exist in the
  Original baseline, and is now confirmed to be mechanically load-bearing
  (see "Boss escort size" below) rather than decorative. Its size was set by
  what `spreadResistance` needs to have something to act on across most of
  the fight, not by a difficulty target — `enemyHealthMultiplier`'s
  coefficient (`0.14` → `0.13` net vs. Original) was the only lever pulled
  to keep the median inside the ceiling. +16.7% is the largest rise of any
  level in this table, landing at median 1.40 against the 1.44 ceiling —
  inside the cap, but the tightest margin here. If this level's difficulty
  needs to come down later, `enemyHealthMultiplier` is the lever to pull
  first; shrinking the escort risks reintroducing the inert-escort bug this
  fix round exists to prevent.

No level's median fell outside its ceiling, level 1 remains exactly 1.00 for
every class, and the swarm regression guard (`spread < focused` on Rot Tide)
was never at risk during this task — it was passing before Task 7 and
required no changes to keep passing.
