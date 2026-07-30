import { useEffect, useMemo, useState } from "react";
import { Coins, Play, RotateCcw, Save, Sparkles, Trophy, Zap } from "lucide-react";
import { CombatReplay } from "./components/CombatReplay";
import { heroClasses } from "./game/content";
import { createBonusLevel, createCampaignLevel, shouldQueueBonusLevel } from "./game/levels";
import { applyEquipmentToHero, getActiveSetBonuses } from "./game/equipment";
import { rollShopStock, getRerollCost } from "./game/shop";
import { upgradeCost, rerollCost, canUpgrade } from "./game/upgrade";
import { applyAllocationToHero, ALLOCATABLE_STATS, getStatPointBudget, getAllocatedPointCount } from "./game/allocation";
import {
  allocateStat,
  applyCombatRewards,
  buyShopOffer,
  createInitialCampaign,
  deallocateStat,
  equipFromInventory,
  getExperienceForNextLevel,
  learnCampaignTalent,
  rerollShop,
  resetAllocation,
  restoreCampaign,
  rerollItemById,
  salvageItem,
  selectCampaignClass,
  unequipToInventory,
  upgradeItemById,
  type CampaignState,
} from "./game/progression";
import { formatModifierValue, generateChestReward } from "./game/loot";
import { simulateCombat } from "./game/simulateCombat";
import { applyTalentsToHero, getAvailableTalents, getSelectedTalents, getTalentPointBudget } from "./game/talents";
import type { ChestReward, CombatResult, EquipmentSlot, StatKey } from "./game/types";

const SAVE_KEY = "tbd-defense:campaign";

