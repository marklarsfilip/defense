import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { FastForward, Pause, Play, SkipForward } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Group } from "three";
import type { CombatEvent, CombatResult, EnemySpawn, HeroClass } from "../game/types";

interface CombatReplayProps {
  heroClass: HeroClass;
  result: CombatResult | null;
}

const GATE_POSITIONS: Record<EnemySpawn["gate"], [number, number, number]> = {
  north: [0, 0, -8],
  east: [8, 0, 0],
  south: [0, 0, 8],
  west: [-8, 0, 0],
};

const HOLD_POSITIONS: Record<EnemySpawn["gate"], [number, number, number]> = {
  north: [0.5, 0, -1.35],
  east: [1.35, 0, 0.5],
  south: [-0.5, 0, 1.35],
  west: [-1.35, 0, -0.5],
};

export function CombatReplay({ heroClass, result }: CombatReplayProps) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(Boolean(result));
  const [speed, setSpeed] = useState(1);
  const duration = result?.duration ?? 18;

  function skipToEnd() {
    setTime(duration);
    setPlaying(false);
  }

  function cycleSpeed() {
    setSpeed((current) => (current === 1 ? 2 : current === 2 ? 4 : 1));
  }

  return (
    <div className="replay-shell">
      <div className="replay-hud">
        <div>
          <span>{result ? `${time.toFixed(1)}s / ${duration.toFixed(1)}s` : "No run loaded"}</span>
          <strong>{result ? result.level.name : "3D combat preview"}</strong>
        </div>
        <div className="replay-controls">
          <button disabled={!result} onClick={() => setPlaying((current) => !current)} type="button">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button disabled={!result} onClick={cycleSpeed} type="button">
            <FastForward size={16} />
            {speed}x
          </button>
          <button disabled={!result} onClick={skipToEnd} type="button">
            <SkipForward size={16} />
          </button>
        </div>
      </div>

      <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: true }}>
        <PerspectiveCamera makeDefault position={[6.5, 6, 8]} fov={45} />
        <color attach="background" args={["#15171d"]} />
        <fog attach="fog" args={["#15171d", 10, 22]} />
        <ambientLight intensity={0.85} />
        <directionalLight castShadow intensity={2.8} position={[5, 9, 4]} shadow-mapSize={[1024, 1024]} />
        <spotLight angle={0.55} intensity={24} penumbra={0.55} position={[-3, 7, -5]} color={heroClass.color} />
        <ReplayClock duration={duration} playing={playing && Boolean(result)} speed={speed} onTick={setTime} />
        <Arena />
        <HeroModel color={heroClass.color} time={time} />
        {result ? <TimelineActors heroClass={heroClass} result={result} time={time} /> : <PreviewEnemies />}
        <OrbitControls enablePan={false} enableZoom={false} maxPolarAngle={1.25} minPolarAngle={0.75} />
      </Canvas>

      <div className="timeline-track" aria-label="Replay progress">
        <div style={{ width: `${Math.min(100, (time / duration) * 100)}%` }} />
      </div>
    </div>
  );
}

function ReplayClock({
  duration,
  onTick,
  playing,
  speed,
}: {
  duration: number;
  onTick: (time: number) => void;
  playing: boolean;
  speed: number;
}) {
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    if (!playing) {
      return;
    }

    elapsedRef.current = Math.min(duration, elapsedRef.current + delta * speed);
    onTick(elapsedRef.current);
  });

  return null;
}

function TimelineActors({ heroClass, result, time }: { heroClass: HeroClass; result: CombatResult; time: number }) {
  const enemies = useMemo(
    () => result.events.filter((event): event is Extract<CombatEvent, { type: "spawn" }> => event.type === "spawn"),
    [result.events],
  );
  const deaths = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of result.events) {
      if (event.type === "death") {
        map.set(event.enemyId, event.time);
      }
    }
    return map;
  }, [result.events]);
  const currentAttacks = useMemo(
    () =>
      result.events.filter(
        (event): event is Extract<CombatEvent, { type: "attack" }> =>
          event.type === "attack" && time >= event.time && time <= event.time + 0.45,
      ),
    [result.events, time],
  );
  const currentProjectiles = useMemo(
    () =>
      result.events.filter(
        (event): event is Extract<CombatEvent, { type: "projectile" }> =>
          event.type === "projectile" && time >= event.time && time <= event.time + 0.3,
      ),
    [result.events, time],
  );

  return (
    <>
      {enemies.map((enemy, index) => {
        const deathTime = deaths.get(enemy.enemyId);
        if (time < enemy.time || (deathTime && time > deathTime + 0.7)) {
          return null;
        }

        const position = enemyPosition(enemy.gate, enemy.time, deathTime, time, index);
        const dying = Boolean(deathTime && time >= deathTime);
        return <SkeletonModel dying={dying} key={enemy.enemyId} position={position} />;
      })}

      {currentProjectiles.map((event, index) => {
        const spawn = enemies.find((enemy) => enemy.enemyId === event.targetId);
        if (!spawn) {
          return null;
        }
        const progress = Math.min(1, Math.max(0, (time - event.time) / 0.3));
        const target = enemyPosition(spawn.gate, spawn.time, deaths.get(spawn.enemyId), time, index);
        const position = lerpPosition([0, 1.2, 0], [target[0], 0.8, target[2]], progress);
        return <Projectile color={heroClass.color} key={`${event.time}-${event.targetId}-${index}`} position={position} />;
      })}

      {currentAttacks.flatMap((event) =>
        event.targetIds.map((targetId) => {
          const spawn = enemies.find((enemy) => enemy.enemyId === targetId);
          if (!spawn) {
            return null;
          }
          const position = enemyPosition(spawn.gate, spawn.time, deaths.get(spawn.enemyId), time, 0);
          return (
            <Html center distanceFactor={8} key={`${event.time}-${targetId}`} position={[position[0], 1.65, position[2]]}>
              <div className={event.critical ? "damage-number critical" : "damage-number"}>
                {event.critical ? "CRIT " : ""}
                {event.damage}
              </div>
            </Html>
          );
        }),
      )}
    </>
  );
}

