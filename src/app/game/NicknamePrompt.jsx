"use client";

import { useEffect, useState } from "react";
import { setNickname } from "./player";
import { registerNickname } from "./supabase";

// Full-screen overlay shown on first visit (or after nickname reset).
// Blocks the rest of the UI until the player picks a handle. Nicknames are
// unique across all players — we ask the DB before saving.
export default function NicknamePrompt({ onDone }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = document.getElementById("nickname-input");
    if (el) el.focus();
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    const clean = name.trim();
    if (clean.length < 2) {
      setError("Pick at least 2 characters.");
      return;
    }
    if (clean.length > 24) {
      setError("Max 24 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await registerNickname(clean);
    setBusy(false);
    if (!result.ok && result.reason === "taken") {
      setError(`"${clean}" is already taken. Pick another.`);
      return;
    }
    setNickname(clean);
    onDone?.(clean);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950 flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-8 shadow-2xl"
      >
        <h1 className="text-4xl font-semibold tracking-tight mb-2">
          Welcome to Tomicart
        </h1>
        <p className="text-white/60 text-sm mb-6">
          Pick a nickname. It gets stamped on levels you build and the
          scores you post. Each nickname can be claimed by one player only.
        </p>
        <label className="block">
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
            Nickname
          </div>
          <input
            id="nickname-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            placeholder="e.g. adrian"
            maxLength={24}
            disabled={busy}
            className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-lg focus:outline-none focus:border-cyan-400/60 disabled:opacity-60"
          />
        </label>
        {error && (
          <div className="mt-2 text-sm text-red-400">{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-white text-black py-3 font-medium hover:bg-white/90 transition disabled:opacity-60"
        >
          {busy ? "Checking…" : "Let's go"}
        </button>
        <p className="text-[11px] text-white/40 mt-4">
          Stored locally on this browser. Nickname uniqueness is checked
          against the server.
        </p>
      </form>
    </div>
  );
}
