# Enemy Trait Behaviors — Design

Date: 2026-07-30
Roadmap item: 2b (more enemy behaviors), following 2a (class abilities).

## Problem

Enemy traits are decorative. `EnemyTrait` has nine members and only one of them —
`flying` — has any mechanical effect (`getTargetDamageMultiplier` in
`simulateCombat.ts` gives melee heroes 0.38× against flyers). `armored`,
`caster`, `dangerous`, `swarm`, `fragile`, `boss`, `ground` and `bonus` are
labels attached to stat presets. Enemies all behave identically: one periodic
attack, forever.

Worse, the counterplay those traits are supposed to create is currently faked one
level up, in `levels.ts`, through `LevelCombatRules.heroDamageMultipliers`:

| Level archetype | Faked counterplay |
| --- | --- |
| Grave March (armored) | `magic: 1.18, summon: 1.12` |
| Shield Line (armored) | `magic: 1.24, ranged: 0.9` |
| Rot Tide (swarm) | `magic: 1.2, summon: 1.16, melee: 1.08` |
| Lantern Storm (casters) | `ranged: 1.22, magic: 1.05, melee: 0.92` |
| Broken Wings (flying) | `ranged: 1.2, magic: 1.12, summon: 1.08` |
| Glass Knives (dangerous) | `melee: 1.15, ranged: 1.08` |

These are level-wide multipliers keyed to the hero's **damage kind**. They reward
*picking the right class for the level*, not *building the right way*. A
Berserker and a Guardian are both `melee`, so they receive identical treatment
regardless of how differently they are built. And the hand-written `notes`
strings already advertise mechanics that do not exist — "Single-target builds
waste attacks", "Low single-target builds are slower" — nothing in the
simulation models either claim.

The player also has no way to see any of this. There is no pre-combat enemy
roster; the level panel renders three hand-written `notes` strings, and the
post-combat log shows the last seven events with no explanation of why damage
landed the way it did.

## Goal

Traits force **build counterplay**: each trait punishes a specific build shape
and rewards another, in both directions (how the hero's damage lands on the
enemy, and how the enemy hurts the hero). Counterplay must be **sharp but
recoverable** — a mismatched build clearly struggles and can lose, but
respeccing allocation, swapping a gear piece, or taking a different talent fixes
it. No hard immunities; every resolved damage instance stays at 1 or more.

Counterplay moves out of `heroDamageMultipliers` and into per-enemy trait rules.

Non-goals for this slice:

- No enemy abilities or cooldown mechanics (that is timing pressure, a later
  slice).
- No movement or range simulation. `moveSpeed` and the hero's `range` stat stay
  unused; every enemy still reaches the hero at `ENEMY_REACH_TIME = 4.2s`.
- No new enemy types and no new trait types. The existing nine enemies and nine
  traits are the whole content surface.
- No difficulty inflation for its own sake. Levels should land at roughly their
  current difficulty, with the difficulty *redistributed* across build shapes.

## Trait Mechanics

Each trait gets at most a few knobs, and every trait has a distinct answer.

| Trait | Rule | Punishes | Rewards |
| --- | --- | --- | --- |
| `ground` | none | — | — |
| `flying` | melee damage ×0.38 (unchanged) | melee classes | ranged, magic, summon |
| `fragile` | critical hits deal ×1.6 | flat-damage builds | crit chance / crit damage |
| `armored` | **plating**: a flat amount subtracted from every hit *after* armor mitigation | many small hits (raw attack speed) | high damage per hit, crits, ability burst |
| `caster` | **armor pierce 0.7**: ignores 70% of the hero's armor | armor stacking | health, shields, fast kills |
| `dangerous` | **damage amplifier 2.0**: every strike lands for double | glass-cannon health pools | armor and health together |
| `swarm` | **pack scaling**: +10% outgoing damage and 6% incoming damage resistance per additional living packmate, capped at 6 | single-target, slow clears | multi-target abilities, fast thinning |
| `boss` | **spread resistance 0.6**: damage from an attack that struck more than one enemy is reduced 40% | builds that lean entirely on multi-target abilities | sustained single-target damage |
| `bonus` | none (loot piñata) | — | — |

Notes on individual rules:

**Plating** is what gives `armored` its identity, and it is deliberately a flat
subtraction rather than another multiplier — that is the only shape that
distinguishes "one big hit" from "many small hits". Base value is 9. Because a
flat value would become irrelevant as the campaign scales, plating is resolved
per spawn in `buildEnemySpawns` as `round(basePlating * enemyHealthMultiplier)`,
so it grows with the level the same way enemy health does. Armored enemies' raw
`armor` stats come **down** to compensate (see Balance), so mitigation is not
double-counted.

**Pack scaling** counts all living enemies carrying the `swarm` trait, not just
same-species ones. It self-answers: the bonus decays as the pack dies, so a
high-single-target-DPS build still clears a swarm, just more slowly than a
multi-target build. That is what keeps `swarm` recoverable for classes with no
multi-target ability (Berserker has only a buff).

