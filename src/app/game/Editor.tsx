"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TrackSpline from "./TrackSpline";
import {
  DEFAULT_ENVIRONMENT,
  defaultTrackPoints,
  getAllLevels,
  makeEmptyLevel,
  upsertCustomLevel,
} from "./levels";
import { getNickname } from "./player";
import { upsertCloudLevel } from "./supabase";

// --------------------- 3D scene contents ---------------------

function EditorScene({
  level,
  selection,
  onSelect,
  onPointMove,
  environment,
  sunRef,
}: any) {
  const orbitRef = useRef<any>(null);
  const { camera } = useThree();
  const [transforming, setTransforming] = useState(false);

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

  const pointRefs = useRef(new Map<string, any>());
  useEffect(() => {
    const validKeys = new Set(
      (level.trackPoints || []).map((_: any, i: number) => `pt-${i}`)
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

      <TrackSpline trackPoints={level.trackPoints} />

      {(level.trackPoints || []).map((p: any, i: number) => {
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

function LeftPalette({ onAddPoint }: { onAddPoint: () => void }) {
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

      <div className="text-[11px] text-white/50 mt-4 leading-relaxed">
        Drag the <span className="text-blue-300">blue spheres</span> to shape
        the track. Obstacles spawn automatically — tune the density with{" "}
        <b>Difficulty</b> on the right.
      </div>
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
};

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: NumberFieldProps) {
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

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
}: any) {
  const selectedPointIdx =
    selection?.type === "point"
      ? parseInt(selection.id.replace("pt-", ""), 10)
      : -1;
  const selectedPoint =
    selectedPointIdx >= 0 ? level.trackPoints[selectedPointIdx] : null;

  const setEnv = (patch: any) =>
    setLevel({
      ...level,
      environment: { ...(level.environment || DEFAULT_ENVIRONMENT), ...patch },
    });

  const updatePoint = (i: number, patch: any) =>
    setLevel({
      ...level,
      trackPoints: level.trackPoints.map((p: any, idx: number) =>
        idx === i ? { ...p, ...patch } : p
      ),
    });

  return (
    <div className="w-96 border-l border-white/10 overflow-y-auto min-h-0 p-5 shrink-0 text-sm bg-neutral-950/60">
      {selectedPoint ? (
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
        </div>
      ) : (
        <div className="text-white/50 mb-2">
          Click a blue sphere to edit a track point. Obstacles spawn
          automatically — control how many with Difficulty below.
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

type EditorProps = {
  levelId: string;
  onBack?: () => void;
  onSave?: (level: any) => void;
  onPlay?: (level: any) => void;
};

export default function Editor({ levelId, onBack, onSave, onPlay }: EditorProps) {
  const [level, setLevel] = useState<any>(() => {
    const all = getAllLevels();
    return all.find((l: any) => l.id === levelId) ?? makeEmptyLevel();
  });
  const [selection, setSelection] = useState<any>(null);
  const sunRef = useRef<any>(null);

  useEffect(() => {
    const all = getAllLevels();
    const found = all.find((l: any) => l.id === levelId);
    if (found) setLevel(found);
  }, [levelId]);

  const addTrackPoint = useCallback(() => {
    setLevel((l: any) => {
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

  const onPointMove = useCallback((idx: number, pos: any) => {
    const clamped = { x: pos.x, y: Math.max(0, pos.y), z: pos.z };
    setLevel((l: any) => ({
      ...l,
      trackPoints: l.trackPoints.map((p: any, i: number) =>
        i === idx ? { ...p, ...clamped } : p
      ),
    }));
  }, []);

  const onDelete = useCallback(() => {
    if (!selection) return;
    if (selection.type === "point") {
      const idx = parseInt(selection.id.replace("pt-", ""), 10);
      setLevel((l: any) => {
        if ((l.trackPoints || []).length <= 2) return l;
        return {
          ...l,
          trackPoints: l.trackPoints.filter((_: any, i: number) => i !== idx),
        };
      });
    }
    setSelection(null);
  }, [selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const a = document.activeElement as HTMLElement | null;
        if (
          a &&
          (a.tagName === "INPUT" ||
            a.tagName === "TEXTAREA" ||
            a.tagName === "SELECT")
        )
          return;
        onDelete();
      }
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDelete]);

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
    onPlay?.(withAuthor);
  };

  return (
    <div className="h-screen w-full bg-neutral-950 text-white flex flex-col overflow-hidden">
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
            {(level.trackPoints || []).length} pts
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
        <LeftPalette onAddPoint={addTrackPoint} />

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
        />
      </div>
    </div>
  );
}
