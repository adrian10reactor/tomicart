"use client";

import React, { forwardRef, useEffect, useMemo, useState } from "react";
import * as THREE from "three";

// Shared texture cache so we don't reload the same PNG per obstacle instance.
const TEXTURE_CACHE = new Map();

function loadTexture(url, onReady) {
  const cached = TEXTURE_CACHE.get(url);
  if (cached === "pending") return;
  if (cached) {
    onReady(cached);
    return;
  }
  TEXTURE_CACHE.set(url, "pending");
  new THREE.TextureLoader().load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      TEXTURE_CACHE.set(url, tex);
      onReady(tex);
    },
    undefined,
    () => {
      TEXTURE_CACHE.delete(url);
    }
  );
}

function usePersonTexture(url) {
  const [tex, setTex] = useState(() => {
    const cached = TEXTURE_CACHE.get(url);
    return cached && cached !== "pending" ? cached : null;
  });
  useEffect(() => {
    let cancelled = false;
    loadTexture(url, (t) => {
      if (!cancelled) setTex(t);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return tex;
}

// A person standing on the track — a flat sprite facing down-track (toward
// the oncoming train). Rendered slightly wider for the boss.
function Person({ url, isBoss = false }) {
  const tex = usePersonTexture(url);
  // Fixed sizes — level `scale` is ignored for people (see Obstacle below).
  // Boss is 20% smaller than before (was 1.92 x 2.4) — now roughly the same
  // volume as a regular person, just marked visually by the darker red side
  // colour instead of a floating tag.
  const width = isBoss ? 1.54 : 1.28;
  const height = isBoss ? 1.92 : 1.92;
  const depth = width;
  const sideTint = isBoss ? "#5a1a1a" : "#243244";
  // Six materials for the six box faces so we can put the photo on the two
  // sides the player actually sees (down-track front and back) and a solid
  // colour on the other four. Face order in BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
  // Obstacles are placed with their local +Z pointing along the track
  // tangent — so +Z faces the exit side and -Z faces the incoming train.
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({
      color: sideTint,
      roughness: 0.7,
    });
    const top = new THREE.MeshStandardMaterial({
      color: isBoss ? "#3a1010" : "#1a2434",
      roughness: 0.8,
    });
    const bottom = new THREE.MeshStandardMaterial({
      color: "#111",
      roughness: 0.9,
    });
    const face = tex
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : new THREE.MeshStandardMaterial({ color: sideTint });
    return [side, side, top, bottom, face, face];
  }, [tex, sideTint, isBoss]);
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow material={materials}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
    </group>
  );
}

// Full-width (jumpable) obstacles ----------------------------------------

function Log() {
  return (
    <group>
      <mesh
        position={[0, 0.4, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.4, 0.4, 8, 16]} />
        <meshStandardMaterial color="#5a3b22" roughness={0.95} />
      </mesh>
      {[-4, 4].map((x) => (
        <mesh key={x} position={[x, 0.4, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.4, 0.4, 0.02, 16]} />
          <meshStandardMaterial color="#3f2814" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Sleepers() {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, 0.18 + i * 0.28, i * 0.05]}
          castShadow
        >
          <boxGeometry args={[7.4, 0.28, 0.6]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// Map every "lane" obstacle kind to a person sprite. The 3D shapes are gone —
// people replace them. `personboss` triggers the "Fired" crash message.
const PERSON_URLS = {
  person1: "/person1.png",
  person2: "/person2.png",
  person3: "/person3.png",
  personboss: "/personboss.png",
};

function makePersonRenderer(url, isBoss = false) {
  return function PersonKind() {
    return <Person url={url} isBoss={isBoss} />;
  };
}

const KIND_COMPONENTS = {
  person1: makePersonRenderer(PERSON_URLS.person1),
  person2: makePersonRenderer(PERSON_URLS.person2),
  person3: makePersonRenderer(PERSON_URLS.person3),
  personboss: makePersonRenderer(PERSON_URLS.personboss, true),
  log: Log,
};

// Person sprites are drawn at a fixed size — level scale is ignored for them.
const FIXED_SCALE_KINDS = new Set([
  "person1",
  "person2",
  "person3",
  "personboss",
]);

export type ObstacleProps = {
  kind: string;
  scale?: number;
  meta?: { lanes?: number };
};

// Renders the shape at (0, 0, 0). Caller is responsible for positioning it.
const Obstacle = forwardRef<any, ObstacleProps>(function Obstacle(
  { kind, scale = 1 },
  ref
) {
  const Component = (KIND_COMPONENTS as Record<string, React.FC>)[kind];
  if (!Component) return <group ref={ref} />;
  const appliedScale = FIXED_SCALE_KINDS.has(kind) ? 1 : scale;
  return (
    <group ref={ref} scale={appliedScale}>
      <Component />
    </group>
  );
});

export default Obstacle;