**Spread resistance** keys off how many enemies the *same* attack actually
struck, not the ability's maximum `targets`. An Arcanist's 5-target Arcane Nova
hitting a lone boss struck one target, so it takes no penalty; the same nova
hitting the boss plus four adds does. This means boss levels need adds for the
mechanic to have anything to bite on — see the boss-adds decision below.

**Fragile** only interacts with basic attacks in practice, because ability
damage never crits (`critical: false`, a determinism decision from 2a). That is
consistent and intended.

## Damage Pipeline

All trait math lives in one resolver per direction, so the ordering is defined
in exactly one place.

Hero → enemy (`resolveHeroDamage`):

```
raw                          (already includes crit multiplier and level heroDamageMultiplier)
  × meleePenalty             flying, when the hero's damageKind is melee
  × critVulnerability        fragile, when the hit was a critical
  × packResistance           swarm, from living packmate count
  × spreadResistance         boss, when targetsHit > 1
  → armor mitigation         100 / (100 + enemy.armor * 6)
  − plating                  armored, flat
  → max(1, round(...))
```

Enemy → hero (`resolveEnemyDamage`):

```
enemy.damage                 (already includes level enemyDamageMultiplier)
  × damageAmplifier          dangerous
  × packDamageBonus          swarm, from living packmate count
  → armor mitigation with pierce:  effectiveArmor = heroArmor * (1 - armorPierce)
  → max(1, round(...))
```

Shield absorption stays where it is, after `resolveEnemyDamage` returns.

## Architecture

New module `src/game/traits.ts`, pure and dependency-free apart from types:

- `traitRules: Record<EnemyTrait, TraitRule>` — a flat table of typed knobs.
  One table you can read top to bottom while balancing.
- `resolveHeroDamage(input): number` and `resolveEnemyDamage(input): number` —
  the two pipelines above.
- `describeTrait(trait): TraitDescription` — `{ label, summary }` for the UI, so
  rule text is authored next to the rule it describes and cannot drift from it.
- `enemyPlating(traits): number` — base plating for a trait set, used by
  `buildEnemySpawns` to resolve the scaled value.

`TraitRule` is a flat interface of optional knobs (`meleePenalty`, `plating`,
`critVulnerability`, `armorPierce`, `damageAmplifier`, `spreadResistance`,
`pack`), not a discriminated-union effect list. Nine fixed traits do not need
dispatch machinery, and a flat table is easier to balance-read than a fold over
effect variants.

Changes to existing modules:

- `types.ts` — add `TraitRule`, `TraitDescription`; add `plating: number` to
  `CombatEnemy`; add a `traitEffect` variant to `CombatEvent`.
- `simulateCombat.ts` — its three hero-damage sites (basic attack, ability
  damage, summon tick) and its one enemy-damage site funnel through the
  resolvers. `getTargetDamageMultiplier` and the scattered `mitigateDamage`
  calls are deleted; `mitigateDamage` moves into `traits.ts` as an internal
  helper. `buildEnemySpawns` resolves scaled plating. A living-swarm-count
  helper sits next to `livingEnemies()`. Net effect on file size is close to
  neutral: four call sites collapse into two function calls.
- `content.ts` — enemy stat re-tune (below).
- `levels.ts` — strip the `heroDamageMultipliers` that traits now replace,
  re-tune the multipliers that remain, add boss adds, rewrite `notes`.
- `App.tsx` + `styles.css` — pre-combat roster panel, trait lines in the combat
  log.

## Legibility

**Pre-combat roster panel.** Derived from `currentLevel.enemyWaves` → enemy
definitions → traits → `describeTrait`. Shows each distinct enemy in the level
with its count, its trait tags, and one line per trait explaining the rule. This
replaces the counterplay claims currently hand-written into `notes`; `notes`
keeps only genuine level flavour (level kind, reward character), so the same
sentence can never contradict the table.

**Combat log feedback.** A new `traitEffect` event fires the first time a given
trait materially changes a hit for a given enemy — at most once per enemy per
trait per fight, which keeps it deterministic and bounded (roughly one event per
spawned enemy). Rendered in the existing combat log alongside attacks and
deaths: "Grave Brute's plating blunted the hit", "Spell Wisp pierced your
armor", "Rot Imp is emboldened by its pack". This is what turns a loss into a
diagnosis.

The log filter in `App.tsx` gains `traitEffect`; the replay renderer ignores it.

## Balance

The existing enemy stats and level multipliers were tuned on the assumption that
traits do nothing, so both need re-tuning. The intent is to hold each level near
its current difficulty while redistributing that difficulty across build shapes.

Enemy stat changes in `content.ts`:

- Armored enemies' raw `armor` comes down now that plating carries the identity:
  `graveBrute` 9 → 6, `shieldBearer` 18 → 12, `gateTitan` 18 → 14. Without
  this, plating stacks on top of already-high mitigation and armored enemies
  become walls for anything but a crit build.
- `glassCultist` base `damage` 7 → 4, because `dangerous` now doubles it.
- `spellWisp` base `damage` 9 → 5, because 70% of the hero's armor no longer
  applies to it.
- `rotImp` base `damage` 3 → 2, because pack scaling adds up to +60% on top.

These starting values are the implementer's first guess, to be moved as the
guardrail tests demand — but they are the numbers to start from, not an
invitation to re-derive the whole table.

