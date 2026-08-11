"use client";

import * as THREE from "three";
import { LANES } from "./constants";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Lateral offset of a lane's center at parameter u, honoring any active
// divergences. Each divergence has { startU, endU, lane, offset } — during
// that u-range the given lane's center moves sideways by `offset` with a
// C1-continuous sin² taper: 0 at both endpoints AND zero slope at both
// endpoints, so the rail meets the main track smoothly instead of kinking.
export function laneOffsetAt(u, laneIdx, divergences) {
  let out = LANES[laneIdx];
  if (!divergences || !divergences.length) return out;
  const localU = ((u % 1) + 1) % 1;
  for (const d of divergences) {
    if (d.lane !== laneIdx) continue;
    if (localU < d.startU || localU > d.endU) continue;
    const t = (localU - d.startU) / (d.endU - d.startU);
    const s = Math.sin(t * Math.PI);
    out += s * s * d.offset;
  }
  return out;
}

// Is any divergence currently active (any lane physically separated)?
export function isDivergenceActive(u, divergences) {
  if (!divergences || !divergences.length) return false;
  const localU = ((u % 1) + 1) % 1;
  for (const d of divergences) {
    if (localU >= d.startU && localU <= d.endU) return true;
  }
  return false;
}

// Set of lane indices that are currently on a diverged rail at u. Switching
// INTO or OUT OF any of these is illegal — but the other two lanes can still
// swap between themselves.
export function divergedLanesAt(u, divergences) {
  const out = new Set();
  if (!divergences || !divergences.length) return out;
  const localU = ((u % 1) + 1) % 1;
  for (const d of divergences) {
    if (localU >= d.startU && localU <= d.endU) out.add(d.lane);
  }
  return out;
}

// New model: each track point may carry per-lane deltas (dx, dy) that
// override that lane's position at that control point. Interpolate between
// consecutive points with smoothstep so transitions are C1-continuous and
// the rail never kinks.
//
// laneDeltas: [{dx, dy} | null, {dx, dy} | null, {dx, dy} | null]  per point
export function laneDeltaAt(u, laneIdx, trackPoints) {
  if (!trackPoints || trackPoints.length < 2) return { dx: 0, dy: 0 };
  const localU = ((u % 1) + 1) % 1;
  const N = trackPoints.length;
  // Uniform u-per-point mapping — points evenly spaced in u. Good enough
  // for interpolation of deltas; the geometry itself uses the base curve.
  const seg = localU * (N - 1);
  const i0 = Math.min(N - 2, Math.floor(seg));
  const t = seg - i0;
  const smooth = t * t * (3 - 2 * t); // smoothstep
  const a = trackPoints[i0].laneDeltas?.[laneIdx] || null;
  const b = trackPoints[i0 + 1].laneDeltas?.[laneIdx] || null;
  const ax = a?.dx || 0;
  const ay = a?.dy || 0;
  const bx = b?.dx || 0;
  const by = b?.dy || 0;
  return {
    dx: ax + (bx - ax) * smooth,
    dy: ay + (by - ay) * smooth,
  };
}

// Which lanes are diverged (non-zero delta) at u — from the trackpoint
// model. Same semantics as divergedLanesAt but derived from per-point
// laneDeltas instead of the old {startU,endU,offset} tuples.
export function divergedLanesFromPoints(u, trackPoints) {
  const out = new Set();
  const THRESHOLD = 0.5;
  for (let i = 0; i < 3; i++) {
    const d = laneDeltaAt(u, i, trackPoints);
    if (Math.abs(d.dx) > THRESHOLD || Math.abs(d.dy) > THRESHOLD) out.add(i);
  }
  return out;
}

// Wraps another curve and remaps the [0, 1] parameter to a sub-interval of
// the inner curve. THREE.Curve's higher-level API (getPointAt, getTangentAt,
// computeFrenetFrames, getLength) all cascade through getPoint(), so we only
// need to override that one method.
//
// IMPORTANT: uStart/uEnd here are `t`-values in the inner curve's parameter
// space (Catmull-Rom knots), NOT arc-length fractions. We must call
// inner.getPoint(t), NOT inner.getPointAt(u) — mixing them up double-applies
// the arc-length remap and desyncs positions at the loop seam.
class WrappedCurve extends THREE.Curve<THREE.Vector3> {
  inner: THREE.Curve<THREE.Vector3>;
  uStart: number;
  uSpan: number;
  constructor(
    inner: THREE.Curve<THREE.Vector3>,
    uStart: number,
    uEnd: number
  ) {
    super();
    this.inner = inner;
    this.uStart = uStart;
    this.uSpan = uEnd - uStart;
  }
  getPoint(t: number, target?: THREE.Vector3): THREE.Vector3 {
    const t2 = this.uStart + t * this.uSpan;
    return this.inner.getPoint(t2, target);
  }
}

export function buildCurve(trackPoints) {
  const pts = (trackPoints || []).map(
    (p) => new THREE.Vector3(p.x, p.y, p.z)
  );
  if (pts.length < 2) {
    pts.push(new THREE.Vector3(0, 0, 0));
    pts.push(new THREE.Vector3(0, 0, 30));
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  // Close only when endpoints coincide — otherwise treat the level as an
  // "open" segment that gets tiled by the loop offset.
  const closed = first.distanceTo(last) < 6;

  let curve;
  let arcLength;

  if (closed) {
    curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    arcLength = curve.getLength();
  } else {
    // Extend the point list on both sides with ghost control points derived
    // from the neighbouring loop tile (offset = last - first). Sampling the
    // interior region [uStart, uEnd] then gives a curve whose tangent at
    // u=0 matches the tangent that the next tile's u=1 would produce, so
    // the seam between loops is C1-continuous instead of visibly kinked.
    const loopOffset = new THREE.Vector3().subVectors(last, first);
    const pre = pts[pts.length - 2].clone().sub(loopOffset);
    const post = pts[1].clone().add(loopOffset);
    const extended = [pre, ...pts, post];
    const inner = new THREE.CatmullRomCurve3(
      extended,
      false,
      "centripetal"
    );
    const N = pts.length;
    // With N + 2 control points, the original first sits at parameter
    // 1/(N+1) and the original last at N/(N+1).
    const uStart = 1 / (N + 1);
    const uEnd = N / (N + 1);
    curve = new WrappedCurve(inner, uStart, uEnd);
    arcLength = curve.getLength();
  }
  return { curve, arcLength, closed };
}

// Orthonormal frame at parameter u along the curve.
// In three.js (right-handed), with forward = +Z and up = +Y, right = X = Y × Z.
// So right = worldUp × tangent, then up = tangent × right.
export function frameAt(curve, u) {
  const clamped = ((u % 1) + 1) % 1;
  const point = curve.getPointAt(clamped);
  // Never let the interpolated curve dip below ground — centripetal
  // catmullrom can overshoot between control points even when every input
  // point has y >= 0.
  if (point.y < 0) point.y = 0;
  const tangent = curve.getTangentAt(clamped).normalize();
  const right = new THREE.Vector3()
    .crossVectors(WORLD_UP, tangent)
    .normalize();
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
  return { point, tangent, right, up };
}

// Return `true` if the arc-length interval (prevU, prevU + deltaU) — modulo 1 —
// contains targetU.
export function crossedU(prevU, deltaU, targetU) {
  const d = (((targetU - prevU) % 1) + 1) % 1;
  return d >= 0 && d <= deltaU;
}
