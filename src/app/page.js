"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Editor from "./game/Editor";
import Game from "./game/Game";
import Menu from "./game/Menu";
import {
  getAllLevels,
  loadStats,
  recordBest,
  recordPlay,
} from "./game/levels";

export default function Home() {
  const [mode, setMode] = useState("menu"); // "menu" | "play" | "edit"
  const [activeLevelId, setActiveLevelId] = useState(null);
  const [levelsVersion, setLevelsVersion] = useState(0);
  const [stats, setStats] = useState({});

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
      }
    },
    [activeLevelId]
  );

  const handleSaveEdit = useCallback(() => {
    setLevelsVersion((n) => n + 1);
  }, []);

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
