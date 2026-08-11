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
  loadStats,
  makeEmptyLevel,
  sortLevels,
  toggleLike,
  upsertCustomLevel,
} from "./levels";
import { getNickname } from "./player";
import {
  deleteCloudLevel,
  fetchCloudLevels,
  fetchLeaderboard,
  fetchTopScores,
  isConfigured,
  toggleLikeCloud,
  upsertCloudLevel,
} from "./supabase";

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
  const [topScores, setTopScores] = useState({}); // { levelId: {nickname, score} }
  const [myNickname, setMyNickname] = useState("");
  const [sortBy, setSortBy] = useState("plays");
  // Per-level expanded leaderboard: { [levelId]: { loading, rows } }
  const [boards, setBoards] = useState({});

  const toggleBoard = (id) => {
    setBoards((cur) => {
      if (cur[id]) {
        const { [id]: _, ...rest } = cur;
        return rest;
      }
      return { ...cur, [id]: { loading: true, rows: [] } };
    });
    if (!boards[id] && isConfigured()) {
      fetchLeaderboard(id, 10).then((rows) => {
        setBoards((cur) =>
          cur[id] ? { ...cur, [id]: { loading: false, rows } } : cur
        );
      });
    }
  };

  // Local list is instant. Cloud list + top scores arrive async and get
  // merged in (deduped by id) so shared levels and their high-scorers
  // appear alongside your local ones.
  const refresh = () => {
    const localLevels = getAllLevels();
    setLevels(localLevels);
    setStats(loadStats());
    if (isConfigured()) {
      fetchCloudLevels().then((cloud) => {
        setLevels((current) => {
          const byId = new Map(current.map((l) => [l.id, l]));
          for (const cl of cloud) byId.set(cl.id, cl);
          return Array.from(byId.values());
        });
        const ids = [
          ...new Set([...localLevels.map((l) => l.id), ...cloud.map((l) => l.id)]),
        ];
        fetchTopScores(ids).then(setTopScores);
      });
    }
  };

  useEffect(() => {
    refresh();
    setMyNickname(getNickname() || "");
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
    const nickname = getNickname() || "anon";
    const level = { ...makeEmptyLevel("Untitled level"), author: nickname };
    upsertCustomLevel(level);
    upsertCloudLevel(level, nickname);
    refresh();
    onEdit(level);
  };

  const onDelete = (id) => {
    if (!confirm("Delete this level?")) return;
    deleteCustomLevel(id);
    deleteCloudLevel(id);
    refresh();
  };

  const onLike = (id) => {
    toggleLike(id);
    setStats(loadStats());
    const nickname = getNickname();
    if (nickname) toggleLikeCloud(id, nickname).then(() => refresh());
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
              or swipe to switch &nbsp;·&nbsp;
              <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">
                Space
              </kbd>
              or tap to jump
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
          <div className="ml-auto hidden sm:flex gap-2">
            <button
              onClick={onCreate}
              className="text-sm rounded-full bg-white text-black px-4 py-1.5 hover:bg-white/90"
            >
              + New level
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          {sorted.map((l) => {
            const s = stats[l.id] ?? { plays: 0, likes: 0, best: 0 };
            const top = topScores[l.id];
            const author = l.builtIn ? "built-in" : l.author || "anon";
            // Ownership: you can edit / delete a level only if it carries
            // your nickname as author. Legacy levels with no author (older
            // client, imported json) stay editable so people can adopt them.
            const isOwner =
              !l.builtIn && (!l.author || l.author === myNickname);
            return (
              <div
                key={l.id}
                className="rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 p-5 hover:border-cyan-400/30 hover:from-white/[0.08] transition"
              >
                <div className="flex items-start gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {l.name}
                      </h2>
                      <span
                        className={
                          "text-[11px] " +
                          (l.builtIn
                            ? "px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
                            : "text-white/50")
                        }
                      >
                        {l.builtIn ? "BUILT-IN" : `by ${author}`}
                      </span>
                    </div>
                    {l.description && (
                      <p className="text-white/60 text-sm mt-1.5">
                        {l.description}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center gap-2 rounded-lg bg-black/30 border border-white/10 px-3 py-1.5">
                        <span className="text-amber-300">🏆</span>
                        {top ? (
                          <>
                            <span className="font-bold tabular-nums">
                              {top.score}
                            </span>
                            <span className="text-white/50 text-sm">
                              by{" "}
                              <span className="text-white/80">
                                {top.nickname}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="text-white/40 text-sm">
                            no high score yet
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-white/40">
                        ▶ {s.plays} · ♥ {s.likes}
                      </span>
                      <button
                        onClick={() => toggleBoard(l.id)}
                        className="text-xs rounded-full px-3 py-1 border border-white/10 text-white/70 hover:border-white/30"
                      >
                        {boards[l.id] ? "Hide scores" : "Scoreboard"}
                      </button>
                    </div>

                    {boards[l.id] && (
                      <div className="mt-3 rounded-lg bg-black/30 border border-white/10 p-3">
                        {boards[l.id].loading ? (
                          <div className="text-white/50 text-sm">Loading…</div>
                        ) : boards[l.id].rows.length === 0 ? (
                          <div className="text-white/50 text-sm">
                            No scores yet — be the first.
                          </div>
                        ) : (
                          <ol className="text-sm space-y-1">
                            {boards[l.id].rows.map((r, i) => (
                              <li
                                key={`${r.player_nickname}-${r.created_at}`}
                                className="flex items-baseline gap-3"
                              >
                                <span className="text-white/40 tabular-nums w-5 text-right">
                                  {i + 1}.
                                </span>
                                <span className="text-white/90 truncate">
                                  {r.player_nickname}
                                </span>
                                <span className="ml-auto font-bold tabular-nums">
                                  {r.score}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => onPlay(l)}
                      className="rounded-full bg-white text-black px-6 py-2 text-sm font-semibold hover:bg-white/90 shadow-sm"
                    >
                      Play
                    </button>
                    <button
                      onClick={() => onLike(l.id)}
                      className={`rounded-full text-xs px-3 py-1 border transition ${
                        s.likes
                          ? "bg-pink-500/15 border-pink-400/40 text-pink-200"
                          : "border-white/10 text-white/60 hover:border-white/30"
                      }`}
                    >
                      {s.likes ? "♥ Liked" : "♡ Like"}
                    </button>
                    {isOwner && (
                      <>
                        <button
                          onClick={() => onEdit(l)}
                          className="rounded-full text-xs px-3 py-1 border border-white/10 text-white/60 hover:border-white/30"
                        >
                          Edit
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
          Levels and high scores sync across everyone playing Tomicart.
        </footer>
      </div>
    </div>
  );
}
