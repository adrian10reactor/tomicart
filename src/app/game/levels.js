"use client";

import { OBSTACLE_KINDS } from "./constants";

// A "level" now has a 3D track (a spline of control points) and a set of
// placed obstacles positioned along that spline. The train follows the
// spline. All levels — built-in and custom — use this shape.

const STORAGE_KEY = "tomica.levels.v1";
const STATS_KEY = "tomica.stats.v1";

// Old kinds → new kinds. Anything not in either goes away entirely.
const KIND_MIGRATIONS = {
  boulder: "person1",
  oil_drum: "person2",
  crate: "person3",
  signal: "person1",
  cart: "person2",
  tunnel: null,
  sleepers: null,
};

function defaultSpawnTable() {
  return [
    { kind: "person1", weight: 3, scale: 1.0 },
    { kind: "person2", weight: 3, scale: 1.0 },
    { kind: "person3", weight: 3, scale: 1.0 },
    { kind: "personboss", weight: 1, scale: 1.0 },
    { kind: "log", weight: 2, scale: 1.0 },
  ];
}

export const DEFAULT_ENVIRONMENT = {
  skyColor: "#87b6d6",
  fogColor: "#87b6d6",
  fogNear: 80,
  fogFar: 500,
  groundColor: "#2b2f24",
  ballastColor: "#4a4137",
  sunAzimuth: 40,
  sunElevation: 55,
  ambientIntensity: 0.55,
};

// A straight track along +z, 150 world units long. Enough to feel like a
// full loop.
export function defaultTrackPoints() {
  return [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 30 },
    { x: 0, y: 0, z: 60 },
    { x: 0, y: 0, z: 90 },
    { x: 0, y: 0, z: 120 },
    { x: 0, y: 0, z: 150 },
  ];
}

export const BUILTIN_LEVELS = [
  {
    id: "endless",
    name: "Endless (straight)",
    description: "Straight infinite track. A gentle intro.",
    author: "built-in",
    createdAt: "2024-01-01T00:00:00.000Z",
    builtIn: true,
    mode: "random",
    baseSpeed: 14,
    speedRamp: 0.55,
    baseSpawnInterval: 0.45,
    minSpawnInterval: 0.22,
    obstacleLead: 65,
    minObstacleGap: 6,
    environment: { ...DEFAULT_ENVIRONMENT },
    trackPoints: defaultTrackPoints(),
    spawnTable: [
      { kind: "person1", weight: 3, scale: 1.0 },
      { kind: "person2", weight: 3, scale: 1.0 },
      { kind: "person3", weight: 3, scale: 1.0 },
      { kind: "personboss", weight: 1, scale: 1.0 },
      { kind: "log", weight: 2, scale: 1.0 },
    ],
    obstacles: [],
  },
  {
    id: "rollercoaster",
    name: "Rollercoaster",
    description: "Huge drops, banking turns, three big peaks. Hold on.",
    author: "built-in",
    createdAt: "2024-01-01T00:00:00.000Z",
    builtIn: true,
    mode: "random",
    baseSpeed: 18,
    speedRamp: 0.55,
    baseSpawnInterval: 0.55,
    minSpawnInterval: 0.28,
    obstacleLead: 70,
    minObstacleGap: 7,
    environment: {
      ...DEFAULT_ENVIRONMENT,
      skyColor: "#f0b56e",
      fogColor: "#e29b4a",
      groundColor: "#5a3a22",
    },
    trackPoints: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 4, z: 35 },
      { x: 0, y: 16, z: 80 },
      { x: -3, y: 18, z: 120 },
      { x: -6, y: 4, z: 165 },
      { x: -10, y: 12, z: 210 },
      { x: -4, y: 20, z: 255 },
      { x: 3, y: 18, z: 295 },
      { x: 8, y: 4, z: 345 },
      { x: 10, y: 10, z: 390 },
      { x: 6, y: 17, z: 435 },
      { x: -2, y: 16, z: 480 },
      { x: -8, y: 5, z: 525 },
      { x: -10, y: 13, z: 570 },
      { x: -4, y: 19, z: 615 },
      { x: 4, y: 8, z: 660 },
      { x: 6, y: 14, z: 700 },
      { x: 2, y: 6, z: 740 },
      { x: 0, y: 2, z: 775 },
      { x: 0, y: 0, z: 810 },
    ],
    divergences: [
      { startU: 0.18, endU: 0.32, lane: 0, offset: -6 },
      { startU: 0.55, endU: 0.7, lane: 2, offset: 6 },
    ],
    spawnTable: [
      { kind: "person1", weight: 3, scale: 1.0 },
      { kind: "person2", weight: 3, scale: 1.0 },
      { kind: "person3", weight: 3, scale: 1.0 },
      { kind: "personboss", weight: 1, scale: 1.0 },
      { kind: "log", weight: 2, scale: 1.0 },
    ],
    obstacles: [],
  },
];

