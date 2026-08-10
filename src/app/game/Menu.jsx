"use client";

import { useEffect, useMemo, useState } from "react";
import {
  startMusic,
  stopAllAudio,
  subscribeMute,
  toggleMusicMuted,
  unlockAudio,
} from "./audio";
import {
  BUILTIN_LEVELS,
  deleteCustomLevel,
  getAllLevels,
  loadCustomLevels,
  loadStats,
  makeEmptyLevel,
  saveCustomLevels,
  sortLevels,
  toggleLike,
  upsertCustomLevel,
} from "./levels";

const SORTS = [
  { key: "plays", label: "Most played" },
  { key: "likes", label: "Liked" },
  { key: "date", label: "Newest" },
];

export default function Menu({ onPlay, onEdit }) {
  // Initial state MUST match between server and client. localStorage-backed
  // data loads in a mount effect below.
  const [levels, setLevels] = useState(BUILTIN_LEVELS);
  const [stats, setStats] = useState({});
  const [sortBy, setSortBy] = useState("plays");
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  const refresh = () => {
    setLevels(getAllLevels());
    setStats(loadStats());
  };

  useEffect(() => {
    refresh();
  }, []);

  // Music runs on the menu too. Autoplay needs a user gesture — we call
  // startMusic() once here and then again from any click/keydown below.
  const [muteState, setMuteState] = useState({ sfx: false, music: false });
  useEffect(() => {
    const unsub = subscribeMute(setMuteState);
    startMusic();
    const onFirst = () => {
      unlockAudio();
      startMusic();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    window.addEventListener("pointerdown", onFirst);
    window.addEventListener("keydown", onFirst);
    // Kill every audio element when this tab is closing so nothing lingers.
    const onUnload = () => stopAllAudio();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      unsub();
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, []);

  const sorted = useMemo(
    () => sortLevels(levels, stats, sortBy),
    [levels, stats, sortBy]
  );

  const onCreate = () => {
    const level = makeEmptyLevel("Untitled level");
    upsertCustomLevel(level);
    refresh();
    onEdit(level.id);
  };

  const onDelete = (id) => {
    if (!confirm("Delete this level?")) return;
    deleteCustomLevel(id);
    refresh();
  };

  const onLike = (id) => {
    toggleLike(id);
    setStats(loadStats());
  };

  const onImport = () => {
    setJsonError("");
    try {
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const existing = loadCustomLevels();
      const byId = new Map(existing.map((l) => [l.id, l]));
      for (const l of list) {
        if (!l || !l.id || !l.name || !Array.isArray(l.spawnTable)) {
          throw new Error("Invalid level shape");
        }
        byId.set(l.id, { ...l, builtIn: false });
      }
      saveCustomLevels(Array.from(byId.values()));
      setShowJson(false);
      setJsonText("");
      refresh();
    } catch (e) {
      setJsonError(String(e.message || e));
    }
  };

  const onExportAll = () => {
    const list = loadCustomLevels();
    const json = JSON.stringify(list, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tomicart-levels.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExportOne = (level) => {
    const json = JSON.stringify(level, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${level.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl font-semibold tracking-tight mb-1">
              Tomicart
            </h1>
            <p className="text-white/60 text-sm">
              Steer the oncoming train past what&apos;s on the tracks.
              &nbsp;·&nbsp;
              <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">←</kbd>
              /
              <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">→</kbd>
              switch &nbsp;·&nbsp;
              <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">
                Space
              </kbd>
              jump
            </p>
          </div>
          <button
            onClick={toggleMusicMuted}
            className={
              "shrink-0 mt-1 rounded-full px-3 py-1.5 text-xs border transition " +
              (muteState.music
                ? "bg-white/5 border-white/20 text-white/60 hover:bg-white/10"
                : "bg-cyan-500/15 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/25")
            }
            title="Toggle music"
          >
            {muteState.music ? "🎵 Music off" : "🎵 Music on"}
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-white/60 text-sm">Sort by:</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`text-sm rounded-full px-3 py-1 border ${
                sortBy === s.key
                  ? "bg-white text-black border-white"
                  : "border-white/20 text-white/80 hover:border-white/40"
              }`}
            >
              {s.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={onCreate}
              className="text-sm rounded-full bg-white text-black px-4 py-1.5 hover:bg-white/90"
            >
              + New level
            </button>
            <button
              onClick={() => setShowJson((v) => !v)}
              className="text-sm rounded-full border border-white/20 text-white/80 px-4 py-1.5 hover:border-white/40"
            >
              Import JSON
            </button>
            <button
              onClick={onExportAll}
              className="text-sm rounded-full border border-white/20 text-white/80 px-4 py-1.5 hover:border-white/40"
            >
              Export all
            </button>
          </div>
        </div>

        {showJson && (
          <div className="mb-6 rounded-xl bg-white/5 border border-white/10 p-4">
            <p className="text-sm text-white/60 mb-2">
              Paste one level object, or an array of level objects.
            </p>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={6}
              placeholder='{ "id": "...", "name": "...", "spawnTable": [...] }'
              className="w-full bg-black/40 border border-white/10 rounded p-2 font-mono text-xs"
            />
            {jsonError && (
              <div className="text-red-400 text-sm mt-2">{jsonError}</div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowJson(false);
                  setJsonText("");
                  setJsonError("");
                }}
                className="text-sm text-white/60 hover:text-white/90"
              >
                Cancel
              </button>
              <button
                onClick={onImport}
                className="text-sm rounded-full bg-white text-black px-4 py-1.5 hover:bg-white/90"
              >
                Import
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {sorted.map((l) => {
            const s = stats[l.id] ?? { plays: 0, likes: 0, best: 0 };
            return (
              <div
                key={l.id}
                className="rounded-xl bg-white/5 border border-white/10 p-4 hover:border-white/20 transition"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-medium">{l.name}</h2>
                      {l.builtIn && (
                        <span className="text-[10px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded">
                          built-in
                        </span>
                      )}
                    </div>
                    {l.description && (
                      <p className="text-white/60 text-sm mt-1">
                        {l.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/50 font-mono">
                      <span>▶ {s.plays} plays</span>
                      <span>♥ {s.likes}</span>
                      <span>best {s.best}</span>
                      <span>
                        speed {l.baseSpeed} · {l.spawnTable.length} kinds
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => onPlay(l.id)}
                      className="rounded-full bg-white text-black px-5 py-1.5 text-sm font-medium hover:bg-white/90"
                    >
                      Play
                    </button>
                    <button
                      onClick={() => onLike(l.id)}
                      className={`rounded-full text-xs px-3 py-1 border ${
                        s.likes
                          ? "bg-white/20 border-white/40 text-white"
                          : "border-white/10 text-white/60 hover:border-white/30"
                      }`}
                    >
                      {s.likes ? "♥ Liked" : "♡ Like"}
                    </button>
                    {!l.builtIn && (
                      <>
                        <button
                          onClick={() => onEdit(l.id)}
                          className="rounded-full text-xs px-3 py-1 border border-white/10 text-white/60 hover:border-white/30"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onExportOne(l)}
                          className="rounded-full text-xs px-3 py-1 border border-white/10 text-white/60 hover:border-white/30"
                        >
                          Export
                        </button>
                        <button
                          onClick={() => onDelete(l.id)}
                          className="rounded-full text-xs px-3 py-1 border border-red-500/30 text-red-400/80 hover:border-red-500/60"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-10 text-white/40 text-xs">
          Levels are stored locally in your browser. Use Export/Import to move
          them between devices or share with a friend.
        </footer>
      </div>
    </div>
  );
}
