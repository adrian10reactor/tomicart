"use client";

// Player identity — a single nickname stored locally, used as the author
// on levels, the display name on the scoreboard, and the row id when we
// later sync to Supabase.

const NICKNAME_KEY = "tomica.nickname.v1";

export function getNickname() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(NICKNAME_KEY);
  } catch {
    return null;
  }
}

export function setNickname(name) {
  if (typeof window === "undefined") return;
  const clean = String(name || "").trim().slice(0, 24);
  if (!clean) return;
  try {
    window.localStorage.setItem(NICKNAME_KEY, clean);
  } catch {}
}

export function clearNickname() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NICKNAME_KEY);
  } catch {}
}
