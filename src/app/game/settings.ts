"use client";

import { useEffect, useState } from "react";

export type ControlScheme = "swipe" | "buttons";
export type Settings = { controlScheme: ControlScheme };
type SettingsListener = (s: Settings) => void;

const KEY = "tomicart_settings_v1";
const DEFAULTS: Settings = { controlScheme: "buttons" };

let cached: Settings | null = null;
const listeners = new Set<SettingsListener>();

function read(): Settings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached!;
}

function write(next: Partial<Settings>) {
  cached = { ...(cached ?? DEFAULTS), ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {}
  for (const fn of listeners) fn(cached);
}

export function getSettings(): Settings {
  return read();
}

export function setControlScheme(scheme: ControlScheme) {
  read();
  write({ controlScheme: scheme === "buttons" ? "buttons" : "swipe" });
}

export function subscribeSettings(fn: SettingsListener): () => void {
  read();
  listeners.add(fn);
  fn(cached!);
  return () => {
    listeners.delete(fn);
  };
}

export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(() => read());
  useEffect(() => subscribeSettings(setS), []);
  return s;
}