function Arena() {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.5, 72]} />
        <meshStandardMaterial color="#242833" roughness={0.88} metalness={0.05} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.75, 1.9, 72]} />
        <meshStandardMaterial color="#7c3aed" emissive="#241044" emissiveIntensity={0.5} />
      </mesh>
      {Object.entries(GATE_POSITIONS).map(([gate, position]) => (
        <group key={gate} position={position}>
          <mesh castShadow position={[0, 0.35, 0]}>
            <boxGeometry args={[1.8, 0.7, 0.35]} />
            <meshStandardMaterial color="#394150" roughness={0.75} />
          </mesh>
          <pointLight color="#6ee7b7" distance={5} intensity={2.5} position={[0, 0.7, 0]} />
        </group>
      ))}
    </group>
  );
}

function HeroModel({ color, time }: { color: string; time: number }) {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(time * 4) * 0.08;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.36, 0.72, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.46} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0, 1.58, 0]}>
        <sphereGeometry args={[0.32, 24, 16]} />
        <meshStandardMaterial color="#f7d8b7" roughness={0.5} />
      </mesh>
      <mesh castShadow rotation={[0, 0, -0.35]} position={[0.48, 1.0, 0]}>
        <boxGeometry args={[0.14, 1.25, 0.14]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.3} metalness={0.55} />
      </mesh>
      <pointLight color={color} distance={5} intensity={2.2} position={[0, 1.6, 0]} />
    </group>
  );
}

function SkeletonModel({ dying, position }: { dying: boolean; position: [number, number, number] }) {
  return (
    <group position={position} scale={dying ? 0.85 : 1}>
      <mesh castShadow position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.22, 0.48, 6, 10]} />
        <meshStandardMaterial color={dying ? "#6b7280" : "#d7d1bf"} roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0, 1.08, 0]}>
        <sphereGeometry args={[0.2, 16, 10]} />
        <meshStandardMaterial color={dying ? "#4b5563" : "#eee7d0"} roughness={0.8} />
      </mesh>
      <mesh castShadow rotation={[0.4, 0.1, 0.8]} position={[-0.32, 0.62, 0]}>
        <boxGeometry args={[0.1, 0.7, 0.1]} />
        <meshStandardMaterial color="#c4bea9" roughness={0.9} />
      </mesh>
      <mesh castShadow rotation={[0.4, -0.1, -0.8]} position={[0.32, 0.62, 0]}>
        <boxGeometry args={[0.1, 0.7, 0.1]} />
        <meshStandardMaterial color="#c4bea9" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Projectile({ color, position }: { color: string; position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.11, 16, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
    </mesh>
  );
}

function PreviewEnemies() {
  return (
    <>
      {(["north", "east", "west"] as const).map((gate, index) => (
        <SkeletonModel key={gate} dying={false} position={enemyPosition(gate, 0, undefined, 2 + index * 0.8, index)} />
      ))}
    </>
  );
}

function enemyPosition(
  gate: EnemySpawn["gate"],
  spawnTime: number,
  deathTime: number | undefined,
  time: number,
  index: number,
): [number, number, number] {
  const start = GATE_POSITIONS[gate];
  const hold = HOLD_POSITIONS[gate];
  const progress = Math.min(1, Math.max(0, (time - spawnTime) / 4.2));
  const laneOffset = ((index % 5) - 2) * 0.32;
  const base = lerpPosition(start, hold, easeOutCubic(progress));
  const jitter = Math.sin(time * 2 + index) * 0.04;
  const deathSink = deathTime && time >= deathTime ? -Math.min(0.55, (time - deathTime) * 0.9) : 0;
  return [base[0] + laneOffset * 0.45 + jitter, deathSink, base[2] + laneOffset * 0.45];
}

function lerpPosition(
  from: [number, number, number],
  to: [number, number, number],
  progress: number,
): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * progress,
    from[1] + (to[1] - from[1]) * progress,
    from[2] + (to[2] - from[2]) * progress,
  ];
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}
