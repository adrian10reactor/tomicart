"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "./game/Editor";
import Game from "./game/Game";
import Menu from "./game/Menu";
import NicknamePrompt from "./game/NicknamePrompt";
import {
  getAllLevels,
  loadStats,
  recordBest,
  recordPlay,
} from "./game/levels";
import { getNickname } from "./game/player";
import { submitScore } from "./game/supabase";

export default function Home() {
  const [mode, setMode] = useState("menu"); // "menu" | "play" | "edit"
  const [activeLevelId, setActiveLevelId] = useState(null);
  const [levelsVersion, setLevelsVersion] = useState(0);
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
  }, [levelsVersion]);

  const levels = useMemo(() => getAllLevels(), [levelsVersion]);
  const activeLevel = useMemo(
    () => levels.find((l) => l.id === activeLevelId),
    [levels, activeLevelId]
  );
  const activeBest = activeLevelId
    ? stats[activeLevelId]?.best ?? 0
    : 0;

  const handlePlay = useCallback((id) => {
    setActiveLevelId(id);
    recordPlay(id);
    setMode("play");
  }, []);

  const handleEdit = useCallback((id) => {
    setActiveLevelId(id);
    setMode("edit");
  }, []);

  const handleExit = useCallback(() => {
    setMode("menu");
    setLevelsVersion((n) => n + 1);
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
    setLevelsVersion((n) => n + 1);
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