Level changes in `levels.ts`:

- Remove `heroDamageMultipliers` from Grave March, Shield Line, Rot Tide,
  Lantern Storm and Glass Knives — traits now do that work, keyed to build
  rather than class.
- **Broken Wings keeps its multipliers.** `flying` is the one trait that is
  genuinely class-keyed (a melee weapon cannot reach a flyer), so a damage-kind
  multiplier is the honest model there, and the existing melee-vs-flying test
  depends on it.
- Re-tune the `enemyDamageMultiplier` values that now compound with a trait —
  Glass Knives' `1.25 + levelNumber * 0.035` and Lantern Storm's
  `1.45 + levelNumber * 0.035` in particular, both of which now sit on top of a
  trait that roughly doubles effective incoming damage.
- **Boss levels gain a small add wave** (existing `skeleton` and `rotImp`), so
  spread resistance has something to bite on and a boss fight becomes a real
  focus-vs-clear decision instead of a single damage-race. `enemyHealthMultiplier`
  comes down to pay for the adds. This is a level-composition change using
  existing enemies, not new content.

Level 1 is unaffected by design: it is all `skeleton`, which is `["ground"]` and
has no trait rules.

Final level-multiplier numbers are the implementer's job, driven by the guardrail
tests below rather than fixed here — a spec cannot pin balance values it has not
run. The trait knob values in the mechanics table, by contrast, *are* fixed
here: they define what each trait means, and changing them changes the design
rather than the tuning.

## Testing

New `src/game/traits.test.ts` — unit tests over the pure resolvers:

- Each knob in isolation: plating subtracts after armor; armor pierce reduces
  effective armor; crit vulnerability applies only on crits; melee penalty
  applies only to melee; spread resistance applies only when `targetsHit > 1`;
  pack scaling scales with count and clamps at the cap.
- Combined traits (a flying caster, a fragile swarm member) resolve in the
  documented order.
- **No rule can zero out damage**: extreme plating and stacked resistances
  still return at least 1.
- A trait with no rules (`ground`, `bonus`) is a no-op.

`src/game/simulateCombat.test.ts` — guardrails:

- Existing tests keep passing unchanged: level 1 winnable by all five classes
  with 30 enemies defeated, deterministic timelines, melee-vs-flying fallback.
- **Counterplay exists**: on an armored level, two heroes built from the same
  total stat budget — one fast-and-weak, one slow-and-hard — produce
  measurably different outcomes, with the big-hit build ahead.
- **Counterplay is recoverable**: a hero that loses an armored level wins it
  after shifting allocation toward damage per hit, without a raw power
  increase. This is the test that distinguishes "sharp" from "hard wall", and
  it is the one that must not be weakened to make balancing easier.
- **Swarm rewards multi-target**: on a swarm level, a hero with a multi-target
  damage ability clears more than the same hero with an equivalent
  single-target ability.
- **Caster punishes armor stacking**: a high-armor hero takes materially more
  damage from casters than its armor value would predict.
- `traitEffect` events are emitted at most once per enemy per trait.

Balance harness (`src/game/balance.ts`, a test, not a manual step): balance is
measured as **required gear power** — the smallest uniform multiplier on health,
damage, armor and ability power at which a build clears a level. A win/loss
matrix at base stats was tried first and rejected: the campaign assumes gear, so
at base stats levels 4, 7, 8, 11 and 12 are unwinnable by every class and the
metric carries no information past level 3.

The measured pre-change baseline lives in
`docs/superpowers/plans/2026-07-30-trait-balance-baseline.md`. It establishes
that three of the current `heroDamageMultipliers` point the wrong way: armored
levels favour chip damage over big hits (Shield Line: fast-weak 2.40× vs
slow-heavy 4.25×), armor is the better answer to casters than health (Lantern
Storm: 2.55× vs 2.80×), and Rot Tide is the Arcanist's worst level in the
campaign at 4.00× despite handing magic a 1.2× bonus and advertising "Area
damage favored". Those three inversions are the re-tune's targets, and the
guardrails also cap per-level spread (worst class within 2× the median) and
forbid difficulty inflation (median within 20% of baseline).

## Verification

Browser-driven per the project verify skill: seed `tbd-defense:campaign` to
reach a Grave March level and a Rot Tide level, confirm the roster panel renders
trait rules for the right enemies, run the fight, and confirm trait lines appear
in the combat log. Screenshot both.

## Decisions Taken Without the User

The user was away during the second half of this design and authorised
recommendations to stand. Four calls were made:

1. **Boss levels gain adds.** Without them, spread resistance is inert, since a
   lone boss can never be hit by a multi-target attack that struck more than one
   enemy. Reversible by deleting the add wave.
2. **Plating scales with `enemyHealthMultiplier`.** A flat 9 would be
   meaningless by level 30 against geared heroes.
3. **Broken Wings keeps its `heroDamageMultipliers`** while the other five
   archetypes lose theirs, because `flying` is legitimately class-keyed.
4. **No post-combat trait summary panel.** The combat log covers diagnosis;
   a second surface for the same information is not worth the code.
