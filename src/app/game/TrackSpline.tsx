"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { LANES } from "./constants";
import {
  buildCurve,
  divergedLanesFromPoints,
  frameAt,
  laneDeltaAt,
} from "./spline";

const RAIL_OFFSET = 0.75;
const TIE_SPACING_ARC = 2.5;
const RAIL_RADIUS = 0.11;
const TUBE_RADIAL = 8;

type TrackSplineProps = {
  trackPoints: any;
  [extra: string]: any;
};

export default function TrackSpline({ trackPoints }: TrackSplineProps) {
  const { curve, arcLength, closed } = useMemo(
    () => buildCurve(trackPoints),
    [trackPoints]
  );

  const { railGeoms, ties } = useMemo(() => {
    const railGeoms = [];
    const rSamples = Math.max(200, Math.floor(arcLength * 3));

    // 3 lane centers × 2 rails each.
    for (let laneIdx = 0; laneIdx < 3; laneIdx++) {
      for (const off of [-RAIL_OFFSET, RAIL_OFFSET]) {
        const pts = [];
        const iMax = closed ? rSamples : rSamples + 1;
        for (let i = 0; i < iMax; i++) {
          const uRaw = i / rSamples;
          const u = closed ? uRaw : Math.min(0.99999, uRaw);
          const f = frameAt(curve, u);
          const delta = laneDeltaAt(u, laneIdx, trackPoints);
          const totalLateral = LANES[laneIdx] + delta.dx + off;
          pts.push(
            f.point
              .clone()
              .add(f.right.clone().multiplyScalar(totalLateral))
              .add(new THREE.Vector3(0, 0.12 + delta.dy, 0))
          );
        }
        const offsetCurve = new THREE.CatmullRomCurve3(
          pts,
          closed,
          "catmullrom"
        );
        const tube = new THREE.TubeGeometry(
          offsetCurve,
          Math.max(pts.length - 1, 100),
          RAIL_RADIUS,
          TUBE_RADIAL,
          closed
        );
        railGeoms.push(tube);
      }
    }

    const tieCount = Math.max(4, Math.floor(arcLength / TIE_SPACING_ARC));
    const ties = [];
    for (let i = 0; i < tieCount; i++) {
      const u = i / tieCount;
      const f = frameAt(curve, u);
      const rot = new THREE.Matrix4().makeBasis(f.right, f.up, f.tangent);
      const quat = new THREE.Quaternion().setFromRotationMatrix(rot);
      // If any lane has a non-zero delta here, draw short per-lane ties
      // instead of one long cross-tie stretching over the gap.
      const diverged = divergedLanesFromPoints(u, trackPoints);
      if (diverged.size > 0) {
        for (let laneIdx = 0; laneIdx < 3; laneIdx++) {
          const delta = laneDeltaAt(u, laneIdx, trackPoints);
          const lateral = LANES[laneIdx] + delta.dx;
          const pos = f.point
            .clone()
            .add(f.right.clone().multiplyScalar(lateral))
            .add(new THREE.Vector3(0, 0.02 + delta.dy, 0));
          ties.push({ key: `t${i}-${laneIdx}`, pos, quat, width: 1.9 });
        }
      } else {
        ties.push({
          key: `t${i}`,
          pos: f.point.clone().add(f.up.clone().multiplyScalar(0.02)),
          quat,
          width: 7.5,
        });
      }
    }

    return { railGeoms, ties };
  }, [curve, arcLength, closed, trackPoints]);

  return (
    <group>
      {railGeoms.map((g, i) => (
        <mesh key={`r${i}`} geometry={g} castShadow>
          <meshStandardMaterial
            color="#a9adb2"
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
      ))}
      {ties.map((t) => (
        <mesh
          key={t.key}
          position={t.pos}
          quaternion={t.quat}
          receiveShadow
        >
          <boxGeometry args={[t.width, 0.12, 0.5]} />
          <meshStandardMaterial color="#3a2e22" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
