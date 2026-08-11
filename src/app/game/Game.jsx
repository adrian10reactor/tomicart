"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  playCoinChime,
  playCrash,
  playHit,
  playJump,
  setTrainSpeed,
  startMusic,
  startTrainSfx,
  stopMusic,
  stopTrainSfx,
  unlockAudio,
} from "./audio";
import Coin from "./Coin";
import HUD from "./HUD";
import Obstacle from "./Obstacle";
import Scenery from "./Scenery";
import TrackSpline from "./TrackSpline";
import Train from "./Train";
import { LANES, OBSTACLE_KINDS } from "./constants";
import { DEFAULT_ENVIRONMENT } from "./levels";
import {
  buildCurve,
  crossedU,
  divergedLanesFromPoints,
  frameAt,
  laneDeltaAt,
} from "./spline";

const HOP_DURATION = 0.42;
const HOP_HEIGHT = 1.5;
const HOP_CLEAR_Y = 0.4;
const COIN_SCORE = 5;
// A coin "burst" is a line of 3–6 coins along one lane. Bursts are spaced
// out in time — no more solo coins scattered at random.
const COIN_BURST_INTERVAL = 2.6;
const COIN_LEAD = 55;
const COIN_SPACING_U = 0.022; // arc-length step between coins in a burst

// Higher multiplier = longer interval = fewer obstacles.
const DIFFICULTY_MULT = { easy: 2.4, medium: 1.6, hard: 1.0 };
const CAMERA_BEHIND = 8;
const CAMERA_HEIGHT = 6.0;
const CAMERA_LOOK_AHEAD = 6;
// Narrow viewports (portrait phones) show much less horizontally at the same
// distance — pull back and up so the train and upcoming obstacles still fit.
const CAMERA_BEHIND_MOBILE = 13;
const CAMERA_HEIGHT_MOBILE = 8.5;

function pickObstacleFromTable(table) {
  const total = table.reduce((s, t) => s + (t.weight || 0), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const t of table) {
    r -= t.weight || 0;
    if (r <= 0) return t;
  }
  return table[table.length - 1];
}

function laneAnchor(u, laneIdx, trackPoints) {
  const d = laneDeltaAt(u, laneIdx, trackPoints);
  return { lateral: LANES[laneIdx] + d.dx, dy: d.dy };
}

function computeObstacleTransforms(obstacles, curve, trackPoints) {
  return obstacles.map((it) => {
    const f = frameAt(curve, it.u);
    const a =
      it.span === "lane"
        ? laneAnchor(it.u, it.laneIndex, trackPoints)
        : { lateral: 0, dy: 0 };
    const pos = f.point
      .clone()
      .add(f.right.clone().multiplyScalar(a.lateral))
      .add(new THREE.Vector3(0, a.dy, 0));
    const rot = new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rot);
    return { ...it, pos, quat };
  });
}

