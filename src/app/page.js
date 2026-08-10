"use client";

import { useCallback, useEffect, useState } from "react";
import Editor from "./game/Editor";
import Game from "./game/Game";
import Menu from "./game/Menu";
import NicknamePrompt from "./game/NicknamePrompt";
import { loadStats, recordBest, recordPlay } from "./game/levels";
import { getNickname } from "./game/player";
import { submitScore } from "./game/supabase";

export default function Home() {
  const [mode, setMode] = useState("menu"); // "menu" | "play" | "edit"
  // Full level object handed up from Menu — cloud levels aren't in LS, so we
  // can't look them up here by id alone. Menu already has the merged view.
  const [activeLevel, setActiveLevel] = useState(null);
  const [stats, setStats] = useState({});

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
      if (activeLevelId) {
        recordBest(activeLevelId, finalScore);
        setStats(loadStats());
        const nickname = getNickname();
        if (nickname && finalScore > 0) {
          submitScore(activeLevelId, nickname, finalScore).catch(() => {});
        }
      }
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
