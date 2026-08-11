"use client";

import { forwardRef, useMemo } from "react";
import { LANES, TIE_SPACING } from "./constants";

const TIE_COUNT = 48;
const START_Z = -80;
const RAIL_OFFSET = 0.75;
const TIE_WIDTH = 1.7;
const RAIL_LENGTH = 400;

type TrackProps = {
  environment?: { groundColor?: string; ballastColor?: string };
  showFullLength?: boolean;
};

const Track = forwardRef<any, TrackProps>(function Track(
  { environment = {}, showFullLength = false },
  tiesGroupRef
) {
  const ties = useMemo(
    () =>
      Array.from({ length: TIE_COUNT }, (_, i) => ({
        key: i,
        z: START_Z + i * TIE_SPACING,
      })),
    []
  );

  const groundColor = environment.groundColor || "#2b2f24";
  const ballastColor = environment.ballastColor || "#4a4137";
  const railLen = showFullLength ? 300 : RAIL_LENGTH;
  const railCenter = showFullLength ? -100 : -20;

  return (
    <group>
      <mesh
        position={[0, -0.05, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[120, 800]} />
        <meshStandardMaterial color={groundColor} roughness={1} />
      </mesh>

      {LANES.map((x) => (
        <mesh
          key={`ballast-${x}`}
          position={[x, -0.01, railCenter]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[2.0, railLen]} />
          <meshStandardMaterial color={ballastColor} roughness={1} />
        </mesh>
      ))}

      <group ref={tiesGroupRef}>
        {ties.map((t) =>
          LANES.map((x) => (
            <mesh
              key={`${t.key}-${x}`}
              position={[x, 0.02, t.z]}
              receiveShadow
            >
              <boxGeometry args={[TIE_WIDTH, 0.12, 0.5]} />
              <meshStandardMaterial color="#3a2e22" roughness={0.9} />
            </mesh>
          ))
        )}
      </group>

      {LANES.flatMap((x) =>
        [x - RAIL_OFFSET, x + RAIL_OFFSET].map((rx) => (
          <mesh
            key={`rail-${rx}`}
            position={[rx, 0.14, railCenter]}
            castShadow
          >
            <boxGeometry args={[0.12, 0.14, railLen]} />
            <meshStandardMaterial
              color="#a9adb2"
              metalness={0.7}
              roughness={0.35}
            />
          </mesh>
        ))
      )}
    </group>
  );
});

export default Track;
export { TIE_COUNT, START_Z };
