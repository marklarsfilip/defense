import { enemies } from "./content";
import { createSeededRandom } from "./random";
import {
  abilityDamagePerTarget,
  abilityShieldAmount,
  effectiveCooldown,
  summonDamagePerTick,
} from "./abilities";
import { enemyPlating, resolveEnemyDamage, resolveHeroDamage, traitRules } from "./traits";
import type { AbilityDefinition, CombatEnemy, CombatEvent, CombatResult, EnemyTrait, HeroClass, LevelDefinition } from "./types";

const HERO_ATTACK_WINDUP = 0.16;
const ENEMY_REACH_TIME = 4.2;
const ABILITY_WARMUP = 0.8;

interface ActiveBuff {
  attackSpeed: number;
  damage: number;
  expiresAt: number;
}

interface ActiveSummon {
  abilityId: string;
  perTick: number;
  interval: number;
  nextTick: number;
  expiresAt: number;
}

export function simulateCombat(heroClass: HeroClass, level: LevelDefinition): CombatResult {
  const random = createSeededRandom(level.seed + heroClass.id.length * 97);
  const events: CombatEvent[] = [];
  const enemiesToSpawn = buildEnemySpawns(level);
  const activeEnemies: CombatEnemy[] = [];
  const defeated = new Set<string>();
  const announcedTraits = new Set<string>();
  const nextEnemyAttack = new Map<string, number>();
  const nextAbilityReady = new Map<string, number>();
  for (const ability of heroClass.abilities) {
    nextAbilityReady.set(ability.id, ABILITY_WARMUP);
  }
  const activeBuffs: ActiveBuff[] = [];
  const activeSummons: ActiveSummon[] = [];
  let shield: { amount: number; expiresAt: number } | null = null;
  // Read `shield` through an accessor: TypeScript's control-flow analysis narrows a
  // `let` that is reassigned inside the nested fireAbility() closure to `never` at
  // same-scope reads, so a direct read (or plain const) fails to compile. Do not inline.
  function getShield(): { amount: number; expiresAt: number } | null {
    return shield;
  }
  let spawnIndex = 0;
  let heroHealth = heroClass.stats.health;
  let nextHeroAttack = 0.6;
  let xp = 0;
  let gold = 0;
  let time = 0;

  const levelDamageMultiplier = level.combat.heroDamageMultipliers[heroClass.damageKind] ?? 1;

  function livingEnemies(): CombatEnemy[] {
    return activeEnemies.filter((enemy) => enemy.health > 0);
  }

  // Pass the raw living swarm count (including the enemy being hit) — the resolvers
  // subtract 1 internally to get the ally count. Do not pre-subtract here.
  function livingSwarmCount(): number {
    let count = 0;
    for (const enemy of activeEnemies) {
      if (enemy.health > 0 && enemy.traits.includes("swarm")) {
        count += 1;
      }
    }
    return count;
  }

  function pickTargets(count: number): CombatEnemy[] {
    return livingEnemies()
      .sort((a, b) => a.spawnTime - b.spawnTime)
      .slice(0, Math.max(0, count));
  }

  function registerKill(target: CombatEnemy, at: number): void {
    if (target.health <= 0 && !defeated.has(target.id)) {
      defeated.add(target.id);
      xp += target.rewardXp;
      gold += target.rewardGold;
      events.push({ type: "death", time: roundTime(at + 0.08), enemyId: target.id });
    }
  }

  function noteTraitEffects(enemy: CombatEnemy, applied: EnemyTrait[], at: number): void {
    for (const trait of applied) {
      const key = `${enemy.id}:${trait}`;
      if (announcedTraits.has(key)) {
        continue;
      }
      const message = traitRules[trait].logLine;
      if (!message) {
        continue;
      }
      announcedTraits.add(key);
      events.push({
        type: "traitEffect",
        time: roundTime(at),
        enemyId: enemy.id,
        enemyName: enemy.name,
        trait,
        message,
      });
    }
  }

  function buffTotals(): { attackSpeed: number; damage: number } {
    let attackSpeed = 0;
    let damage = 0;
    for (const buff of activeBuffs) {
      if (time <= buff.expiresAt) {
        attackSpeed += buff.attackSpeed;
        damage += buff.damage;
      }
    }
    return { attackSpeed, damage };
  }

  function fireAbility(ability: AbilityDefinition): void {
    const effect = ability.effect;

    if (effect.kind === "damage") {
      const targets = pickTargets(effect.targets);
      const perTarget = abilityDamagePerTarget(effect, heroClass.stats.damage, heroClass.stats.abilityPower, levelDamageMultiplier);
      const swarmCount = livingSwarmCount();
      const targetIds: string[] = [];
      let lastDamage = 0;
      for (const target of targets) {
        const resolved = resolveHeroDamage({
          rawDamage: perTarget,
          traits: target.traits,
          armor: target.armor,
          plating: target.plating,
          damageKind: heroClass.damageKind,
          critical: false,
          targetsHit: targets.length,
          livingSwarmCount: swarmCount,
        });
        const damage = resolved.damage;
        target.health = Math.max(0, target.health - damage);
        noteTraitEffects(target, resolved.appliedTraits, time);
        lastDamage = damage;
        targetIds.push(target.id);
        events.push({
          type: "projectile",
          time: roundTime(Math.max(0, time - HERO_ATTACK_WINDUP)),
          sourceId: "hero",
          targetId: target.id,
          damageKind: heroClass.damageKind,
        });
        registerKill(target, time);
      }
      events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds });
      events.push({
        type: "attack",
        time: roundTime(time),
        sourceId: "hero",
        targetIds,
        damage: lastDamage,
        critical: false,
        damageKind: heroClass.damageKind,
        label: ability.name,
      });
      return;
    }

    if (effect.kind === "buff") {
      activeBuffs.push({
        attackSpeed: effect.modifiers.attackSpeed ?? 0,
        damage: effect.modifiers.damage ?? 0,
        expiresAt: time + effect.duration,
      });
      events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds: [] });
      events.push({ type: "buff", time: roundTime(time), abilityId: ability.id, label: ability.name, duration: effect.duration });
      return;
    }

    if (effect.kind === "shield") {
      const amount = abilityShieldAmount(effect, heroClass.stats.abilityPower);
      shield = { amount, expiresAt: time + effect.duration };
      events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds: [] });
      events.push({ type: "shield", time: roundTime(time), abilityId: ability.id, amount });
      return;
    }

    activeSummons.push({
      abilityId: ability.id,
      perTick: summonDamagePerTick(effect, heroClass.stats.abilityPower),
      interval: Math.max(0.05, effect.interval),
      nextTick: time + effect.interval,
      expiresAt: time + effect.duration,
    });
    events.push({ type: "abilityCast", time: roundTime(time), abilityId: ability.id, label: ability.name, targetIds: [] });
  }

  while (time <= level.durationLimit) {
    while (spawnIndex < enemiesToSpawn.length && enemiesToSpawn[spawnIndex].spawnTime <= time) {
      const enemy = enemiesToSpawn[spawnIndex];
      activeEnemies.push(enemy);
      nextEnemyAttack.set(enemy.id, enemy.spawnTime + ENEMY_REACH_TIME);
      events.push({
        type: "spawn",
        time: roundTime(enemy.spawnTime),
        enemyId: enemy.id,
        enemyName: enemy.name,
        gate: enemy.gate,
        maxHealth: enemy.maxHealth,
      });
      spawnIndex += 1;
    }

    const activeShield = getShield();
    if (activeShield && time > activeShield.expiresAt) {
      shield = null;
    }

    for (const enemy of activeEnemies) {
      if (enemy.health <= 0) {
        continue;
      }
      const nextAttack = nextEnemyAttack.get(enemy.id) ?? enemy.spawnTime + ENEMY_REACH_TIME;
      const attackCadence = 1 / enemy.attackSpeed;
      if (time >= nextAttack) {
        nextEnemyAttack.set(enemy.id, nextAttack + attackCadence);
        const resolved = resolveEnemyDamage({
          rawDamage: enemy.damage,
          traits: enemy.traits,
          heroArmor: heroClass.stats.armor,
          livingSwarmCount: livingSwarmCount(),
        });
        let damage = resolved.damage;
        const currentShield = getShield();
        if (currentShield && time <= currentShield.expiresAt && currentShield.amount > 0) {
          const absorbed = Math.min(currentShield.amount, damage);
          currentShield.amount -= absorbed;
          damage -= absorbed;
        }
        heroHealth = Math.max(0, heroHealth - damage);
        events.push({ type: "heroHit", time: roundTime(time), sourceId: enemy.id, damage });
        noteTraitEffects(enemy, resolved.appliedTraits, time);
        if (heroHealth <= 0) {
          events.push({ type: "heroDefeated", time: roundTime(time) });
          return finishResult(heroClass, level, false, time, heroHealth, defeated.size, xp, gold, events);
        }
      }
    }

    for (const summon of activeSummons) {
      while (time >= summon.nextTick && summon.nextTick <= summon.expiresAt) {
        const target = pickTargets(1)[0];
        if (!target) {
          summon.nextTick += summon.interval;
          continue;
        }
        const resolved = resolveHeroDamage({
          rawDamage: summon.perTick,
          traits: target.traits,
          armor: target.armor,
          plating: target.plating,
          damageKind: heroClass.damageKind,
          critical: false,
          targetsHit: 1,
          livingSwarmCount: livingSwarmCount(),
        });
        const damage = resolved.damage;
        target.health = Math.max(0, target.health - damage);
        events.push({ type: "summonTick", time: roundTime(time), abilityId: summon.abilityId, targetId: target.id, damage });
        noteTraitEffects(target, resolved.appliedTraits, time);
        registerKill(target, time);
        summon.nextTick += summon.interval;
      }
    }
    for (let i = activeSummons.length - 1; i >= 0; i -= 1) {
      if (time > activeSummons[i].expiresAt) {
        activeSummons.splice(i, 1);
      }
    }
    for (let i = activeBuffs.length - 1; i >= 0; i -= 1) {
      if (time > activeBuffs[i].expiresAt) {
        activeBuffs.splice(i, 1);
      }
    }

    for (const ability of heroClass.abilities) {
      const ready = nextAbilityReady.get(ability.id) ?? ABILITY_WARMUP;
      if (time < ready) {
        continue;
      }
      if (ability.effect.kind === "damage" && livingEnemies().length === 0) {
        continue;
      }
      fireAbility(ability);
      nextAbilityReady.set(ability.id, time + effectiveCooldown(ability, heroClass.stats.cooldownReduction));
    }

    if (time >= nextHeroAttack) {
      const target = pickTargets(1)[0];
      const buffs = buffTotals();
      if (target) {
        const critical = random() < heroClass.stats.critChance;
        const baseDamage = heroClass.stats.damage + buffs.damage + heroClass.stats.abilityPower * 0.55;
        const multiplier = critical ? heroClass.stats.critDamage : 1;
        const rawDamage = Math.round(baseDamage * multiplier * levelDamageMultiplier);
        const resolved = resolveHeroDamage({
          rawDamage: rawDamage,
          traits: target.traits,
          armor: target.armor,
          plating: target.plating,
          damageKind: heroClass.damageKind,
          critical,
          targetsHit: 1,
          livingSwarmCount: livingSwarmCount(),
        });
        const damage = resolved.damage;
        target.health = Math.max(0, target.health - damage);
        noteTraitEffects(target, resolved.appliedTraits, time);
        events.push({
          type: "projectile",
          time: roundTime(Math.max(0, time - HERO_ATTACK_WINDUP)),
          sourceId: "hero",
          targetId: target.id,
          damageKind: heroClass.damageKind,
        });
        events.push({
          type: "attack",
          time: roundTime(time),
          sourceId: "hero",
          targetIds: [target.id],
          damage,
          critical,
          damageKind: heroClass.damageKind,
          label: basicAttackLabel(heroClass.damageKind),
        });
        registerKill(target, time);
      }
      const effectiveAttackSpeed = heroClass.stats.attackSpeed + buffs.attackSpeed;
      nextHeroAttack = time + 1 / (effectiveAttackSpeed * (1 + heroClass.stats.cooldownReduction));
    }

    if (spawnIndex >= enemiesToSpawn.length && activeEnemies.every((enemy) => enemy.health <= 0)) {
      events.push({ type: "levelComplete", time: roundTime(time + 0.25), xp, gold });
      return finishResult(heroClass, level, true, time + 0.25, heroHealth, defeated.size, xp, gold, events);
    }

    time = roundTime(time + 0.05);
  }

  return finishResult(heroClass, level, false, level.durationLimit, heroHealth, defeated.size, xp, gold, events);
}

