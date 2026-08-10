"use client";

import { useEffect, useState } from "react";
import {
  subscribeMute,
  toggleMusicMuted,
  toggleSfxMuted,
} from "./audio";

export default function HUD({
  levelName,
  score,
  best,
  status,
  crashKind,
  onRestart,
  onExit,
}) {
  const isFired = crashKind === "personboss";
  const [mute, setMute] = useState({ sfx: false, music: false });
  useEffect(() => subscribeMute(setMute), []);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="flex justify-between p-4 text-white/90 font-mono text-sm md:text-base drop-shadow gap-4">
        <div className="flex flex-col">
          <div className="text-white/60 text-xs uppercase tracking-wider">
            Level
          </div>
          <div className="truncate max-w-[220px]">{levelName}</div>
        </div>
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <img
              src="/reactor.png"
              alt=""
              className="w-8 h-8 md:w-10 md:h-10 drop-shadow"
            />
            <div className="text-3xl md:text-5xl font-bold tabular-nums drop-shadow">
              {score}
            </div>
          </div>
          <div className="text-right">
            <div className="text-white/60 text-xs uppercase tracking-wider">
              Best
            </div>
            <div className="text-lg md:text-xl tabular-nums">{best}</div>
          </div>
          <div className="flex gap-1.5 pointer-events-auto">
            <button
              onClick={toggleMusicMuted}
              className={
                "text-xs rounded px-2 py-1 border " +
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
                "text-xs rounded px-2 py-1 border " +
                (mute.sfx
                  ? "border-white/20 text-white/50"
                  : "border-amber-400/40 text-amber-200 bg-amber-500/10")
              }
              title="Sound effects"
            >
              🔊
            </button>
            <button
              onClick={onExit}
              className="text-xs uppercase tracking-wider text-white/60 hover:text-white/90 border border-white/20 rounded px-2 py-1"
            >
              Menu (Esc)
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/50">
        <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">←</kbd>
        /
        <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">→</kbd>
        switch tracks &nbsp;·&nbsp;
        <kbd className="px-1.5 py-0.5 mx-1 rounded bg-white/10">Space</kbd>
        jump
      </div>

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
            <p className="text-white/70 mb-6">
              {isFired ? "The boss got you. " : null}Score: {score}
            </p>
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