export function App() {
  const [campaign, setCampaign] = useState<CampaignState>(() => loadCampaign());
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [lastChestReward, setLastChestReward] = useState<ChestReward | null>(null);
  const [runId, setRunId] = useState(0);
  const selectedClass = useMemo(
    () => heroClasses.find((heroClass) => heroClass.id === campaign.selectedClassId) ?? heroClasses[0],
    [campaign.selectedClassId],
  );
  const effectiveHero = useMemo(
    () =>
      applyEquipmentToHero(
        applyAllocationToHero(applyTalentsToHero(selectedClass, campaign.selectedTalentIds), campaign.statAllocation),
        campaign.equipment,
      ),
    [selectedClass, campaign.selectedTalentIds, campaign.statAllocation, campaign.equipment],
  );
  const shopOffers = useMemo(
    () => rollShopStock(campaign.heroLevel, campaign.shopRerolls),
    [campaign.heroLevel, campaign.shopRerolls],
  );
  const shopRerollCost = getRerollCost(campaign.shopRerolls);
  const talentPointBudget = getTalentPointBudget(campaign.heroLevel);
  const availableTalents = getAvailableTalents(campaign.heroLevel, campaign.selectedClassId, campaign.selectedTalentIds);
  const selectedTalents = getSelectedTalents(campaign.selectedTalentIds);
  const currentLevel = useMemo(
    () =>
      campaign.queuedBonusLevelAfter
        ? createBonusLevel(campaign.queuedBonusLevelAfter)
        : createCampaignLevel(campaign.nextLevelNumber),
    [campaign.nextLevelNumber, campaign.queuedBonusLevelAfter],
  );
  const experienceForNextLevel = getExperienceForNextLevel(campaign.heroLevel);
  const experienceProgress =
    experienceForNextLevel > 0 ? Math.min(100, Math.round((campaign.experience / experienceForNextLevel) * 100)) : 100;
  const currentLevelCompleted = campaign.completedLevelIds.includes(currentLevel.id);
  const statBudget = getStatPointBudget(campaign.heroLevel);
  const pointsSpent = getAllocatedPointCount(campaign.statAllocation);
  const pointsRemaining = statBudget - pointsSpent;
  const activeSetBonuses = useMemo(() => getActiveSetBonuses(campaign.equipment), [campaign.equipment]);

  useEffect(() => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(campaign));
  }, [campaign]);

  function startLevel() {
    const result = simulateCombat(effectiveHero, currentLevel);
    const chestReward = result.won ? generateChestReward(effectiveHero, currentLevel, campaign.chestsOpened) : null;
    const queuedBonusLevelAfter =
      result.won && currentLevel.kind !== "bonus" && shouldQueueBonusLevel(currentLevel.levelNumber, campaign.victories)
        ? currentLevel.levelNumber
        : null;

    setCombatResult(result);
    setLastChestReward(chestReward);
    setCampaign((current) => applyCombatRewards(current, result, chestReward ?? undefined, queuedBonusLevelAfter));
    setRunId((current) => current + 1);
  }

  function replayLevel() {
    setRunId((current) => current + 1);
  }

  function selectClass(heroClassId: CampaignState["selectedClassId"]) {
    setCampaign((current) => selectCampaignClass(current, heroClassId));
    setCombatResult(null);
    setLastChestReward(null);
  }

  function resetProgress() {
    setCampaign(createInitialCampaign());
    setCombatResult(null);
    setLastChestReward(null);
    setRunId((current) => current + 1);
  }

  function learnTalent(talentId: string) {
    setCampaign((current) => learnCampaignTalent(current, talentId));
  }

  function equip(itemId: string) {
    setCampaign((current) => equipFromInventory(current, itemId));
  }

  function unequip(slot: EquipmentSlot) {
    setCampaign((current) => unequipToInventory(current, slot));
  }

  function salvage(itemId: string) {
    setCampaign((current) => salvageItem(current, itemId));
  }

  function upgradeItemAction(itemId: string) {
    setCampaign((current) => upgradeItemById(current, itemId));
  }
  function rerollItemAction(itemId: string) {
    setCampaign((current) => rerollItemById(current, itemId));
  }

  function buy(offer: (typeof shopOffers)[number]) {
    setCampaign((current) => buyShopOffer(current, offer));
  }

  function reroll() {
    setCampaign((current) => rerollShop(current));
  }

  function addPoint(stat: (typeof ALLOCATABLE_STATS)[number]) {
    setCampaign((current) => allocateStat(current, stat));
  }
  function removePoint(stat: (typeof ALLOCATABLE_STATS)[number]) {
    setCampaign((current) => deallocateStat(current, stat));
  }
  function resetPoints() {
    setCampaign((current) => resetAllocation(current));
  }

  function itemUpgradeControls(item: (typeof campaign.inventory)[number]) {
    return (
      <div className="item-actions">
        <button
          disabled={!canUpgrade(item) || campaign.gold < upgradeCost(item)}
          onClick={() => upgradeItemAction(item.id)}
          type="button"
        >
          {canUpgrade(item) ? `Upgrade (${upgradeCost(item)}g)` : "Max"}
        </button>
        <button disabled={campaign.gold < rerollCost(item)} onClick={() => rerollItemAction(item.id)} type="button">
          Reroll ({rerollCost(item)}g)
        </button>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="Game status">
        <div>
          <p className="eyebrow">TBD Defense prototype</p>
          <h1>{currentLevel.subtitle}</h1>
        </div>
        <div className="resource-strip" aria-label="Prototype resources">
          <span>
            <Sparkles size={16} />
            Hero level {campaign.heroLevel}
          </span>
          <span>
            <Coins size={16} />
            {campaign.gold} gold
          </span>
          <span>
            <Trophy size={16} />
            {currentLevel.kind === "bonus" ? "Bonus level" : `${campaign.victories} victories`}
          </span>
          <span>
            <Save size={16} />
            {campaign.inventory.length} items
          </span>
        </div>
      </section>

      <section className="game-layout">
        <aside className="panel class-panel" aria-label="Hero classes">
          <div className="panel-heading">
            <p className="eyebrow">Choose class</p>
            <h2>Hero roster</h2>
          </div>

          <div className="class-list">
            {heroClasses.map((heroClass) => (
              <button
                className={`class-card ${campaign.selectedClassId === heroClass.id ? "selected" : ""}`}
                key={heroClass.id}
                onClick={() => selectClass(heroClass.id)}
                style={{ "--accent": heroClass.color } as React.CSSProperties}
                type="button"
              >
                <span className="class-orb" />
                <span>
                  <strong>{heroClass.name}</strong>
                  <small>{heroClass.combatStyle}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="hero-detail">
            <p className="eyebrow">Current build</p>
            <h3>{selectedClass.name}</h3>
            <p>{selectedClass.fantasy}</p>
            <dl>
              <div>
                <dt>Damage</dt>
                <dd>{effectiveHero.stats.damage}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{effectiveHero.stats.attackSpeed.toFixed(2)}/s</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>{effectiveHero.stats.health}</dd>
              </div>
              <div>
                <dt>Ability</dt>
                <dd>{selectedClass.abilities.map((ability) => ability.name).join(", ")}</dd>
              </div>
            </dl>
          </div>

          <div className="progress-panel" aria-label="Campaign progression">
            <div className="progress-row">
              <span>XP</span>
              <strong>
                {experienceForNextLevel > 0
                  ? `${campaign.experience} / ${experienceForNextLevel}`
                  : "Max level"}
              </strong>
            </div>
            <div className="progress-track">
              <div style={{ width: `${experienceProgress}%` }} />
            </div>
            <div className="progress-row">
              <span>{currentLevel.name}</span>
              <strong>{currentLevelCompleted ? "Cleared" : currentLevel.kind}</strong>
            </div>
          </div>

          <div className="level-notes" aria-label="Level traits">
            {currentLevel.notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>

          <div className="talent-panel" aria-label="Talents">
            <div className="progress-row">
              <span>Talents</span>
              <strong>
                {campaign.selectedTalentIds.length} / {talentPointBudget}
              </strong>
            </div>
            {selectedTalents.length > 0 ? (
              <div className="learned-talents">
                {selectedTalents.map((talent) => (
                  <span key={talent.id}>{talent.name}</span>
                ))}
              </div>
            ) : null}
            <div className="talent-list">
              {availableTalents.slice(0, 3).map((talent) => (
                <button
                  disabled={campaign.selectedTalentIds.length >= talentPointBudget}
                  key={talent.id}
                  onClick={() => learnTalent(talent.id)}
                  type="button"
                >
                  <strong>{talent.name}</strong>
                  <span>{talent.description}</span>
                </button>
              ))}
              {availableTalents.length === 0 ? <p>No talent choices unlocked yet.</p> : null}
            </div>
          </div>

          <div className="allocation-panel" aria-label="Stat points">
            <div className="progress-row">
              <span>Stat points</span>
              <strong>{pointsRemaining} left</strong>
            </div>
            <div className="allocation-list">
              {ALLOCATABLE_STATS.map((stat) => (
                <div className="allocation-row" key={stat}>
                  <span>{stat}</span>
                  <div className="allocation-controls">
                    <button disabled={campaign.statAllocation[stat] <= 0} onClick={() => removePoint(stat)} type="button">
                      −
                    </button>
                    <strong>{campaign.statAllocation[stat]}</strong>
                    <button disabled={pointsRemaining <= 0} onClick={() => addPoint(stat)} type="button">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {pointsSpent > 0 ? (
              <button className="text-action" onClick={resetPoints} type="button">
                Reset points
              </button>
            ) : null}
          </div>

          <button className="primary-action" onClick={startLevel} type="button">
            <Play size={18} />
            Start {currentLevel.name}
          </button>
          <button className="text-action" onClick={resetProgress} type="button">
            Reset local progress
          </button>
        </aside>

        <section className="combat-stage" aria-label="3D combat replay">
          <CombatReplay key={runId} heroClass={effectiveHero} result={combatResult} />
        </section>

        <aside className="panel result-panel" aria-label="Combat result">
          <div className="panel-heading">
            <p className="eyebrow">Level report</p>
            <h2>{combatResult ? (combatResult.won ? "Victory" : "Defeat") : "Ready"}</h2>
          </div>

          {combatResult ? (
            <>
              <div className="result-grid">
                <div>
                  <span>Enemies</span>
                  <strong>{combatResult.enemiesDefeated}</strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>{combatResult.duration.toFixed(1)}s</strong>
                </div>
                <div>
                  <span>XP</span>
                  <strong>{combatResult.xp}</strong>
                </div>
                <div>
                  <span>Gold</span>
                  <strong>{combatResult.gold}</strong>
                </div>
              </div>

              <div className="loot-box">
                <Zap size={18} />
                <div>
                  <strong>{combatResult.won ? "Rewards banked" : "No reward"}</strong>
                  <span>
                    {combatResult.won
                      ? "XP, gold, chest bonus, and loot were saved locally."
                      : "Defeats can be replayed without changing progression."}
                  </span>
                </div>
              </div>

              {lastChestReward ? (
                <div
                  className={`loot-card rarity-${lastChestReward.item.rarity}`}
                  style={{ "--rarity": getRarityColor(lastChestReward.item.rarity) } as React.CSSProperties}
                >
                  <div className="loot-card-heading">
                    <span>{formatRarity(lastChestReward.item.rarity)}</span>
                    <strong>{lastChestReward.item.name}</strong>
                  </div>
                  <div className="loot-meta">
                    <span>{lastChestReward.item.slot}</span>
                    <span>Item level {lastChestReward.item.itemLevel}</span>
                    <span>+{lastChestReward.goldBonus} gold</span>
                  </div>
                  {lastChestReward.item.setName ? <p className="set-name">{lastChestReward.item.setName}</p> : null}
                  <ul>
                    {lastChestReward.item.modifiers.map((modifier) => (
                      <li key={`${lastChestReward.item.id}-${modifier.stat}`}>{modifier.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button className="secondary-action" onClick={replayLevel} type="button">
                <RotateCcw size={17} />
                Watch replay again
              </button>
            </>
          ) : (
            <div className="empty-report">
              <p>
                Pick a class and start the level. The result will be simulated first, then rendered as a 3D
                spectator fight.
              </p>
              <p>Boss levels appear every 10 levels. Rare bonus pastures can appear between normal levels.</p>
            </div>
          )}

          <div className="combat-log">
            <p className="eyebrow">Recent events</p>
            <ol>
              {(combatResult?.events ?? [])
                .filter(
                  (event) =>
                    event.type === "attack" ||
                    event.type === "death" ||
                    event.type === "levelComplete" ||
                    event.type === "abilityCast" ||
                    event.type === "traitEffect",
                )
                .slice(-7)
                .map((event, index) => (
                  <li key={`${event.type}-${event.time}-${index}`}>
                    <span>{event.time.toFixed(1)}s</span>
                    {event.type === "attack" && `${event.label} hit ${event.targetIds.length} target(s)`}
                    {event.type === "death" && `${event.enemyId} collapsed`}
                    {event.type === "levelComplete" && `Level complete: ${event.gold} gold`}
                    {event.type === "abilityCast" && `Cast ${event.label}`}
                    {event.type === "traitEffect" && `${event.enemyName} ${event.message}`}
                  </li>
                ))}
            </ol>
          </div>
        </aside>
      </section>

      <section className="outfitting" aria-label="Gear and economy">
        <aside className="panel gear-panel" aria-label="Equipment">
          <div className="panel-heading">
            <p className="eyebrow">Loadout</p>
            <h2>Equipment</h2>
          </div>
          <div className="equip-slots">
            {(["weapon", "armor", "trinket"] as const).map((slot) => {
              const item = campaign.equipment[slot];
              return (
                <div className="equip-slot" key={slot}>
                  <span className="slot-label">{slot}</span>
                  {item ? (
                    <div className="slot-item" style={{ "--rarity": getRarityColor(item.rarity) } as React.CSSProperties}>
                      <strong>{item.name}</strong>
                      <ul>
                        {item.modifiers.map((modifier) => (
                          <li key={`${item.id}-${modifier.stat}`}>{modifier.label}</li>
                        ))}
                      </ul>
                      {item.upgradeLevel ? <span className="upgrade-badge">+{item.upgradeLevel}</span> : null}
                      {itemUpgradeControls(item)}
                      <button className="text-action" onClick={() => unequip(slot)} type="button">
                        Unequip
                      </button>
                    </div>
                  ) : (
                    <span className="slot-empty">Empty</span>
                  )}
                </div>
              );
            })}
          </div>

          {activeSetBonuses.length > 0 ? (
            <div className="set-bonuses" aria-label="Active set bonuses">
              <p className="eyebrow">Set bonuses</p>
              {activeSetBonuses.map((bonus) => (
                <div className="set-bonus-row" key={bonus.setId}>
                  <strong>{bonus.setName}</strong>
                  <span>
                    {bonus.pieces}-piece bonus:{" "}
                    {Object.entries(bonus.modifiers)
                      .map(([stat, value]) => formatModifierValue(stat as StatKey, value as number))
                      .join(", ")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <aside className="panel inventory-panel" aria-label="Inventory">
          <div className="panel-heading">
            <p className="eyebrow">Backpack</p>
            <h2>Inventory ({campaign.inventory.length})</h2>
          </div>
          <div className="inventory-list">
            {campaign.inventory.length === 0 ? <p>No unequipped items.</p> : null}
            {campaign.inventory.map((item) => (
              <div
                className={`inventory-item rarity-${item.rarity}`}
                key={item.id}
                style={{ "--rarity": getRarityColor(item.rarity) } as React.CSSProperties}
              >
                <div className="loot-card-heading">
                  <span>{formatRarity(item.rarity)}</span>
                  <strong>{item.name}</strong>
                </div>
                <div className="loot-meta">
                  <span>{item.slot}</span>
                  <span>Item level {item.itemLevel}</span>
                </div>
                <ul>
                  {item.modifiers.map((modifier) => (
                    <li key={`${item.id}-${modifier.stat}`}>{modifier.label}</li>
                  ))}
                </ul>
                {item.upgradeLevel ? <span className="upgrade-badge">+{item.upgradeLevel}</span> : null}
                {itemUpgradeControls(item)}
                <div className="inventory-actions">
                  <button className="secondary-action" onClick={() => equip(item.id)} type="button">
                    Equip
                  </button>
                  <button className="text-action" onClick={() => salvage(item.id)} type="button">
                    Salvage
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <aside className="panel shop-panel" aria-label="Shop">
          <div className="panel-heading">
            <p className="eyebrow">Merchant</p>
            <h2>Shop</h2>
          </div>
          <button
            className="secondary-action"
            disabled={campaign.gold < shopRerollCost}
            onClick={reroll}
            type="button"
          >
            Reroll stock ({shopRerollCost} gold)
          </button>
          <div className="shop-list">
            {shopOffers.map((offer) => (
              <div
                className={`shop-offer rarity-${offer.item.rarity}`}
                key={offer.item.id}
                style={{ "--rarity": getRarityColor(offer.item.rarity) } as React.CSSProperties}
              >
                <div className="loot-card-heading">
                  <span>{formatRarity(offer.item.rarity)}</span>
                  <strong>{offer.item.name}</strong>
                </div>
                <div className="loot-meta">
                  <span>{offer.item.slot}</span>
                  <span>Item level {offer.item.itemLevel}</span>
                </div>
                <ul>
                  {offer.item.modifiers.map((modifier) => (
                    <li key={`${offer.item.id}-${modifier.stat}`}>{modifier.label}</li>
                  ))}
                </ul>
                <button
                  className="secondary-action"
                  disabled={campaign.gold < offer.price}
                  onClick={() => buy(offer)}
                  type="button"
                >
                  Buy ({offer.price} gold)
                </button>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function loadCampaign(): CampaignState {
  try {
    const saved = window.localStorage.getItem(SAVE_KEY);

    return restoreCampaign(saved ? JSON.parse(saved) : null);
  } catch {
    return createInitialCampaign();
  }
}

function formatRarity(rarity: ChestReward["item"]["rarity"]): string {
  if (rarity === "set") {
    return "Set piece";
  }

  return rarity[0].toUpperCase() + rarity.slice(1);
}

function getRarityColor(rarity: ChestReward["item"]["rarity"]): string {
  const colors: Record<ChestReward["item"]["rarity"], string> = {
    common: "#cbd5e1",
    uncommon: "#4ade80",
    rare: "#38bdf8",
    epic: "#c084fc",
    legendary: "#f59e0b",
    set: "#2dd4bf",
  };

  return colors[rarity];
}
