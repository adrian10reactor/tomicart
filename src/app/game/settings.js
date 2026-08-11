"use client";

import { useEffect, useState } from "react";

const KEY = "tomicart_settings_v1";
const DEFAULTS = { controlScheme: "swipe" }; // "swipe" | "buttons"

let cached = null;
const listeners = new Set();

function read() {
  if (typeof window === "undefined") return { ...DEFAULTS };
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

function write(next) {
  cached = { ...cached, ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {}
  for (const fn of listeners) fn(cached);
}

export function getSettings() {
  return read();
}

export function setControlScheme(scheme) {
  read();
  write({ controlScheme: scheme === "buttons" ? "buttons" : "swipe" });
}

export function subscribeSettings(fn) {
  read();
  listeners.add(fn);
  fn(cached);
  return () => listeners.delete(fn);
}

// Convenience React hook.
export function useSettings() {
  const [s, setS] = useState(() => read());
  useEffect(() => subscribeSettings(setS), []);
  return s;
}
