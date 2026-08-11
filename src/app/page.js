"use client";

import { useCallback, useEffect, useState } from "react";
import Editor from "./game/Editor";
import Game from "./game/Game";
import Menu from "./game/Menu";
import NicknamePrompt from "./game/NicknamePrompt";
import { loadStats, recordBest, recordPlay } from "./game/levels";
import { getNickname } from "./game/player";
import { isConfigured, submitScore } from "./game/supabase";

export default function Home() {
  const [mode, setMode] = useState("menu"); // "menu" | "play" | "edit"
  // Full level object handed up from Menu — cloud levels aren't in LS, so we
  // can't look them up here by id alone. Menu already has the merged view.
  const [activeLevel, setActiveLevel] = useState(null);
  const [stats, setStats] = useState({});
  // Tracks the outcome of the most recent leaderboard submission so the HUD
  // can tell the player their score was posted (or why it wasn't).
  // null = no run finished yet; otherwise { state, score, nickname? }.
  const [submitInfo, setSubmitInfo] = useState(null);

  // Nickname gate: null on server render, then either "" (needs prompt) or
  // the saved name after the mount effect. Same string on server + client
  // keeps hydration happy.
  const [nickname, setNicknameState] = useState(null);
  useEffect(() => {
    setNicknameState(getNickname() || "");
  }, []);

  useEffect(() => {
    setStats(loadStats());
  }, []);

  const activeLevelId = activeLevel?.id ?? null;
  const activeBest = activeLevelId ? stats[activeLevelId]?.best ?? 0 : 0;

  const handlePlay = useCallback((level) => {
    setActiveLevel(level);
    recordPlay(level.id);
    setSubmitInfo(null);
    setMode("play");
  }, []);

  const handleEdit = useCallback((level) => {
    setActiveLevel(level);
    setMode("edit");
  }, []);

  const handleExit = useCallback(() => {
    setMode("menu");
    setStats(loadStats());
  }, []);

  const handleGameOver = useCallback(
    (finalScore) => {
      if (!activeLevelId) return;
      recordBest(activeLevelId, finalScore);
      setStats(loadStats());
      const nickname = getNickname();
      if (!isConfigured()) {
        setSubmitInfo({ state: "offline", score: finalScore });
        return;
      }
      if (!nickname) {
        setSubmitInfo({ state: "no-nickname", score: finalScore });
        return;
      }
      setSubmitInfo({ state: "submitting", score: finalScore, nickname });
      submitScore(activeLevelId, nickname, finalScore)
        .then(() =>
          setSubmitInfo({ state: "ok", score: finalScore, nickname })
        )
        .catch(() =>
          setSubmitInfo({ state: "error", score: finalScore, nickname })
        );
    },
    [activeLevelId]
  );

  const handleSaveEdit = useCallback(() => {
    setStats(loadStats());
  }, []);

  // Nickname prompt takes precedence over everything else. `nickname === null`
  // = still loading from localStorage (server render / first mount). `""`
  // = definitely no saved name, show the prompt.
  if (nickname === "") {
    return (
      <NicknamePrompt
        onDone={(name) => setNicknameState(name)}
      />
    );
  }

  if (mode === "play" && activeLevel) {
    return (
      <Game
        level={activeLevel}
        best={activeBest}
        onGameOver={handleGameOver}
        onExit={handleExit}
        submitInfo={submitInfo}
      />
    );
  }

  if (mode === "edit" && activeLevelId) {
    return (
      <Editor
        levelId={activeLevelId}
        onBack={handleExit}
        onSave={handleSaveEdit}
        onPlay={handlePlay}
      />
    );
  }

  return <Menu onPlay={handlePlay} onEdit={handleEdit} />;
}
