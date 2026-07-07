import { useEffect, useMemo, useState } from "react";
import { Coins, Play, RotateCcw, Save, Sparkles, Trophy, Zap } from "lucide-react";
import { CombatReplay } from "./components/CombatReplay";
import { heroClasses, starterLevel } from "./game/content";
import {
  applyCombatRewards,
  createInitialCampaign,
  getExperienceForNextLevel,
  restoreCampaign,
  selectCampaignClass,
  type CampaignState,
} from "./game/progression";
import { simulateCombat } from "./game/simulateCombat";
import type { CombatResult } from "./game/types";

const SAVE_KEY = "tbd-defense:campaign";

export function App() {
  const [campaign, setCampaign] = useState<CampaignState>(() => loadCampaign());
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [runId, setRunId] = useState(0);
  const selectedClass = useMemo(
    () => heroClasses.find((heroClass) => heroClass.id === campaign.selectedClassId) ?? heroClasses[0],
    [campaign.selectedClassId],
  );
  const experienceForNextLevel = getExperienceForNextLevel(campaign.heroLevel);
  const experienceProgress =
    experienceForNextLevel > 0 ? Math.min(100, Math.round((campaign.experience / experienceForNextLevel) * 100)) : 100;
  const starterLevelCompleted = campaign.completedLevelIds.includes(starterLevel.id);

  useEffect(() => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(campaign));
  }, [campaign]);

  function startLevel() {
    const result = simulateCombat(selectedClass, starterLevel);

    setCombatResult(result);
    setCampaign((current) => applyCombatRewards(current, result));
    setRunId((current) => current + 1);
  }

  function replayLevel() {
    setRunId((current) => current + 1);
  }

  function selectClass(heroClassId: CampaignState["selectedClassId"]) {
    setCampaign((current) => selectCampaignClass(current, heroClassId));
    setCombatResult(null);
  }

  function resetProgress() {
    setCampaign(createInitialCampaign());
    setCombatResult(null);
    setRunId((current) => current + 1);
  }

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="Game status">
        <div>
          <p className="eyebrow">TBD Defense prototype</p>
          <h1>{starterLevel.subtitle}</h1>
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
            {campaign.victories} victories
          </span>
          <span>
            <Save size={16} />
            Local save
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
                <dd>{selectedClass.stats.damage}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{selectedClass.stats.attackSpeed.toFixed(2)}/s</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>{selectedClass.stats.health}</dd>
              </div>
              <div>
                <dt>Special</dt>
                <dd>{selectedClass.special.name}</dd>
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
              <span>{starterLevel.name}</span>
              <strong>{starterLevelCompleted ? "Cleared" : "Uncleared"}</strong>
            </div>
          </div>

          <button className="primary-action" onClick={startLevel} type="button">
            <Play size={18} />
            Start level
          </button>
          <button className="text-action" onClick={resetProgress} type="button">
            Reset local progress
          </button>
        </aside>

        <section className="combat-stage" aria-label="3D combat replay">
          <CombatReplay key={runId} heroClass={selectedClass} result={combatResult} />
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
                      ? "XP, gold, and level completion were saved locally."
                      : "Defeats can be replayed without changing progression."}
                  </span>
                </div>
              </div>

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
              <p>Level 1 spawns 30 skeletons from three gates. Victory rewards persist in this browser.</p>
            </div>
          )}

          <div className="combat-log">
            <p className="eyebrow">Recent events</p>
            <ol>
              {(combatResult?.events ?? [])
                .filter((event) => event.type === "attack" || event.type === "death" || event.type === "levelComplete")
                .slice(-7)
                .map((event, index) => (
                  <li key={`${event.type}-${event.time}-${index}`}>
                    <span>{event.time.toFixed(1)}s</span>
                    {event.type === "attack" && `${event.label} hit ${event.targetIds.length} target(s)`}
                    {event.type === "death" && `${event.enemyId} collapsed`}
                    {event.type === "levelComplete" && `Level complete: ${event.gold} gold`}
                  </li>
                ))}
            </ol>
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
