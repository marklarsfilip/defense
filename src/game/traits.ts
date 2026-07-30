import type { EnemyTrait, TraitDescription, TraitRule } from "./types";

export const traitRules: Record<EnemyTrait, TraitRule> = {
  ground: {
    label: "Ground",
    summary: "No special defenses — whatever you brought works.",
  },
  flying: {
    label: "Flying",
    summary: "Airborne. Melee weapons only clip it: melee damage is cut to 38%.",
    logLine: "stayed out of melee reach",
    meleePenalty: 0.38,
  },
  fragile: {
    label: "Fragile",
    summary: "Thin-shelled. Critical hits deal 60% extra damage to it.",
    logLine: "was torn open by a critical hit",
    critVulnerability: 1.6,
  },
  armored: {
    label: "Armored",
    summary: "Plated. Every hit loses a flat chunk of damage after armor, so big hits punch through and fast weak hits barely scratch.",
    logLine: "blunted the hit with its plating",
    plating: 9,
  },
  caster: {
    label: "Caster",
    summary: "Its spellfire ignores 70% of your armor. Answer with health, shields, or a faster kill.",
    logLine: "pierced your armor with spellfire",
    armorPierce: 0.7,
  },
  dangerous: {
    label: "Dangerous",
    summary: "Every strike it lands hits for double damage.",
    logLine: "struck for double damage",
    damageAmplifier: 2,
  },
  swarm: {
    label: "Swarm",
    summary: "Emboldened in numbers: +10% damage and 6% damage resistance per nearby packmate, up to 6. Thin the pack fast.",
    logLine: "drew strength from its pack",
    pack: { damagePerAlly: 0.1, resistancePerAlly: 0.06, maxAllies: 6 },
  },
  boss: {
    label: "Boss",
    summary: "A massive single target. An attack that struck several enemies deals 40% less to it — sustained single-target damage wins.",
    logLine: "shed spread damage",
    spreadResistance: 0.6,
  },
  bonus: {
    label: "Bonus",
    summary: "A harmless treasure creature.",
  },
};

export function describeTrait(trait: EnemyTrait): TraitDescription {
  const rule = traitRules[trait];

  return { trait, label: rule.label, summary: rule.summary };
}

export function describeEnemyTraits(traits: EnemyTrait[]): TraitDescription[] {
  return traits.map(describeTrait);
}

export function hasTraitRule(trait: EnemyTrait): boolean {
  const rule = traitRules[trait];

  return (
    rule.meleePenalty !== undefined ||
    rule.critVulnerability !== undefined ||
    rule.plating !== undefined ||
    rule.spreadResistance !== undefined ||
    rule.armorPierce !== undefined ||
    rule.damageAmplifier !== undefined ||
    rule.pack !== undefined
  );
}

export function enemyPlating(traits: EnemyTrait[]): number {
  return traits.reduce((total, trait) => total + (traitRules[trait].plating ?? 0), 0);
}
