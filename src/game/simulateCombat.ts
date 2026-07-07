import { enemies } from "./content";
import { createSeededRandom } from "./random";
import type { CombatEnemy, CombatEvent, CombatResult, HeroClass, LevelDefinition } from "./types";

const HERO_ATTACK_WINDUP = 0.16;
const ENEMY_REACH_TIME = 4.2;

export function simulateCombat(heroClass: HeroClass, level: LevelDefinition): CombatResult {
  const random = createSeededRandom(level.seed + heroClass.id.length * 97);
  const events: CombatEvent[] = [];
  const enemiesToSpawn = buildEnemySpawns(level);
  const activeEnemies: CombatEnemy[] = [];
  const defeated = new Set<string>();
  const nextEnemyAttack = new Map<string, number>();
  let spawnIndex = 0;
  let heroHealth = heroClass.stats.health;
  let nextHeroAttack = 0.6;
  let heroAttackCount = 0;
  let xp = 0;
  let gold = 0;
  let time = 0;

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

    for (const enemy of activeEnemies) {
      if (enemy.health <= 0) {
        continue;
      }

      const nextAttack = nextEnemyAttack.get(enemy.id) ?? enemy.spawnTime + ENEMY_REACH_TIME;
      const attackCadence = 1 / enemy.attackSpeed;
      const shouldAttack = time >= nextAttack;

      if (shouldAttack) {
        nextEnemyAttack.set(enemy.id, nextAttack + attackCadence);
        const damage = mitigateDamage(enemy.damage, heroClass.stats.armor);
        heroHealth = Math.max(0, heroHealth - damage);
        events.push({
          type: "heroHit",
          time: roundTime(time),
          sourceId: enemy.id,
          damage,
        });

        if (heroHealth <= 0) {
          events.push({ type: "heroDefeated", time: roundTime(time) });
          return finishResult(heroClass, level, false, time, heroHealth, defeated.size, xp, gold, events);
        }
      }
    }

    if (time >= nextHeroAttack) {
      const livingEnemies = activeEnemies.filter((enemy) => enemy.health > 0);

      if (livingEnemies.length > 0) {
        heroAttackCount += 1;
        const isSpecial = heroAttackCount % heroClass.special.everyNthAttack === 0;
        const targetCount = isSpecial ? heroClass.special.cleaveTargets : 1;
        const targets = livingEnemies
          .sort((a, b) => a.spawnTime - b.spawnTime)
          .slice(0, Math.min(targetCount, livingEnemies.length));
        const critical = random() < heroClass.stats.critChance;
        const baseDamage = heroClass.stats.damage + heroClass.stats.abilityPower * 0.55;
        const multiplier = (critical ? heroClass.stats.critDamage : 1) * (isSpecial ? heroClass.special.damageMultiplier : 1);
        const levelDamageMultiplier = level.combat.heroDamageMultipliers[heroClass.damageKind] ?? 1;
        const rawDamage = Math.round(baseDamage * multiplier * levelDamageMultiplier);
        const targetIds: string[] = [];
        let dealtDamage = 0;

        for (const target of targets) {
          const damage = mitigateDamage(Math.round(rawDamage * getTargetDamageMultiplier(heroClass, target)), target.armor);
          target.health = Math.max(0, target.health - damage);
          dealtDamage = damage;
          targetIds.push(target.id);

          events.push({
            type: "projectile",
            time: roundTime(Math.max(0, time - HERO_ATTACK_WINDUP)),
            sourceId: "hero",
            targetId: target.id,
            damageKind: heroClass.damageKind,
          });

          if (target.health <= 0 && !defeated.has(target.id)) {
            defeated.add(target.id);
            xp += target.rewardXp;
            gold += target.rewardGold;
            events.push({ type: "death", time: roundTime(time + 0.08), enemyId: target.id });
          }
        }

        events.push({
          type: "attack",
          time: roundTime(time),
          sourceId: "hero",
          targetIds,
          damage: dealtDamage,
          critical,
          damageKind: heroClass.damageKind,
          label: isSpecial ? heroClass.special.name : basicAttackLabel(heroClass.damageKind),
        });
      }

      nextHeroAttack = time + 1 / (heroClass.stats.attackSpeed * (1 + heroClass.stats.cooldownReduction));
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

function mitigateDamage(rawDamage: number, armor: number): number {
  const armorMultiplier = 100 / (100 + armor * 6);
  return Math.max(1, Math.round(rawDamage * armorMultiplier));
}

function getTargetDamageMultiplier(heroClass: HeroClass, enemy: CombatEnemy): number {
  if (heroClass.damageKind === "melee" && enemy.traits.includes("flying")) {
    return 0.38;
  }

  return 1;
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