function Scene({ gameStateRef, levelRef, onScoreChange, onGameOver }) {
  const trainRef = useRef(null);
  const sunRef = useRef(null);
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);
  const dynamicRef = useRef([]);
  const coinsRef = useRef([]);
  const idCounter = useRef(0);
  const lastResetToken = useRef(0);

  const { camera, size } = useThree();
  const isNarrow = size.width < 768;
  const camBehind = isNarrow ? CAMERA_BEHIND_MOBILE : CAMERA_BEHIND;
  const camHeight = isNarrow ? CAMERA_HEIGHT_MOBILE : CAMERA_HEIGHT;

  const level = levelRef.current;
  const env = level.environment ?? DEFAULT_ENVIRONMENT;

  const { curve, arcLength } = useMemo(
    () => buildCurve(level.trackPoints),
    [level.trackPoints]
  );

  // World offset added per loop so the next loop tiles right after the last one.
  // For this to be seamless, the level's first and last control points must
  // share x and y (normalizeLevel enforces that). Then loops only advance in
  // z and there's no visible discontinuity at the seam.
  const loopOffset = useMemo(() => {
    const pts = level.trackPoints;
    const first = pts[0];
    const last = pts[pts.length - 1];
    return new THREE.Vector3(
      last.x - first.x,
      last.y - first.y,
      last.z - first.z
    );
  }, [level.trackPoints]);

  const staticTransforms = useMemo(
    () =>
      computeObstacleTransforms(
        level.obstacles || [],
        curve,
        level.trackPoints
      ),
    [level.obstacles, curve, level.trackPoints]
  );

  // Track which "loop index" is the base of what we're rendering. We always
  // render `loopBase` and `loopBase + 1` so the next loop is already visible
  // before the train reaches it.
  const [loopBase, setLoopBase] = useState(0);
  const loopBaseRef = useRef(0);
  useEffect(() => {
    loopBaseRef.current = loopBase;
  }, [loopBase]);

  useEffect(() => {
    if (!sunRef.current) return;
    const az = ((env.sunAzimuth ?? 40) * Math.PI) / 180;
    const el = ((env.sunElevation ?? 55) * Math.PI) / 180;
    const r = 14;
    sunRef.current.position.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      r * Math.cos(el) * Math.cos(az)
    );
  }, [env.sunAzimuth, env.sunElevation]);

  useFrame((_, rawDt) => {
    const state = gameStateRef.current;
    const level = levelRef.current;

    if (state.resetToken !== lastResetToken.current) {
      lastResetToken.current = state.resetToken;
      state.speed = level.baseSpeed;
      state.score = 0;
      state.laneIndex = 1;
      state.laneX = LANES[1];
      state.hop = null;
      state.hopQueued = false;
      state.distance = 0;
      state.resolvedStatic = new Set();
      state.resolvedLoop = 0;
      state.spawnTimer = 0.6;
      state.coinBurstTimer = 1.0;
      state.lastLane = -1;
      state.lastCoinLane = -1;
      state.distSinceFullWidth = 100;
      dynamicRef.current = [];
      coinsRef.current = [];
      setLoopBase(0);
      loopBaseRef.current = 0;
      onScoreChange(0);
      rerender();
    }

    const dt = Math.min(rawDt, 0.05);
    const AL = Math.max(1, arcLength);

    if (state.running) {
      state.speed += dt * level.speedRamp;
      const prevDistance = state.distance;
      state.distance += state.speed * dt;

      const prevLoopIdx = Math.floor(prevDistance / AL);
      const curLoopIdx = Math.floor(state.distance / AL);
      if (curLoopIdx !== prevLoopIdx) {
        state.resolvedStatic = new Set();
        state.resolvedLoop = curLoopIdx;
        // Slide the render window forward.
        if (curLoopIdx > loopBaseRef.current) {
          loopBaseRef.current = curLoopIdx;
          setLoopBase(curLoopIdx);
        }
      }
    }

    const currentLoop = Math.floor(state.distance / AL);
    const localU = (state.distance % AL) / AL;
    const prevLocalU =
      (Math.max(0, state.distance - state.speed * dt) % AL) / AL;
    const deltaU = Math.min(0.5, (state.speed * dt) / AL);

    const f = frameAt(curve, localU);
    const loopWorldOffset = loopOffset.clone().multiplyScalar(currentLoop);

    // Expose the current local u so the keydown handler can check whether a
    // divergence is active before allowing a lane switch.
    state.currentLocalU = localU;

    // Lane lerp — target follows the (possibly diverged) lane's anchor so
    // the train rides the split rail (both lateral and vertical) through
    // the divergence.
    const laneA = laneAnchor(localU, state.laneIndex, level.trackPoints);
    const targetLaneX = laneA.lateral;
    const targetLaneY = laneA.dy;
    state.laneX += (targetLaneX - state.laneX) * Math.min(1, dt * 14);
    if (state.laneY == null) state.laneY = 0;
    state.laneY += (targetLaneY - state.laneY) * Math.min(1, dt * 14);

    // Hop
    let hopY = 0;
    if (state.hop) {
      state.hop.elapsed += dt;
      const t = Math.min(1, state.hop.elapsed / HOP_DURATION);
      hopY = Math.sin(t * Math.PI) * HOP_HEIGHT;
      if (t >= 1) {
        state.hop = null;
        if (state.hopQueued) {
          state.hopQueued = false;
          state.hop = { elapsed: 0 };
        }
      }
    }

    // Position and orient train (includes vertical lane delta for split rails)
    if (trainRef.current) {
      const pos = f.point
        .clone()
        .add(f.right.clone().multiplyScalar(state.laneX))
        .add(new THREE.Vector3(0, state.laneY + hopY, 0))
        .add(loopWorldOffset);
      trainRef.current.position.copy(pos);
      const rot = new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent);
      trainRef.current.quaternion.setFromRotationMatrix(rot);
    }

    // Camera chase — under normal driving the camera stays centered on the
    // spline. During a divergence the train physically peels off; the camera
    // follows the peel delta (lateral + vertical) so you keep seeing your
    // own rail.
    const laneCenterHere = LANES[state.laneIndex];
    const divergenceDelta = targetLaneX - laneCenterHere;
    const camLateral = f.right
      .clone()
      .multiplyScalar(divergenceDelta)
      .add(new THREE.Vector3(0, state.laneY, 0));
    const camPos = f.point
      .clone()
      .add(camLateral)
      .add(f.tangent.clone().multiplyScalar(-camBehind))
      .add(f.up.clone().multiplyScalar(camHeight))
      .add(loopWorldOffset);
    const camLook = f.point
      .clone()
      .add(camLateral)
      .add(f.tangent.clone().multiplyScalar(CAMERA_LOOK_AHEAD))
      .add(f.up.clone().multiplyScalar(1))
      .add(loopWorldOffset);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    if (!state.running) return;

    // ---- Collision ----
    const hoppingHigh =
      !!state.hop &&
      Math.sin((state.hop.elapsed / HOP_DURATION) * Math.PI) * HOP_HEIGHT >
        HOP_CLEAR_Y;
    const trainLane = state.laneIndex;

    // Collision needs BOTH:
    //   (a) the player has committed to the obstacle's lane (laneIndex match)
    //   (b) the train is physically close enough in world space
    // That kills two false positives at once: crashing into a lane you
    // haven't slid over to yet (b guards) AND crashing into an obstacle in
    // the lane you just pressed away from (a guards).
    const LANE_HIT_HALFWIDTH = 1.2;
    const evaluateCollision = (it) => {
      if (it.span === "tunnel") {
        const passable = Array.isArray(it.lanes)
          ? it.lanes.includes(trainLane)
          : true;
        return passable ? "safe" : "hit";
      }
      if (it.span === "all") return hoppingHigh ? "safe" : "hit";
      if (it.laneIndex !== trainLane) return "safe";
      const obsA = laneAnchor(it.u, it.laneIndex, level.trackPoints);
      const dx = Math.abs(state.laneX - obsA.lateral);
      if (dx < LANE_HIT_HALFWIDTH && !hoppingHigh) return "hit";
      return "safe";
    };

    let hit = false;
    let hitKind = null;
    let scored = 0;

    for (let i = 0; i < staticTransforms.length; i++) {
      const it = staticTransforms[i];
      const key = it.id ?? i;
      if (state.resolvedStatic.has(key)) continue;
      if (crossedU(prevLocalU, deltaU, it.u)) {
        state.resolvedStatic.add(key);
        if (evaluateCollision(it) === "hit") {
          hit = true;
          hitKind = it.kind;
        } else scored += 1;
      }
    }

    // ---- Random-mode spawner (dynamic obstacles) ----
    if (
      level.mode === "random" &&
      Array.isArray(level.spawnTable) &&
      level.spawnTable.length
    ) {
      state.spawnTimer -= dt;
      // Track distance since the last full-width (jump) obstacle so we can
      // enforce a longer cooldown between them — otherwise you get two logs
      // in a row that's physically impossible to jump.
      state.distSinceFullWidth = (state.distSinceFullWidth || 0) + state.speed * dt;

      if (state.spawnTimer <= 0) {
        const diffMult =
          DIFFICULTY_MULT[level.difficulty] ?? DIFFICULTY_MULT.medium;
        const interval =
          Math.max(
            level.minSpawnInterval,
            level.baseSpawnInterval - (state.speed - level.baseSpeed) * 0.025
          ) * diffMult;
        state.spawnTimer = interval;

        // Pick a kind. Reroll from full-width → lane if either
        //   (a) we just spawned another full-width recently, or
        //   (b) the u we'd place it at is inside a divergence (a single
        //       cross-track log can't hit rails that are physically split).
        const FULL_WIDTH_MIN_GAP = 22;
        const leadU = Math.min(0.6, (level.obstacleLead || 30) / AL);
        const uAbs = state.distance / AL + leadU;
        const targetLoop = Math.floor(uAbs);
        const targetU = uAbs - targetLoop;
        const divergedThere = divergedLanesFromPoints(
          targetU,
          level.trackPoints
        );

        let pick = pickObstacleFromTable(level.spawnTable);
        let meta = pick && OBSTACLE_KINDS[pick.kind];
        const isFullWidth =
          meta && (pick.span || meta.defaultSpan) === "all";
        if (
          isFullWidth &&
          (state.distSinceFullWidth < FULL_WIDTH_MIN_GAP ||
            divergedThere.size > 0)
        ) {
          const laneOnly = level.spawnTable.filter((t) => {
            const m = OBSTACLE_KINDS[t.kind];
            return m && (t.span || m.defaultSpan) === "lane";
          });
          if (laneOnly.length) {
            pick = pickObstacleFromTable(laneOnly);
            meta = pick && OBSTACLE_KINDS[pick.kind];
          }
        }

        if (pick && meta) {
          const span = pick.span || meta.defaultSpan || "lane";

          const pushOne = (kind, laneIndex, spanValue, scale) => {
            idCounter.current += 1;
            dynamicRef.current.push({
              id: `dyn-${idCounter.current}`,
              kind,
              span: spanValue,
              laneIndex,
              scale: scale ?? 1,
              u: targetU,
              loopIdx: targetLoop,
              resolved: false,
            });
          };

          if (span === "all") {
            pushOne(pick.kind, 1, span, pick.scale);
            state.distSinceFullWidth = 0;
          } else {
            // Lane obstacle. Bias against the last lane used so you don't get
            // a streak of same-lane spawns.
            const lastLane = state.lastLane ?? -1;
            const candidates = [0, 1, 2].filter((l) => l !== lastLane);
            const primaryLane =
              candidates[Math.floor(Math.random() * candidates.length)];
            pushOne(pick.kind, primaryLane, "lane", pick.scale);
            state.lastLane = primaryLane;

            // ~30% chance to also spawn a SECOND obstacle at the same u in
            // one of the other lanes, so you have to actually switch instead
            // of gliding straight past a single-lane block.
            if (Math.random() < 0.3) {
              const otherLanes = [0, 1, 2].filter(
                (l) => l !== primaryLane
              );
              const partnerLane =
                otherLanes[Math.floor(Math.random() * otherLanes.length)];
              const partnerPick =
                pickObstacleFromTable(
                  level.spawnTable.filter((t) => {
                    const m = OBSTACLE_KINDS[t.kind];
                    return m && (t.span || m.defaultSpan) === "lane";
                  })
                ) || pick;
              pushOne(
                partnerPick.kind,
                partnerLane,
                "lane",
                partnerPick.scale
              );
            }
          }

          rerender();
        }
      }

      for (let i = dynamicRef.current.length - 1; i >= 0; i--) {
        const it = dynamicRef.current[i];
        if (
          !it.resolved &&
          it.loopIdx === currentLoop &&
          crossedU(prevLocalU, deltaU, it.u)
        ) {
          it.resolved = true;
          if (evaluateCollision(it) === "hit") {
            hit = true;
            hitKind = it.kind;
          } else scored += 1;
        }
        if (it.resolved && it.loopIdx < currentLoop) {
          dynamicRef.current.splice(i, 1);
        }
      }
    }

    // ---- Coin spawner + pickup ----
    // Spawn coins in bursts (subway-surfers style): 3–6 in a row on the
    // same lane, sometimes shifting lane in the middle for a zigzag.
    state.coinBurstTimer = (state.coinBurstTimer ?? 1.0) - dt;
    if (state.coinBurstTimer <= 0) {
      state.coinBurstTimer = COIN_BURST_INTERVAL;
      const count = 3 + Math.floor(Math.random() * 4); // 3..6
      const laneCandidates = [0, 1, 2].filter(
        (l) => l !== (state.lastCoinLane ?? -1)
      );
      let lane =
        laneCandidates[Math.floor(Math.random() * laneCandidates.length)];
      state.lastCoinLane = lane;
      const zigzagAt =
        Math.random() < 0.35 ? Math.floor(count / 2) : -1;
      const baseUAbs =
        state.distance / AL + Math.min(0.7, COIN_LEAD / AL);
      for (let i = 0; i < count; i++) {
        if (i === zigzagAt) {
          const others = [0, 1, 2].filter((l) => l !== lane);
          lane = others[Math.floor(Math.random() * others.length)];
        }
        const uAbs = baseUAbs + i * COIN_SPACING_U;
        const targetLoop = Math.floor(uAbs);
        const targetU = uAbs - targetLoop;
        idCounter.current += 1;
        coinsRef.current.push({
          id: `coin-${idCounter.current}`,
          laneIndex: lane,
          u: targetU,
          loopIdx: targetLoop,
          collected: false,
        });
      }
      rerender();
    }

    const COIN_HIT_HALFWIDTH = 1.4;
    for (let i = coinsRef.current.length - 1; i >= 0; i--) {
      const c = coinsRef.current[i];
      if (
        !c.collected &&
        c.loopIdx === currentLoop &&
        crossedU(prevLocalU, deltaU, c.u)
      ) {
        if (c.laneIndex === trainLane) {
          const cA = laneAnchor(c.u, c.laneIndex, level.trackPoints);
          const dx = Math.abs(state.laneX - cA.lateral);
          if (dx < COIN_HIT_HALFWIDTH) {
            c.collected = true;
            scored += COIN_SCORE;
            playCoinChime();
          }
        }
      }
      if ((c.collected && c.loopIdx <= currentLoop) || c.loopIdx < currentLoop - 1) {
        coinsRef.current.splice(i, 1);
      }
    }

    if (scored > 0) {
      state.score += scored;
      onScoreChange(state.score);
    }
    if (hit) {
      state.running = false;
      playHit();
      playCrash();
      onGameOver(state.score, hitKind);
    }
    setTrainSpeed(state.speed);
  });

  // Three rendered copies so the next loop is already fully visible before
  // the train reaches its start.
  const renderedLoops = [loopBase, loopBase + 1, loopBase + 2];

  return (
    <>
      <color attach="background" args={[env.skyColor || "#87b6d6"]} />
      <fog
        attach="fog"
        args={[env.fogColor || "#87b6d6", env.fogNear ?? 20, env.fogFar ?? 160]}
      />

      <ambientLight intensity={env.ambientIntensity ?? 0.55} />
      <directionalLight
        ref={sunRef}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <hemisphereLight args={["#cfe6f6", "#4a4030", 0.35]} />

      <Train ref={trainRef} />

      {renderedLoops.map((loopIdx) => {
        const off = loopOffset.clone().multiplyScalar(loopIdx);
        return (
          <group key={loopIdx} position={off}>
            <Scenery
              curve={curve}
              arcLength={arcLength}
              environment={env}
              loopIdx={loopIdx}
            />
            <TrackSpline trackPoints={level.trackPoints} />
            {staticTransforms.map((it) => (
              <group
                key={it.id ?? `s-${it.u}-${it.kind}`}
                position={it.pos}
                quaternion={it.quat}
              >
                <Obstacle
                  kind={it.kind}
                  scale={it.scale ?? 1}
                  meta={{ lanes: it.lanes }}
                />
              </group>
            ))}
          </group>
        );
      })}

      {/* Dynamic obstacles: positioned at their loop */}
      {dynamicRef.current.map((it) => {
        const df = frameAt(curve, it.u);
        const a =
          it.span === "lane"
            ? laneAnchor(it.u, it.laneIndex, level.trackPoints)
            : { lateral: 0, dy: 0 };
        const loopOff = loopOffset.clone().multiplyScalar(it.loopIdx);
        const pos = df.point
          .clone()
          .add(df.right.clone().multiplyScalar(a.lateral))
          .add(new THREE.Vector3(0, a.dy, 0))
          .add(loopOff);
        const rot = new THREE.Matrix4().makeBasis(df.right, df.up, df.tangent);
        const q = new THREE.Quaternion().setFromRotationMatrix(rot);
        return (
          <group key={it.id} position={pos} quaternion={q}>
            <Obstacle
              kind={it.kind}
              scale={it.scale ?? 1}
              meta={{ lanes: it.lanes }}
            />
          </group>
        );
      })}

      {/* Reactor-logo coins floating above the rails */}
      {coinsRef.current.map((c) => {
        if (c.collected) return null;
        const cf = frameAt(curve, c.u);
        const cA = laneAnchor(c.u, c.laneIndex, level.trackPoints);
        const loopOff = loopOffset.clone().multiplyScalar(c.loopIdx);
        const pos = cf.point
          .clone()
          .add(cf.right.clone().multiplyScalar(cA.lateral))
          .add(new THREE.Vector3(0, cA.dy, 0))
          .add(loopOff);
        const rot = new THREE.Matrix4().makeBasis(cf.right, cf.up, cf.tangent);
        const q = new THREE.Quaternion().setFromRotationMatrix(rot);
        return (
          <group key={c.id} position={pos} quaternion={q}>
            <Coin />
          </group>
        );
      })}
    </>
  );
}

