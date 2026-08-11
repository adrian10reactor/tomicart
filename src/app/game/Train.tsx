"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { TRAIN_HEAD_URL } from "./constants";

function useOptionalTexture(url) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        setTexture(tex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [url]);
  return texture;
}

// Train faces +z (toward the camera). Front of the box has the face image;
// the train physically travels toward the camera, so the face grows.
const Train = forwardRef(function Train(_props, ref) {
  const headTexture = useOptionalTexture(TRAIN_HEAD_URL);

  const bodyMaterials = useMemo(() => {
    const blue = new THREE.MeshStandardMaterial({
      color: "#1f4fa8",
      roughness: 0.55,
    });
    const faceMat = headTexture
      ? new THREE.MeshBasicMaterial({ map: headTexture, toneMapped: false })
      : new THREE.MeshStandardMaterial({ color: "#eaeaea", roughness: 0.5 });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Front is +z (index 4).
    return [blue, blue, blue, blue, faceMat, blue];
  }, [headTexture]);

  return (
    <group ref={ref} position={[0, 0, 0]}>
      {/* Main body — face image is on the +z (front) face */}
      <mesh position={[0, 1.0, 0]} castShadow material={bodyMaterials}>
        <boxGeometry args={[1.8, 1.4, 3.5]} />
      </mesh>

      {/* Fallback painted face if no texture */}
      {!headTexture && (
        <group position={[0, 1.0, 1.751]}>
          <mesh position={[-0.42, 0.22, 0]}>
            <circleGeometry args={[0.18, 24]} />
            <meshBasicMaterial color="#111" />
          </mesh>
          <mesh position={[0.42, 0.22, 0]}>
            <circleGeometry args={[0.18, 24]} />
            <meshBasicMaterial color="#111" />
          </mesh>
          <mesh position={[0, -0.32, 0]}>
            <planeGeometry args={[0.9, 0.14]} />
            <meshBasicMaterial color="#111" />
          </mesh>
        </group>
      )}

      {/* Cabin at the rear */}
      <mesh position={[0, 1.95, -1.15]} castShadow>
        <boxGeometry args={[1.6, 1.1, 1.2]} />
        <meshStandardMaterial color="#7a1414" roughness={0.5} />
      </mesh>

      {/* Portrait plate on the rear of the cabin (visible from chase cam) */}
      {headTexture ? (
        <mesh position={[0, 1.95, -1.76]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.5, 1.05]} />
          <meshBasicMaterial map={headTexture} toneMapped={false} />
        </mesh>
      ) : (
        <mesh position={[0, 2.1, -1.75]}>
          <boxGeometry args={[1.2, 0.5, 0.04]} />
          <meshStandardMaterial color="#3f5c74" metalness={0.4} roughness={0.2} />
        </mesh>
      )}

      {/* Chimney near the front */}
      <mesh position={[0, 2.0, 1.0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.9, 20]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.55, 1.0]}>
        <cylinderGeometry args={[0.34, 0.22, 0.15, 20]} />
        <meshStandardMaterial color="#111" roughness={0.7} />
      </mesh>

      {/* Cowcatcher at the front */}
      <mesh
        position={[0, 0.4, 1.9]}
        rotation={[Math.PI / 6, 0, 0]}
        castShadow
      >
        <boxGeometry args={[1.8, 0.6, 0.2]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.6} />
      </mesh>

      {/* Wheels */}
      {[-1.2, 0, 1.2].map((z) =>
        [-0.95, 0.95].map((x) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, 0.35, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.35, 0.35, 0.15, 20]} />
            <meshStandardMaterial color="#111" roughness={0.6} />
          </mesh>
        ))
      )}
    </group>
  );
});

export default Train;
