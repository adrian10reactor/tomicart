"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Obstacle from "./Obstacle";
import TrackSpline from "./TrackSpline";
import { LANES, OBSTACLE_KIND_LIST, OBSTACLE_KINDS } from "./constants";
import {
  DEFAULT_ENVIRONMENT,
  defaultTrackPoints,
  getAllLevels,
  makeEmptyLevel,
  upsertCustomLevel,
} from "./levels";
import { getNickname } from "./player";
import { upsertCloudLevel } from "./supabase";
import { buildCurve, frameAt } from "./spline";

const KIND_ICONS = {
  boulder: "🪨",
  oil_drum: "🛢️",
  crate: "📦",
  signal: "🚦",
  cart: "🛺",
  log: "🪵",
  sleepers: "🪜",
  tunnel: "🚇",
};

function randId(prefix = "ob") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// --------------------- 3D scene contents ---------------------

function EditorScene({
  level,
  selection,
  onSelect,
  onPointMove,
  environment,
  sunRef,
}) {
  const orbitRef = useRef(null);
  const { camera } = useThree();
  const targetRef = useRef(null);
  const [transforming, setTransforming] = useState(false);

  // Initial camera framing
  useEffect(() => {
    camera.position.set(20, 22, 30);
    camera.lookAt(0, 0, 60);
  }, [camera]);

  useEffect(() => {
    if (!sunRef.current) return;
    const az = ((environment.sunAzimuth ?? 40) * Math.PI) / 180;
    const el = ((environment.sunElevation ?? 55) * Math.PI) / 180;
    const r = 14;
    sunRef.current.position.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az)
    );
  }, [environment.sunAzimuth, environment.sunElevation, sunRef]);

  const { curve } = useMemo(
    () => buildCurve(level.trackPoints),
    [level.trackPoints]
  );

  const obstacleTransforms = useMemo(
    () =>
      (level.obstacles || []).map((it) => {
        const f = frameAt(curve, it.u);
        const laneX = it.span === "lane" ? LANES[it.laneIndex] || 0 : 0;
        const pos = f.point.clone().add(f.right.clone().multiplyScalar(laneX));
        const rot = new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent);
        const quat = new THREE.Quaternion().setFromRotationMatrix(rot);
        return { ...it, pos, quat };
      }),
    [level.obstacles, curve]
  );

  const pointRefs = useRef(new Map());
  useEffect(() => {
    // Clean up refs to points that no longer exist
    const validKeys = new Set(
      (level.trackPoints || []).map((_, i) => `pt-${i}`)
    );
    for (const k of Array.from(pointRefs.current.keys())) {
      if (!validKeys.has(k)) pointRefs.current.delete(k);
    }
  }, [level.trackPoints]);

  const selectedPointRef =
    selection?.type === "point"
      ? pointRefs.current.get(selection.id)
      : null;

  return (
    <>
      <color
        attach="background"
        args={[environment.skyColor || "#87b6d6"]}
      />
      {/* No fog in the editor — you need to see the whole level. */}

      <ambientLight intensity={environment.ambientIntensity ?? 0.55} />
      <directionalLight
        ref={sunRef}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <hemisphereLight args={["#cfe6f6", "#4a4030", 0.35]} />

      <Grid
        args={[200, 200]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#5a6570"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#8fa2ad"
        fadeDistance={120}
        fadeStrength={1}
        infiniteGrid
        position={[0, 0.01, 0]}
      />

      <TrackSpline
        trackPoints={level.trackPoints}
        divergences={level.divergences || []}
      />

      {/* Track control-point handles */}
      {(level.trackPoints || []).map((p, i) => {
        const id = `pt-${i}`;
        const isSel =
          selection?.type === "point" && selection.id === id;
        return (
          <mesh
            key={id}
            ref={(m) => {
              if (m) pointRefs.current.set(id, m);
            }}
            position={[p.x, p.y, p.z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ type: "point", id });
            }}
            castShadow
          >
            <sphereGeometry args={[0.55, 16, 16]} />
            <meshStandardMaterial
              color={isSel ? "#ffb43a" : "#3ba7ff"}
              emissive={isSel ? "#ff8a00" : "#000000"}
              emissiveIntensity={isSel ? 0.5 : 0}
            />
          </mesh>
        );
      })}

      {/* Obstacles */}
      {obstacleTransforms.map((it) => {
        const isSel =
          selection?.type === "obstacle" && selection.id === it.id;
        return (
          <group
            key={it.id}
            position={it.pos}
            quaternion={it.quat}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ type: "obstacle", id: it.id });
            }}
          >
            <Obstacle kind={it.kind} scale={it.scale ?? 1} />
            {isSel && (
              <mesh position={[0, 2, 0]}>
                <sphereGeometry args={[0.25, 12, 12]} />
                <meshBasicMaterial color="#ffb43a" />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Deselect on empty-space click */}
      <mesh
        position={[0, -0.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          if (e.eventObject === e.object) onSelect(null);
        }}
        visible={false}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial />
      </mesh>

      <OrbitControls
        ref={orbitRef}
        makeDefault
        enabled={!transforming}
        target={[0, 0, 30]}
      />

      {selectedPointRef && (
        <TransformControls
          object={selectedPointRef}
          mode="translate"
          size={1}
          onMouseDown={() => setTransforming(true)}
          onMouseUp={() => {
            setTransforming(false);
            if (!selectedPointRef) return;
            const p = selectedPointRef.position;
            const idx = parseInt(selection.id.replace("pt-", ""), 10);
            onPointMove(idx, { x: p.x, y: p.y, z: p.z });
          }}
        />
      )}
    </>
  );
}

