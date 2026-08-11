"use client";

import { useEffect, useState } from "react";
import {
  subscribeMute,
  toggleMusicMuted,
  toggleSfxMuted,
} from "./audio";
import { setControlScheme, useSettings } from "./settings";

export default function HUD({
  levelName,
  score,
  best,
  status,
  crashKind,
  submitInfo,
  onRestart,
  onExit,
  onLeft,
  onRight,
  onJump,
}) {
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const useButtons = settings.controlScheme === "buttons";
  const isFired = crashKind === "personboss";
  const submitText = (() => {
    if (!submitInfo) return null;
    switch (submitInfo.state) {
      case "submitting":
        return "Submitting to leaderboard…";
      case "ok":
        return `Score submitted to leaderboard as ${submitInfo.nickname}.`;
      case "error":
        return "Couldn't submit score — check your connection.";
      case "no-nickname":
        return "Set a nickname to appear on the leaderboard.";
      case "offline":
        return "Leaderboard offline — score saved locally.";
      case "voided":
        return "Run voided — the boss cost you everything.";
      default:
        return null;
    }
  })();
  const [mute, setMute] = useState({ sfx: false, music: false });
  useEffect(() => subscribeMute(setMute), []);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="flex justify-between items-center px-3 py-2 md:p-4 text-white/90 font-mono text-sm md:text-base drop-shadow gap-2 md:gap-4">
        <div className="flex flex-col min-w-0">
          <div className="hidden md:block text-white/60 text-xs uppercase tracking-wider">
            Level
          </div>
          <div className="truncate max-w-[110px] sm:max-w-[180px] md:max-w-[220px] text-xs md:text-base">
            {levelName}
          </div>
        </div>
        <div className="flex gap-2 md:gap-6 items-center min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2">
            <img
              src="/reactor.png"
              alt=""
              className="w-6 h-6 md:w-10 md:h-10 drop-shadow"
            />
            <div className="text-2xl md:text-5xl font-bold tabular-nums drop-shadow leading-none">
              {score}
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-white/60 text-xs uppercase tracking-wider">
              Best
            </div>
            <div className="text-lg md:text-xl tabular-nums">{best}</div>
          </div>
          <div className="flex gap-1 md:gap-1.5 pointer-events-auto">
            <button
              onClick={toggleMusicMuted}
              className={
                "text-[11px] md:text-xs rounded px-1.5 md:px-2 py-1 border " +
                (mute.music
                  ? "border-white/20 text-white/50"
                  : "border-cyan-400/40 text-cyan-200 bg-cyan-500/10")
              }
              title="Music"
            >
              🎵
            </button>
            <button
              onClick={toggleSfxMuted}
              className={
                "text-[11px] md:text-xs rounded px-1.5 md:px-2 py-1 border " +
                (mute.sfx
                  ? "border-white/20 text-white/50"
                  : "border-amber-400/40 text-amber-200 bg-amber-500/10")
              }
              title="Sound effects"
            >
              🔊
            </button>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className={
                "text-[11px] md:text-xs rounded px-1.5 md:px-2 py-1 border " +
                (settingsOpen
                  ? "border-white/60 text-white bg-white/10"
                  : "border-white/20 text-white/70 hover:text-white/90")
              }
              title="Settings"
            >
              ⚙︎
            </button>
            <button
              onClick={onExit}
              className="text-[11px] md:text-xs uppercase tracking-wider text-white/60 hover:text-white/90 border border-white/20 rounded px-1.5 md:px-2 py-1"
              title="Menu"
            >
              <span className="hidden md:inline">Menu (Esc)</span>
              <span className="md:hidden">✕</span>
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="pointer-events-auto absolute right-4 top-16 z-20 rounded-xl bg-neutral-900/95 border border-white/15 p-4 w-64 text-white shadow-xl">
          <div className="text-xs uppercase tracking-wider text-white/50 mb-2">
            Mobile controls
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setControlScheme("swipe")}
              className={
                "rounded-md text-sm px-3 py-2 border " +
                (!useButtons
                  ? "bg-white text-black border-white"
                  : "border-white/20 text-white/80 hover:border-white/40")
              }
            >
              Swipe
            </button>
            <button
              onClick={() => setControlScheme("buttons")}
              className={
                "rounded-md text-sm px-3 py-2 border " +
                (useButtons
                  ? "bg-white text-black border-white"
                  : "border-white/20 text-white/80 hover:border-white/40")
              }
            >
              Buttons
            </button>
          </div>
          <p className="text-white/50 text-xs mt-2">
            Keyboard controls always work.
          </p>
        </div>
      )}

      <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/50">
        <span className="hidden sm:inline">
          <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">←</kbd>
          /
          <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">→</kbd>
          switch tracks &nbsp;·&nbsp;
          <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">Space</kbd>
          jump
        </span>
        <span className="sm:hidden">
          {useButtons
            ? "use the on-screen buttons"
            : "swipe to switch · tap to jump"}
        </span>
      </div>

      {useButtons && status !== "over" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-between px-4 sm:hidden">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onLeft?.();
            }}
            className="pointer-events-auto w-20 h-20 rounded-full bg-white/15 border border-white/25 text-white text-3xl font-bold active:bg-white/30 backdrop-blur-sm flex items-center justify-center leading-none"
            aria-label="Left"
          >
            ←
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onJump?.();
            }}
            className="pointer-events-auto w-20 h-20 rounded-full bg-cyan-500/25 border border-cyan-300/50 text-white text-lg font-semibold active:bg-cyan-500/45 backdrop-blur-sm"
            aria-label="Jump"
          >
            JUMP
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onRight?.();
            }}
            className="pointer-events-auto w-20 h-20 rounded-full bg-white/15 border border-white/25 text-white text-3xl font-bold active:bg-white/30 backdrop-blur-sm flex items-center justify-center leading-none"
            aria-label="Right"
          >
            →
          </button>
        </div>
      )}

      {status === "over" && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-center px-6">
            <h2
              className={
                "font-semibold mb-1 " +
                (isFired
                  ? "text-6xl text-red-500 tracking-wider"
                  : "text-3xl")
              }
            >
              {isFired ? "FIRED" : "Crashed!"}
            </h2>
            <p className="text-white/70 mb-2">
              {isFired ? "The boss got you. " : null}Score: {score}
            </p>
            {submitText && (
              <p
                className={
                  "mb-6 text-sm " +
                  (submitInfo?.state === "ok"
                    ? "text-emerald-300"
                    : submitInfo?.state === "error" ||
                      submitInfo?.state === "voided"
                    ? "text-red-300"
                    : "text-white/50")
                }
              >
                {submitText}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={onRestart}
                className="rounded-full bg-white text-black px-8 py-3 font-medium hover:bg-white/90 transition"
              >
                Play again
              </button>
              <button
                onClick={onExit}
                className="rounded-full bg-white/10 text-white px-8 py-3 font-medium hover:bg-white/20 transition"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
