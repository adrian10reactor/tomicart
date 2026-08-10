"use client";

// Music + train ambient use the real mp3 files in /public. Coin chime,
// crash, jump, hit stay synth (Web Audio).

// -------- Web Audio context for synth SFX --------
let ctx = null;
let masterGain = null;

function ensureCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// -------- File-backed music + train ambient --------
let musicEl = null;
let trainEl = null;
// Bumped from v1 so any previously-saved "music: on" gets discarded and
// the new default (music muted) takes effect.
const MUTE_KEY = "tomica.mute.v2";
// Music defaults to MUTED on first visit — nothing auto-plays without the
// user explicitly clicking the music toggle. SFX stays on by default.
function loadMuteState() {
  if (typeof window === "undefined") return { sfx: false, music: true };
  try {
    const raw = window.localStorage.getItem(MUTE_KEY);
    if (!raw) return { sfx: false, music: true };
    const parsed = JSON.parse(raw);
    return { sfx: !!parsed.sfx, music: !!parsed.music };
  } catch {
    return { sfx: false, music: true };
  }
}
function saveMuteState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MUTE_KEY,
      JSON.stringify({ sfx: sfxMuted, music: musicMuted })
    );
  } catch {}
}
const _saved = loadMuteState();
let sfxMuted = _saved.sfx;
let musicMuted = _saved.music;
const MUSIC_VOL = 0.18; // was way too loud
const TRAIN_VOL = 0.55;

const listeners = new Set();
function notify() {
  for (const cb of listeners) cb({ sfx: sfxMuted, music: musicMuted });
}
export function subscribeMute(cb) {
  listeners.add(cb);
  cb({ sfx: sfxMuted, music: musicMuted });
  return () => listeners.delete(cb);
}
export function isSfxMuted() {
  return sfxMuted;
}
export function isMusicMuted() {
  return musicMuted;
}
export function setSfxMuted(v) {
  sfxMuted = !!v;
  if (masterGain) masterGain.gain.value = sfxMuted ? 0 : 0.9;
  if (trainEl) trainEl.muted = sfxMuted;
  saveMuteState();
  notify();
}
export function setMusicMuted(v) {
  musicMuted = !!v;
  if (musicMuted) {
    // Fully stop the stream when muted.
    if (musicEl) {
      musicEl.muted = true;
      musicEl.pause();
    }
  } else {
    // Unmuting from a paused state must actually start playback — merely
    // clearing the muted flag on an already-paused element does nothing.
    const m = ensureMusicEl();
    if (m) {
      m.muted = false;
      m.play().catch(() => {});
    }
  }
  saveMuteState();
  notify();
}
export function toggleSfxMuted() {
  setSfxMuted(!sfxMuted);
}
export function toggleMusicMuted() {
  setMusicMuted(!musicMuted);
}

function ensureMusicEl() {
  if (typeof window === "undefined") return null;
  if (!musicEl) {
    musicEl = new Audio("/music.mp3");
    musicEl.loop = true;
    musicEl.volume = MUSIC_VOL;
    musicEl.muted = musicMuted;
    musicEl.preload = "auto";
  }
  return musicEl;
}

function ensureTrainEl() {
  if (typeof window === "undefined") return null;
  if (!trainEl) {
    trainEl = new Audio("/train.mp3");
    trainEl.loop = true;
    trainEl.volume = TRAIN_VOL;
    trainEl.muted = sfxMuted;
    trainEl.preload = "auto";
  }
  return trainEl;
}

// Only unlocks the AudioContext for later use. Does NOT kick off any
// sfx — the train ambient is Game-only, and music is opt-in via startMusic
// (which itself respects the muted preference).
export function unlockAudio() {
  ensureCtx();
}

// -------- Coin pickup: LOUD two-note pluck --------
export function playCoinChime() {
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  const play = (freq, delay, dur = 0.18) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.24, now + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
    osc.connect(gain).connect(masterGain);
    osc.start(now + delay);
    osc.stop(now + delay + dur + 0.02);
  };
  play(1174, 0);
  play(1568, 0.06);
}

// -------- Jump: quick upward whistle --------
export function playJump() {
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(780, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.24);
}

// -------- Hit: sharp thud used the moment you collide --------
export function playHit() {
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  // Filtered noise burst — quick and percussive.
  const bufSize = Math.floor(c.sampleRate * 0.18);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const env = Math.pow(1 - i / bufSize, 1.8);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 220;
  bp.Q.value = 0.9;
  const gain = c.createGain();
  gain.gain.value = 0.55;
  src.connect(bp).connect(gain).connect(masterGain);
  src.start(now);
}

// -------- Crash: low sine sweep (game over) --------
export function playCrash() {
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.55);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.65);
}

// -------- Music (mp3 loop) --------
export function startMusic() {
  // Respect the saved muted preference — don't autoplay if the user muted.
  if (musicMuted) return;
  const m = ensureMusicEl();
  if (m) m.play().catch(() => {});
}
export function stopMusic() {
  if (musicEl) musicEl.pause();
}

// Panic button — halt every mp3 element. Called on page unload.
export function stopAllAudio() {
  if (musicEl) {
    musicEl.pause();
    musicEl.currentTime = 0;
  }
  if (trainEl) {
    trainEl.pause();
    trainEl.currentTime = 0;
  }
}

// -------- Train ambient (mp3 loop, playbackRate scales w/ speed) --------
export function startTrainSfx() {
  const t = ensureTrainEl();
  if (t) t.play().catch(() => {});
}
export function stopTrainSfx() {
  if (trainEl) trainEl.pause();
}
export function setTrainSpeed(speed) {
  if (!trainEl) return;
  const s = Math.max(6, speed);
  trainEl.playbackRate = Math.min(1.9, 0.85 + (s - 14) * 0.03);
  trainEl.volume = Math.min(0.85, TRAIN_VOL + (s - 14) * 0.015);
}