export function makeEmptyLevel(name = "New level") {
  return {
    id: `custom-${Math.floor(Math.random() * 1e9).toString(36)}`,
    name,
    description: "",
    author: "you",
    createdAt: new Date().toISOString(),
    builtIn: false,
    // Random by default — new users can just tweak the track shape and play.
    mode: "random",
    baseSpeed: 14,
    speedRamp: 0.45,
    baseSpawnInterval: 0.45,
    minSpawnInterval: 0.22,
    obstacleLead: 65,
    minObstacleGap: 4,
    environment: { ...DEFAULT_ENVIRONMENT },
    trackPoints: defaultTrackPoints(),
    spawnTable: [
      { kind: "person1", weight: 3, scale: 1.0 },
      { kind: "person2", weight: 3, scale: 1.0 },
      { kind: "person3", weight: 2, scale: 1.0 },
      { kind: "personboss", weight: 1, scale: 1.0 },
      { kind: "log", weight: 2, scale: 1.0 },
    ],
    obstacles: [],
  };
}

export function normalizeLevel(l) {
  const rawPts =
    Array.isArray(l.trackPoints) && l.trackPoints.length >= 2
      ? l.trackPoints.map((p) => ({
          x: p.x || 0,
          y: Math.max(0, p.y || 0),
          z: p.z || 0,
          // Per-lane deltas: [{dx,dy} | null, ...] — the split-rail data.
          laneDeltas: Array.isArray(p.laneDeltas)
            ? p.laneDeltas.map((d) =>
                d && typeof d === "object"
                  ? { dx: Number(d.dx) || 0, dy: Number(d.dy) || 0 }
                  : null
              )
            : [null, null, null],
        }))
      : defaultTrackPoints();
  // Snap the last control point to match the first in x/y so loop tiling
  // produces a seamless join. Only z is allowed to differ — that's the
  // length of one loop.
  if (rawPts.length >= 2) {
    const first = rawPts[0];
    rawPts[rawPts.length - 1] = {
      ...rawPts[rawPts.length - 1],
      x: first.x,
      y: first.y,
      // Also snap the last point's laneDeltas to match the first — otherwise
      // rails start/end at different lateral positions at the seam.
      laneDeltas: (first.laneDeltas || [null, null, null]).map((d) =>
        d ? { dx: d.dx, dy: d.dy } : null
      ),
    };
  }
  // Cap the vertical slope between consecutive control points. Very steep
  // slopes (dy/dz > ~0.5) push the spline tangent close to vertical, which
  // makes the frame math flip 180° and the whole level renders upside-down
  // partway through the loop.
  const MAX_Y_SLOPE = 0.5;
  for (let i = 1; i < rawPts.length; i++) {
    const dz = Math.max(0.01, rawPts[i].z - rawPts[i - 1].z);
    const dy = rawPts[i].y - rawPts[i - 1].y;
    const maxDy = MAX_Y_SLOPE * dz;
    if (Math.abs(dy) > maxDy) {
      rawPts[i] = {
        ...rawPts[i],
        y: Math.max(0, rawPts[i - 1].y + Math.sign(dy) * maxDy),
      };
    }
  }
  // Guardrail divergences: minimum span so the sin² taper isn't compressed
  // into a near-vertical zigzag, and cap the lateral rate so the train
  // doesn't slow down noticeably when it passes through.
  const MIN_DIV_SPAN = 0.06;
  const MAX_DIV_RATE = 40; // |offset| per unit of u
  const divergences = Array.isArray(l.divergences)
    ? l.divergences
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const lane = Math.max(0, Math.min(2, Number(d.lane) || 0));
          let startU = Math.max(0, Math.min(1, Number(d.startU) || 0));
          let endU = Math.max(0, Math.min(1, Number(d.endU) || 0));
          if (endU < startU + MIN_DIV_SPAN) endU = startU + MIN_DIV_SPAN;
          if (endU > 1) {
            endU = 1;
            startU = Math.max(0, 1 - MIN_DIV_SPAN);
          }
          let offset = Number(d.offset) || 0;
          const rate = Math.abs(offset) / (endU - startU);
          if (rate > MAX_DIV_RATE) {
            offset = Math.sign(offset) * MAX_DIV_RATE * (endU - startU);
          }
          return { lane, startU, endU, offset };
        })
        .filter(Boolean)
    : [];
  // Migrate the spawn table. Any obsolete kind in the saved data means the
  // level was created before the person-sprite overhaul — those levels get
  // the fresh default table so the user actually sees the new obstacle
  // variety instead of 3× the same migrated fallback.
  const rawTable = Array.isArray(l.spawnTable) ? l.spawnTable : [];
  const hadObsoleteKind = rawTable.some(
    (row) =>
      row && typeof row === "object" && row.kind in KIND_MIGRATIONS
  );
  let spawnTable;
  if (hadObsoleteKind || rawTable.length === 0) {
    spawnTable = defaultSpawnTable();
  } else {
    spawnTable = rawTable
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        if (!OBSTACLE_KINDS[row.kind]) return null;
        return {
          kind: row.kind,
          weight: Math.max(0, Number(row.weight) || 0),
          scale: Number(row.scale) > 0 ? Number(row.scale) : 1,
        };
      })
      .filter(Boolean);
    if (!spawnTable.length) spawnTable = defaultSpawnTable();
  }

  const difficulty = ["easy", "medium", "hard"].includes(l.difficulty)
    ? l.difficulty
    : "medium";
  return {
    mode: "random",
    environment: { ...DEFAULT_ENVIRONMENT },
    trackPoints: defaultTrackPoints(),
    obstacles: [],
    ...l,
    environment: { ...DEFAULT_ENVIRONMENT, ...(l.environment || {}) },
    trackPoints: rawPts,
    divergences,
    difficulty,
    spawnTable,
    // Migrate old-style sequence items (with z) to new obstacles (with u)
    obstacles:
      Array.isArray(l.obstacles) && l.obstacles.length
        ? l.obstacles
        : Array.isArray(l.sequence)
        ? l.sequence.map((it) => ({
            id: it.id,
            kind: it.kind,
            span: it.span || "lane",
            laneIndex: it.laneIndex ?? 1,
            u:
              typeof it.u === "number"
                ? it.u
                : Math.max(
                    0,
                    Math.min(0.999, (it.z || 0) / (l.loopLength || 100))
                  ),
            scale: it.scale ?? 1,
          }))
        : [],
  };
}

