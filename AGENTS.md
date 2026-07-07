# TBDDefense Agent Settings

## Project Intent

Build a browser-first hero/tower-defense inspired game with passive combat, RPG progression, loot, classes, stats, talents, currency, levels, and eventually competitive leaderboards.

The initial game loop:

1. Player selects a hero class.
2. Player enters level 1, which should be effectively impossible to lose.
3. Monsters attack the hero in waves or continuous encounters.
4. The fight is simulated automatically from deterministic stats and random seeds, then presented as a non-interactive 3D combat replay/spectator scene.
5. Player decisions happen between levels through upgrades, talents, gear, loot chests, and economy choices.
6. Completing levels grants experience, money, and loot. Progression unlocks harder levels and more build variety.

## Agent Autonomy

The user grants broad permission to create, edit, reorganize, and delete files inside this project when needed to move the game forward. Prefer direct implementation over asking for permission unless a decision is destructive, expensive, external-account related, or hard to reverse.

Stay pragmatic:

- Favor simple playable milestones over premature architecture.
- Keep systems data-driven so classes, enemies, loot tables, levels, and talents can expand without rewriting core combat.
- Add tests where logic is shared, deterministic, or likely to regress.
- Do not add multiplayer complexity until the single-player loop is fun and stable.
- Treat browser support as a core requirement.

## Recommended Stack

Use TypeScript as the main language.

Recommended initial stack:

- Runtime/build: Vite
- 3D renderer: Three.js through React Three Fiber
- UI shell: React for menus, inventory, talents, shop, profile, settings, rewards, and leaderboard screens
- Styling: CSS modules or scoped plain CSS first; consider Tailwind later only if UI scale justifies it
- State: small TypeScript domain modules first; add Zustand only when cross-screen state becomes cumbersome
- Persistence phase 1: local save in browser storage
- Persistence phase 2: Supabase for auth, cloud saves, all-time leaderboard, and seasonal leaderboard
- Testing: Vitest for progression, combat math, loot generation, and economy calculations
- Visual verification: browser screenshots when UI/gameplay screens are added

Why this stack:

- Three.js is a mature browser 3D rendering library with WebGL support.
- React Three Fiber lets the project use Three.js inside a React/Vite app without separating the game view from the rest of the UI.
- Vite gives a fast TypeScript web development loop and simple production builds.
- Pure TypeScript simulation keeps combat results testable, replayable, and separate from visuals.
- Supabase is a good later fit for Postgres-backed leaderboard data, authentication, and server-side validation without building a custom backend immediately.

Avoid for now:

- Unity or Godot exports, because this project is explicitly browser-first and should iterate quickly in web tooling.
- Phaser as the primary combat layer, because the intended combat presentation is 3D rather than 2D.
- Full server-authoritative multiplayer, because the core loop does not require it.
- Heavy physics or ECS frameworks until the number of entities, animation needs, or simulation complexity proves the need.

## Combat Presentation

Combat should feel like a cool 3D spectator fight, not an interactive action game.

Architecture:

- Pre-combat: build a combat input from hero stats, gear, talents, level definition, enemy waves, and a seeded RNG.
- Simulation: run combat in pure TypeScript and produce a timeline of events such as spawns, movement intents, attacks, casts, blocks, damage, deaths, summons, and win/loss.
- Replay: render that timeline in 3D with Three.js/React Three Fiber.
- Result: rewards and progression are based on the simulation result, not on frame rate, animations, or player input.

The user may be allowed to watch, speed up, skip, pause, or inspect the fight, but not influence the outcome once combat starts.

3D visual direction:

- Diorama-style arena with fixed or gently moving camera.
- Hero near the center or defending a point.
- Enemies path in from gates, portals, forest edges, cave mouths, or lanes depending on level theme.
- Attacks represented by readable animations, projectiles, spell effects, impact flashes, floating damage numbers, shields, summons, and death dissolves.
- Use simple primitives and generated placeholder assets first; upgrade to custom generated images/models later.
- Keep the first prototype visually clear before adding expensive effects.

## Initial Game Design

Hero classes should start with at least five archetypes:

- Berserker: attack-focused melee combat
- Arcanist: sorcery and area damage
- Ranger: ranged combat and precision attacks
- Summoner: minions, pets, and indirect scaling
- Guardian: defense-focused melee combat

Core stats should begin small:

- Health
- Armor
- Damage
- Attack speed
- Range
- Critical chance
- Critical damage
- Ability power
- Cooldown reduction
- Movement speed, only if positioning becomes relevant

Early progression systems:

- Hero level and experience
- Gold or similar currency
- Gear rarity tiers
- Loot chests after level completion
- Talent choices every few hero levels
- Level unlocks and difficulty scaling

Early combat rule:

- Combat should be deterministic enough to test.
- Randomness belongs in controlled systems such as crit rolls, drops, enemy modifiers, and chest rewards.
- Level 1 should teach the loop and be nearly impossible to fail.
- The 3D replay must never be the source of truth for combat results.

## Milestone Plan

Milestone 1: playable prototype

- Project scaffold
- Class select
- One 3D combat arena
- One hero class implemented first
- One enemy type
- Passive simulated attacks
- Timeline-driven 3D replay
- Win condition
- Basic rewards screen

Milestone 2: progression loop

- Five starter classes
- Hero XP and level-ups
- Gold
- Loot chest rewards
- Basic gear slots and stat modifiers
- Save/load locally

Milestone 3: build variety

- Talents
- Multiple enemy types
- Level modifiers
- Gear rarity and affixes
- Basic balancing tools or data files

Milestone 4: competitive layer

- Supabase project integration
- Optional auth
- Validated run submission
- All-time leaderboard
- Seasonal leaderboard
- Season reset workflow

## Content Authoring Preference

Store game content in typed data files when possible:

- Hero class definitions
- Enemy definitions
- Level definitions
- Loot tables
- Item affix pools
- Talent trees

Prefer editable data over hard-coded branching. Combat formulas can live in shared pure TypeScript modules so they are easy to test and balance.

## Working Notes

The project is currently new. If no package manager or framework files exist, scaffold with Vite, TypeScript, Phaser, and React only when implementation begins.
