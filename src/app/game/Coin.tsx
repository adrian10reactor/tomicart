"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const COIN_URL = "/reactor.png";

// Shared texture — one load for every coin instance.
let cachedTexture: THREE.Texture | null = null;
let cachedPromise: Promise<THREE.Texture | null> | null = null;
function useCoinTexture() {
  const [tex, setTex] = useState(cachedTexture);
  useEffect(() => {
    if (cachedTexture) {
      setTex(cachedTexture);
      return;
    }
    if (!cachedPromise) {
      cachedPromise = new Promise((resolve) => {
        new THREE.TextureLoader().load(
          COIN_URL,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 8;
            cachedTexture = t;
            resolve(t);
          },
          undefined,
          () => resolve(null)
        );
      });
    }
    let cancelled = false;
    cachedPromise.then((t) => {
      if (!cancelled) setTex(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return tex;
}

// A floating reactor-logo cube. The four vertical faces (±X, ±Z) show the
// logo; top and bottom are a solid neutral colour. The whole cube slowly
// spins around its local up axis so any side you look at eventually shows
// the logo.
export default function Coin() {
  const tex = useCoinTexture();
  const groupRef = useRef<THREE.Mesh>(null);
  const materials = useMemo(() => {
    const capMat = new THREE.MeshBasicMaterial({
      color: "#111827",
      toneMapped: false,
    });
    if (!tex) {
      const solid = new THREE.MeshBasicMaterial({
        color: "#ffd23f",
        toneMapped: false,
      });
      return [solid, solid, capMat, capMat, solid, solid];
    }
    const faceMat = new THREE.MeshBasicMaterial({
      map: tex,
      toneMapped: false,
    });
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z. Top and bottom (±Y)
    // stay neutral; the four sides carry the logo.
    return [faceMat, faceMat, capMat, capMat, faceMat, faceMat];
  }, [tex]);
  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 2.4;
  });
  const size = 0.7;
  return (
    <group position={[0, 1.7, 0]}>
      <mesh ref={groupRef} material={materials}>
        <boxGeometry args={[size, size, size]} />
      </mesh>
    </group>
  );
}