function isBrowser() {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function loadCustomLevels() {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && typeof l === "object" && l.id)
      .map(normalizeLevel);
  } catch {
    return [];
  }
}

export function saveCustomLevels(levels) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}

export function upsertCustomLevel(level) {
  const list = loadCustomLevels();
  const idx = list.findIndex((l) => l.id === level.id);
  const normalized = normalizeLevel(level);
  if (idx >= 0) list[idx] = normalized;
  else list.push(normalized);
  saveCustomLevels(list);
  return list;
}

export function deleteCustomLevel(id) {
  const list = loadCustomLevels().filter((l) => l.id !== id);
  saveCustomLevels(list);
  return list;
}

export function loadStats() {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function recordPlay(levelId) {
  const stats = loadStats();
  const s = stats[levelId] ?? { plays: 0, likes: 0, best: 0 };
  s.plays += 1;
  stats[levelId] = s;
  saveStats(stats);
  return stats;
}

export function recordBest(levelId, score) {
  const stats = loadStats();
  const s = stats[levelId] ?? { plays: 0, likes: 0, best: 0 };
  if (score > s.best) s.best = score;
  stats[levelId] = s;
  saveStats(stats);
  return stats;
}

export function toggleLike(levelId) {
  const stats = loadStats();
  const s = stats[levelId] ?? { plays: 0, likes: 0, best: 0 };
  s.likes = s.likes ? 0 : 1;
  stats[levelId] = s;
  saveStats(stats);
  return stats;
}

export function getAllLevels() {
  return [...BUILTIN_LEVELS, ...loadCustomLevels()];
}

export function sortLevels(levels, stats, sortBy) {
  const key = (l) => {
    const s = stats[l.id] ?? { plays: 0, likes: 0 };
    if (sortBy === "plays") return s.plays;
    if (sortBy === "likes") return s.likes;
    if (sortBy === "date") return new Date(l.createdAt).getTime() || 0;
    return 0;
  };
  return [...levels].sort((a, b) => key(b) - key(a));
}