// --------------------- Sidebars ---------------------

function LeftPalette({ tool, onToolChange, onAddPoint, mode }) {
  return (
    <div className="w-56 border-r border-white/10 overflow-y-auto min-h-0 p-4 shrink-0 bg-neutral-950/60">
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
        Track
      </div>
      <button
        onClick={onAddPoint}
        className="w-full text-sm rounded bg-white/10 border border-white/20 py-2 hover:bg-white/20 mb-4"
      >
        + Add track point
      </button>

      {mode === "placed" && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Obstacle tool
          </div>
          <div className="grid grid-cols-2 gap-2">
            {OBSTACLE_KIND_LIST.map((k) => {
              const meta = OBSTACLE_KINDS[k];
              const active = tool === k;
              return (
                <button
                  key={k}
                  onClick={() => onToolChange(k)}
                  className={`rounded-lg p-2 border text-left ${
                    active
                      ? "border-white bg-white/10"
                      : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <div className="text-xl">{KIND_ICONS[k] ?? "▪"}</div>
                  <div className="text-[10px] mt-1 truncate">{meta.label}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="text-[11px] text-white/50 mt-4 leading-relaxed">
        {mode === "random" ? (
          <>
            <b className="text-white/80">Random mode</b> — obstacles auto-spawn.
            Just shape the track by dragging the <span className="text-blue-300">blue spheres</span>.
            Switch to <b>Placed</b> mode if you want to place specific obstacles.
          </>
        ) : (
          <>
            Click a blue sphere to select a track point (drag its gizmo arrows to move
            it in 3D). Pick an obstacle tool above, then press{" "}
            <b>Place selected obstacle</b> in the right panel.
          </>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }) {
  return (
    <label className="block mb-2">
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {label}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
      />
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="block mb-2">
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {label}: {typeof value === "number" ? value.toFixed(2) : value}
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="block mb-2">
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 bg-transparent border border-white/10 rounded"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono"
        />
      </div>
    </label>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-sm font-semibold text-white/90 mb-3 pb-1 border-b border-white/10">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function RightProps({
  level,
  setLevel,
  selection,
  onDelete,
  onAddObstacle,
}) {
  const selectedPointIdx =
    selection?.type === "point"
      ? parseInt(selection.id.replace("pt-", ""), 10)
      : -1;
  const selectedPoint =
    selectedPointIdx >= 0 ? level.trackPoints[selectedPointIdx] : null;
  const selectedObstacle =
    selection?.type === "obstacle"
      ? (level.obstacles || []).find((o) => o.id === selection.id)
      : null;

  const setEnv = (patch) =>
    setLevel({
      ...level,
      environment: { ...(level.environment || DEFAULT_ENVIRONMENT), ...patch },
    });

  const updateObstacle = (id, patch) =>
    setLevel({
      ...level,
      obstacles: (level.obstacles || []).map((it) =>
        it.id === id ? { ...it, ...patch } : it
      ),
    });

  const updatePoint = (i, patch) =>
    setLevel({
      ...level,
      trackPoints: level.trackPoints.map((p, idx) =>
        idx === i ? { ...p, ...patch } : p
      ),
    });

  return (
    <div className="w-96 border-l border-white/10 overflow-y-auto min-h-0 p-5 shrink-0 text-sm bg-neutral-950/60">
      {selectedPoint && (
        <div>
          <div className="flex items-center justify-between">
            <div className="font-medium">
              Track point #{selectedPointIdx}
            </div>
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <NumberField
              label="X"
              value={selectedPoint.x}
              step={0.5}
              onChange={(v) => updatePoint(selectedPointIdx, { x: v })}
            />
            <NumberField
              label="Y (height)"
              value={selectedPoint.y}
              min={0}
              step={0.5}
              onChange={(v) =>
                updatePoint(selectedPointIdx, { y: Math.max(0, v) })
              }
            />
            <NumberField
              label="Z"
              value={selectedPoint.z}
              step={0.5}
              onChange={(v) => updatePoint(selectedPointIdx, { z: v })}
            />
          </div>
          <div className="text-[11px] text-white/50 mt-2">
            Or grab the on-scene gizmo arrows to drag in 3D.
          </div>

          {/* --- Split rails at this point --- */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">
              Split rails at this point
            </div>
            <div className="text-[11px] text-white/40 mb-3 leading-snug">
              Peel one or more rails away from the base position here. Split
              lanes automatically merge back at the next un-split point.
            </div>
            {[
              { i: 0, label: "Left" },
              { i: 1, label: "Middle" },
              { i: 2, label: "Right" },
            ].map(({ i, label }) => {
              const d = selectedPoint.laneDeltas?.[i];
              const active = !!d;
              return (
                <div
                  key={i}
                  className="mb-2 border border-white/10 rounded p-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium">{label} rail</div>
                    <button
                      onClick={() => {
                        const next = [
                          ...(selectedPoint.laneDeltas || [null, null, null]),
                        ];
                        next[i] = active ? null : { dx: 0, dy: 0 };
                        updatePoint(selectedPointIdx, { laneDeltas: next });
                      }}
                      className={
                        "text-[11px] rounded px-2 py-0.5 " +
                        (active
                          ? "bg-cyan-500/20 border border-cyan-400/40 text-cyan-200"
                          : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10")
                      }
                    >
                      {active ? "Split" : "Not split"}
                    </button>
                  </div>
                  {active && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <NumberField
                        label="Sideways"
                        value={d.dx}
                        step={0.5}
                        onChange={(v) => {
                          const next = [
                            ...(selectedPoint.laneDeltas || [
                              null,
                              null,
                              null,
                            ]),
                          ];
                          next[i] = { ...next[i], dx: v };
                          updatePoint(selectedPointIdx, { laneDeltas: next });
                        }}
                      />
                      <NumberField
                        label="Up / down"
                        value={d.dy}
                        step={0.5}
                        onChange={(v) => {
                          const next = [
                            ...(selectedPoint.laneDeltas || [
                              null,
                              null,
                              null,
                            ]),
                          ];
                          next[i] = { ...next[i], dy: v };
                          updatePoint(selectedPointIdx, { laneDeltas: next });
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedObstacle && (
        <div>
          <div className="flex items-center justify-between">
            <div className="font-medium">Obstacle</div>
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
          <label className="block mt-3 mb-2">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              Kind
            </div>
            <select
              value={selectedObstacle.kind}
              onChange={(e) =>
                updateObstacle(selectedObstacle.id, { kind: e.target.value })
              }
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
            >
              {OBSTACLE_KIND_LIST.map((k) => (
                <option key={k} value={k}>
                  {OBSTACLE_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="Position along track (u)"
            value={selectedObstacle.u}
            min={0}
            max={0.999}
            step={0.005}
            onChange={(v) => updateObstacle(selectedObstacle.id, { u: v })}
          />
          <div className="mt-2 mb-2">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              Span
            </div>
            <div className="flex gap-1 bg-black/40 border border-white/10 rounded p-1 text-xs">
              {[
                { key: "lane", label: "Single lane" },
                { key: "all", label: "All (jump over)" },
                { key: "tunnel", label: "Tunnel (duck!)" },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() =>
                    updateObstacle(selectedObstacle.id, {
                      span: s.key,
                      laneIndex:
                        s.key === "all" ? 1 : selectedObstacle.laneIndex,
                    })
                  }
                  className={`flex-1 rounded px-2 py-1 ${
                    (selectedObstacle.span ?? "lane") === s.key
                      ? "bg-white text-black"
                      : "text-white/70"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {(selectedObstacle.span ?? "lane") === "lane" && (
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
                Lane
              </div>
              <div className="flex gap-1 bg-black/40 border border-white/10 rounded p-1 text-xs">
                {["Left", "Center", "Right"].map((label, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      updateObstacle(selectedObstacle.id, { laneIndex: i })
                    }
                    className={`flex-1 rounded px-2 py-1 ${
                      selectedObstacle.laneIndex === i
                        ? "bg-white text-black"
                        : "text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedObstacle.kind && selectedObstacle.kind.startsWith("person") ? (
            <div className="text-xs text-white/50 mt-2">
              People are drawn at a fixed size.
            </div>
          ) : (
            <Slider
              label="Scale"
              value={selectedObstacle.scale ?? 1}
              min={0.4}
              max={3}
              step={0.05}
              onChange={(v) =>
                updateObstacle(selectedObstacle.id, { scale: v })
              }
            />
          )}
        </div>
      )}

      {!selectedPoint && !selectedObstacle && (
        <div className="text-white/50 mb-2">
          {level.mode === "random"
            ? "Random mode: obstacles auto-spawn from the spawn table below as you play. Click a blue sphere to shape the track."
            : "Click a blue sphere (track control point) or an obstacle to edit it."}
        </div>
      )}

      {level.mode === "placed" && (
        <div className="mt-3">
          <button
            onClick={onAddObstacle}
            className="w-full text-sm rounded bg-white/10 border border-white/20 py-2 hover:bg-white/20"
          >
            + Place selected obstacle on track
          </button>
        </div>
      )}

      <Section title="Level">
        <label className="block mb-2">
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
            Description
          </div>
          <textarea
            value={level.description || ""}
            onChange={(e) =>
              setLevel({ ...level, description: e.target.value })
            }
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
          />
        </label>
        <NumberField
          label="Base speed (m/s)"
          value={level.baseSpeed}
          min={5}
          max={40}
          step={0.5}
          onChange={(v) => setLevel({ ...level, baseSpeed: v })}
        />
        <NumberField
          label="Speed ramp"
          value={level.speedRamp}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => setLevel({ ...level, speedRamp: v })}
        />
        <label className="block mb-2">
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
            Mode
          </div>
          <div className="flex gap-1 bg-black/40 border border-white/10 rounded p-1 text-xs">
            {["placed", "random"].map((m) => (
              <button
                key={m}
                onClick={() => setLevel({ ...level, mode: m })}
                className={`flex-1 rounded px-2 py-1 capitalize ${
                  level.mode === m
                    ? "bg-white text-black"
                    : "text-white/70"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </label>
        <label className="block mb-2">
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
            Difficulty (obstacle density)
          </div>
          <div className="flex gap-1 bg-black/40 border border-white/10 rounded p-1 text-xs">
            {["easy", "medium", "hard"].map((d) => (
              <button
                key={d}
                onClick={() => setLevel({ ...level, difficulty: d })}
                className={`flex-1 rounded px-2 py-1 capitalize ${
                  (level.difficulty || "medium") === d
                    ? "bg-white text-black"
                    : "text-white/70"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </label>
      </Section>

      {level.mode === "random" && (
        <Section title="Spawn table (random mode)">
          <div className="text-[11px] text-white/50 mb-2">
            Weighted-random obstacles. Higher weight = more likely to appear.
          </div>
          <div className="grid gap-2">
            {(level.spawnTable || []).map((entry, idx) => (
              <div
                key={idx}
                className="bg-black/20 rounded p-2 grid grid-cols-[1fr_50px_50px_auto] gap-2 items-center"
              >
                <select
                  value={entry.kind}
                  onChange={(e) =>
                    setLevel({
                      ...level,
                      spawnTable: (level.spawnTable || []).map((x, i) =>
                        i === idx ? { ...x, kind: e.target.value } : x
                      ),
                    })
                  }
                  className="bg-black/40 border border-white/10 rounded px-1 py-1 text-xs"
                >
                  {OBSTACLE_KIND_LIST.map((k) => (
                    <option key={k} value={k}>
                      {OBSTACLE_KINDS[k].label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={entry.weight}
                  min={0}
                  step={1}
                  title="Weight"
                  onChange={(e) =>
                    setLevel({
                      ...level,
                      spawnTable: (level.spawnTable || []).map((x, i) =>
                        i === idx
                          ? {
                              ...x,
                              weight: Math.max(
                                0,
                                parseFloat(e.target.value) || 0
                              ),
                            }
                          : x
                      ),
                    })
                  }
                  className="bg-black/40 border border-white/10 rounded px-1 py-1 text-xs w-full"
                />
                {entry.kind && entry.kind.startsWith("person") ? (
                  <input
                    type="text"
                    value="—"
                    readOnly
                    disabled
                    title="People are drawn at a fixed size"
                    className="bg-black/20 border border-white/10 rounded px-1 py-1 text-xs w-full text-center text-white/40"
                  />
                ) : (
                  <input
                    type="number"
                    value={entry.scale ?? 1}
                    min={0.3}
                    max={3}
                    step={0.1}
                    title="Scale"
                    onChange={(e) =>
                      setLevel({
                        ...level,
                        spawnTable: (level.spawnTable || []).map((x, i) =>
                          i === idx
                            ? { ...x, scale: parseFloat(e.target.value) || 1 }
                            : x
                        ),
                      })
                    }
                    className="bg-black/40 border border-white/10 rounded px-1 py-1 text-xs w-full"
                  />
                )}
                <button
                  onClick={() =>
                    setLevel({
                      ...level,
                      spawnTable: (level.spawnTable || []).filter(
                        (_, i) => i !== idx
                      ),
                    })
                  }
                  className="text-red-400/70 hover:text-red-400 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setLevel({
                ...level,
                spawnTable: [
                  ...(level.spawnTable || []),
                  { kind: "person1", weight: 1, scale: 1 },
                ],
              })
            }
            className="mt-2 w-full text-xs rounded bg-white/10 border border-white/20 py-1.5 hover:bg-white/20"
          >
            + Add obstacle to pool
          </button>
        </Section>
      )}

      <Section title="Diverging rails">
        <div className="text-xs text-white/60 leading-snug">
          Select a track dot in the 3D scene and use the{" "}
          <span className="text-cyan-300">Split rails at this point</span>{" "}
          controls in the top of this panel to peel a lane sideways or
          upward. Splits automatically merge back at the next un-split point.
        </div>
      </Section>

      <Section title="Environment">
        <ColorField
          label="Sky"
          value={level.environment?.skyColor || DEFAULT_ENVIRONMENT.skyColor}
          onChange={(v) => setEnv({ skyColor: v, fogColor: v })}
        />
      </Section>
    </div>
  );
}

// --------------------- Editor container ---------------------

export default function Editor({ levelId, onBack, onSave, onPlay }) {
  const [level, setLevel] = useState(() => {
    const all = getAllLevels();
    return all.find((l) => l.id === levelId) ?? makeEmptyLevel();
  });
  const [tool, setTool] = useState("boulder");
  const [selection, setSelection] = useState(null);
  const sunRef = useRef(null);

  useEffect(() => {
    const all = getAllLevels();
    const found = all.find((l) => l.id === levelId);
    if (found) setLevel(found);
  }, [levelId]);

  const addTrackPoint = useCallback(() => {
    setLevel((l) => {
      const pts = l.trackPoints || defaultTrackPoints();
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2] || { x: 0, y: 0, z: 0 };
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const dz = last.z - prev.z;
      const nextPt = {
        x: last.x + (dx || 0),
        y: last.y + (dy || 0),
        z: last.z + (dz || 30),
      };
      return { ...l, trackPoints: [...pts, nextPt] };
    });
  }, []);

  const onPointMove = useCallback(
    (idx, pos) => {
      // Don't allow tracks to dip below ground. Spread-merge so per-lane
      // splits (laneDeltas) and any other point fields survive a drag.
      const clamped = { x: pos.x, y: Math.max(0, pos.y), z: pos.z };
      setLevel((l) => ({
        ...l,
        trackPoints: l.trackPoints.map((p, i) =>
          i === idx ? { ...p, ...clamped } : p
        ),
      }));
    },
    []
  );

  const addObstacle = useCallback(() => {
    setLevel((l) => {
      const meta = OBSTACLE_KINDS[tool];
      const span = meta.defaultSpan;
      const id = randId();
      return {
        ...l,
        obstacles: [
          ...(l.obstacles || []),
          {
            id,
            kind: tool,
            span,
            laneIndex: span === "all" ? 1 : 1,
            u: 0.15,
            scale: 1,
          },
        ],
      };
    });
    setSelection({ type: "obstacle", id: undefined });
    // Select the freshly added one on next render
    setTimeout(() => {
      setLevel((l) => {
        const last = (l.obstacles || [])[(l.obstacles || []).length - 1];
        if (last) setSelection({ type: "obstacle", id: last.id });
        return l;
      });
    }, 0);
  }, [tool]);

  const onDelete = useCallback(() => {
    if (!selection) return;
    if (selection.type === "point") {
      const idx = parseInt(selection.id.replace("pt-", ""), 10);
      setLevel((l) => {
        if ((l.trackPoints || []).length <= 2) return l; // need at least 2
        return {
          ...l,
          trackPoints: l.trackPoints.filter((_, i) => i !== idx),
        };
      });
    } else if (selection.type === "obstacle") {
      setLevel((l) => ({
        ...l,
        obstacles: (l.obstacles || []).filter((o) => o.id !== selection.id),
      }));
    }
    setSelection(null);
  }, [selection]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          document.activeElement &&
          (document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA" ||
            document.activeElement.tagName === "SELECT")
        )
          return;
        onDelete();
      }
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDelete]);

  // Ownership guard: refuse to overwrite a level authored by someone else.
  // Menu already hides the Edit button for non-owners, this is defense in
  // depth (deep-link, stale tab, etc.).
  const ensureOwnership = () => {
    const nickname = getNickname() || "";
    if (level.author && level.author !== nickname) {
      alert(
        `This level was made by "${level.author}". Only they can save changes to it.`
      );
      return null;
    }
    return nickname || "anon";
  };

  const save = () => {
    const nickname = ensureOwnership();
    if (!nickname) return;
    const withAuthor = { ...level, author: level.author || nickname };
    upsertCustomLevel(withAuthor);
    upsertCloudLevel(withAuthor, nickname);
    onSave?.(withAuthor);
  };
  const playIt = () => {
    const nickname = ensureOwnership();
    if (!nickname) return;
    const withAuthor = { ...level, author: level.author || nickname };
    upsertCustomLevel(withAuthor);
    upsertCloudLevel(withAuthor, nickname);
    onPlay(withAuthor);
  };

  return (
    <div className="h-screen w-full bg-neutral-950 text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          onClick={onBack}
          className="text-sm text-white/60 hover:text-white/90"
        >
          ← Back
        </button>
        <input
          value={level.name}
          onChange={(e) => setLevel({ ...level, name: e.target.value })}
          className="bg-transparent text-xl font-semibold px-2 py-1 rounded hover:bg-white/5 focus:bg-white/5 focus:outline-none"
        />
        <div className="ml-auto flex gap-2 items-center">
          <div className="text-xs text-white/40 mr-2">
            {(level.trackPoints || []).length} pts &nbsp;·&nbsp;{" "}
            {(level.obstacles || []).length} objs
          </div>
          <button
            onClick={save}
            className="text-sm rounded-full border border-white/20 text-white/80 px-4 py-1.5 hover:border-white/40"
          >
            Save
          </button>
          <button
            onClick={playIt}
            className="text-sm rounded-full bg-white text-black px-4 py-1.5 hover:bg-white/90"
          >
            Save &amp; Play
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <LeftPalette
          tool={tool}
          onToolChange={setTool}
          onAddPoint={addTrackPoint}
          mode={level.mode}
        />

        <div className="flex-1 min-w-0 relative">
          <Canvas shadows camera={{ position: [20, 22, 30], fov: 50 }}>
            <EditorScene
              level={level}
              selection={selection}
              onSelect={setSelection}
              onPointMove={onPointMove}
              environment={level.environment || DEFAULT_ENVIRONMENT}
              sunRef={sunRef}
            />
          </Canvas>
          <div className="absolute bottom-3 left-3 text-xs text-white/60 bg-black/40 rounded px-2 py-1">
            Drag to orbit · Scroll to zoom · Right-drag to pan · Click objects
            to select
          </div>
        </div>

        <RightProps
          level={level}
          setLevel={setLevel}
          selection={selection}
          onDelete={onDelete}
          onAddObstacle={addObstacle}
        />
      </div>
    </div>
  );
}