function buildEnemySpawns(level: LevelDefinition): CombatEnemy[] {
  const spawns: CombatEnemy[] = [];
  let index = 1;

  for (const wave of level.enemyWaves) {
    const definition = enemies[wave.enemyId];
    if (!definition) {
      throw new Error(`Unknown enemy definition: ${wave.enemyId}`);
    }

    for (let i = 0; i < wave.count; i += 1) {
      const spawnTime = wave.startsAt + i * wave.interval;
      const maxHealth = Math.round(definition.health * level.combat.enemyHealthMultiplier);

      spawns.push({
        id: `${definition.id}-${index}`,
        definitionId: definition.id,
        name: definition.name,
        traits: definition.traits,
        maxHealth,
        health: maxHealth,
        armor: definition.armor,
        plating: Math.round(enemyPlating(definition.traits) * level.combat.enemyHealthMultiplier),
        damage: Math.max(1, Math.round(definition.damage * level.combat.enemyDamageMultiplier)),
        attackSpeed: definition.attackSpeed,
        moveSpeed: definition.moveSpeed,
        rewardXp: Math.max(1, Math.round(definition.rewardXp * level.combat.rewardMultiplier)),
        rewardGold: Math.max(1, Math.round(definition.rewardGold * level.combat.rewardMultiplier)),
        gate: wave.gate,
        spawnTime,
      });
      index += 1;
    }
  }

  return spawns.sort((a, b) => a.spawnTime - b.spawnTime);
}

function basicAttackLabel(kind: HeroClass["damageKind"]): string {
  if (kind === "magic") {
    return "Spell bolt";
  }
  if (kind === "ranged") {
    return "Arrow shot";
  }
  if (kind === "summon") {
    return "Spirit strike";
  }
  return "Weapon strike";
}

function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}

function finishResult(
  heroClass: HeroClass,
  level: LevelDefinition,
  won: boolean,
  duration: number,
  heroHealthRemaining: number,
  enemiesDefeated: number,
  xp: number,
  gold: number,
  events: CombatEvent[],
): CombatResult {
  return {
    heroClass,
    level,
    won,
    duration: roundTime(duration),
    heroHealthRemaining: Math.round(heroHealthRemaining),
    enemiesDefeated,
    xp,
    gold,
    events,
  };
}