export default function Game({
  level,
  best,
  onScore,
  onGameOver,
  onExit,
  submitInfo,
}) {
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState("running");
  const [crashKind, setCrashKind] = useState(null);
  // Force the Canvas to mount after hydration. Without this, R3F's setup
  // effects don't fire under Next.js 16 turbopack and the canvas stays blank.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  const gameStateRef = useRef({
    running: true,
    laneIndex: 1,
    laneX: LANES[1],
    speed: level.baseSpeed,
    score: 0,
    resetToken: 1,
    hop: null,
    hopQueued: false,
    distance: 0,
    resolvedStatic: new Set(),
    resolvedLoop: 0,
    spawnTimer: 0.6,
  });

  const restart = useCallback(() => {
    const s = gameStateRef.current;
    s.resetToken += 1;
    s.running = true;
    setScore(0);
    setStatus("running");
    setCrashKind(null);
    unlockAudio();
    startTrainSfx();
  }, []);

  const handleGameOver = useCallback(
    (finalScore, kind) => {
      setStatus("over");
      setCrashKind(kind ?? null);
      onGameOver?.(finalScore);
    },
    [onGameOver]
  );

  const handleScore = useCallback(
    (s) => {
      setScore(s);
      onScore?.(s);
    },
    [onScore]
  );

  const startHop = useCallback(() => {
    const s = gameStateRef.current;
    if (!s.hop) {
      s.hop = { elapsed: 0 };
    } else {
      s.hopQueued = true;
    }
    playJump();
  }, []);

  useEffect(() => {
    // Kick the AudioContext + start train chugging + start ambient music.
    // First real input (any keydown) satisfies the browser autoplay policy.
    unlockAudio();
    startTrainSfx();
    startMusic();
    return () => {
      stopTrainSfx();
      stopMusic();
    };
  }, []);

  // Shared input handlers so keyboard + swipe stay in sync.
  const switchLane = useCallback((dir) => {
    // dir: "left" | "right" — same lane numbering as the arrow keys.
    const s = gameStateRef.current;
    if (!s.running) return;
    const lvl = levelRef.current;
    const diverged = divergedLanesFromPoints(
      s.currentLocalU ?? 0,
      lvl.trackPoints
    );
    const nextLane =
      dir === "left"
        ? Math.min(2, s.laneIndex + 1)
        : Math.max(0, s.laneIndex - 1);
    if (diverged.has(s.laneIndex) || diverged.has(nextLane)) return;
    s.laneIndex = nextLane;
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      unlockAudio();
      const s = gameStateRef.current;
      if (e.key === "Escape") {
        onExit?.();
        return;
      }
      if (e.key === "Enter" && status === "over") {
        restart();
        return;
      }
      if (!s.running) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        startHop();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        switchLane("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        switchLane("right");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, restart, startHop, onExit, switchLane]);

  // Touch: swipe left/right = switch, swipe up = jump, tap = jump too.
  // 30px feels responsive without triggering on incidental drags.
  useEffect(() => {
    const SWIPE = 30;
    const TAP_MAX = 12;
    let startX = 0,
      startY = 0,
      startT = 0,
      active = false;
    const onStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = performance.now();
      active = true;
      unlockAudio();
    };
    const onEnd = (e) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (status === "over") {
        if (adx < TAP_MAX && ady < TAP_MAX) restart();
        return;
      }
      // Tap = jump (short + tiny displacement).
      if (adx < TAP_MAX && ady < TAP_MAX && performance.now() - startT < 300) {
        startHop();
        return;
      }
      if (ady > adx && dy < -SWIPE) {
        startHop();
        return;
      }
      if (adx > ady && adx > SWIPE) {
        switchLane(dx < 0 ? "left" : "right");
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [status, restart, startHop, switchLane]);

  return (
    <div className="fixed inset-0 select-none">
      <div className="absolute inset-0">
        {mounted && (
          <Canvas
            shadows
            camera={{ position: [0, 4, 8], fov: 55 }}
            gl={{ antialias: true }}
          >
            <Scene
              gameStateRef={gameStateRef}
              levelRef={levelRef}
              onScoreChange={handleScore}
              onGameOver={handleGameOver}
            />
          </Canvas>
        )}
      </div>
      <HUD
        levelName={level.name}
        score={score}
        best={best ?? 0}
        status={status}
        crashKind={crashKind}
        submitInfo={submitInfo}
        onRestart={restart}
        onExit={onExit}
      />
    </div>
  );
}
