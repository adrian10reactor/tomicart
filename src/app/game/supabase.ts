"use client";

import { normalizeLevel } from "./levels";

// Supabase client. Kept as an optional dependency — if the env vars aren't
// set (e.g. local dev without a project, or previews), every export gracefully
// no-ops so the app still runs on localStorage alone. Once you paste the
// URL + anon key into .env.local and Vercel env, the shared-levels /
// scoreboards features light up.

let clientPromise = null;

async function getClient() {
  if (clientPromise) return clientPromise;
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false },
    })
  );
  return clientPromise;
}

export function isConfigured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// --- Players / nicknames ---

// Returns { taken: boolean } when Supabase is configured, or { taken: false,
// offline: true } when we couldn't reach it (env not set / network error).
// Case-insensitive — the DB has a unique index on lower(nickname).
export async function isNicknameTaken(nickname) {
  const c = await getClient();
  if (!c) return { taken: false, offline: true };
  const clean = String(nickname || "").trim();
  if (!clean) return { taken: false };
  const { data, error } = await c
    .from("players")
    .select("nickname")
    .ilike("nickname", clean)
    .limit(1);
  if (error) return { taken: false, offline: true };
  return { taken: (data || []).length > 0 };
}

// Attempts to claim a nickname. Returns { ok: true } on success,
// { ok: false, reason: "taken" } on conflict, { ok: true, offline: true }
// when Supabase isn't reachable (falls back to local-only usage).
export async function registerNickname(nickname) {
  const c = await getClient();
  if (!c) return { ok: true, offline: true };
  const clean = String(nickname || "").trim();
  if (!clean) return { ok: false, reason: "empty" };
  const { error } = await c.from("players").insert({ nickname: clean });
  if (!error) return { ok: true };
  // 23505 = unique_violation
  if (error.code === "23505") return { ok: false, reason: "taken" };
  return { ok: true, offline: true };
}

// --- Levels ---
export async function fetchCloudLevels() {
  const c = await getClient();
  if (!c) return [];
  const { data, error } = await c
    .from("levels")
    .select("id, data, author_nickname, plays, likes, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data || []).map((row) => {
    // normalizeLevel enforces the y-slope cap, seam continuity, laneDeltas
    // shape, etc. Skip it and steep/malformed cloud levels flip the spline
    // frame at runtime (upside-down camera).
    const normalized = normalizeLevel({ ...row.data, id: row.id });
    return {
      ...normalized,
      author: row.author_nickname,
      _cloud: { plays: row.plays, likes: row.likes, createdAt: row.created_at },
    };
  });
}

export async function upsertCloudLevel(level, nickname) {
  const c = await getClient();
  if (!c) return;
  await c.from("levels").upsert({
    id: level.id,
    data: level,
    author_nickname: nickname,
  });
}

export async function deleteCloudLevel(id) {
  const c = await getClient();
  if (!c) return;
  await c.from("levels").delete().eq("id", id);
}

// --- Scores ---
export async function submitScore(levelId, nickname, score) {
  const c = await getClient();
  if (!c) return;
  const { error } = await c.from("scores").insert({
    level_id: levelId,
    player_nickname: nickname,
    score,
  });
  if (error) console.error("[supabase] submitScore failed:", error);
}

// Top score per level for a batch of level ids. Returns
// { [levelId]: { nickname, score } }. Fetches up to `perLevel` most-recent
// scores per level then picks the max — cheap enough at our scale.
export async function fetchTopScores(levelIds) {
  const c = await getClient();
  if (!c || !levelIds || !levelIds.length) return {};
  const { data, error } = await c
    .from("scores")
    .select("level_id, player_nickname, score")
    .in("level_id", levelIds)
    .order("score", { ascending: false })
    .limit(2000);
  if (error) return {};
  const out = {};
  for (const row of data || []) {
    if (!out[row.level_id]) {
      out[row.level_id] = {
        nickname: row.player_nickname,
        score: row.score,
      };
    }
  }
  return out;
}

export async function fetchLeaderboard(levelId, limit = 10) {
  const c = await getClient();
  if (!c) return [];
  const { data, error } = await c
    .from("scores")
    .select("player_nickname, score, created_at")
    .eq("level_id", levelId)
    .order("score", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

// --- Likes ---
export async function toggleLikeCloud(levelId, nickname) {
  const c = await getClient();
  if (!c) return;
  // Try to delete first; if nothing was there, insert.
  const { data: existing } = await c
    .from("likes")
    .select("level_id")
    .eq("level_id", levelId)
    .eq("player_nickname", nickname)
    .maybeSingle();
  if (existing) {
    await c
      .from("likes")
      .delete()
      .eq("level_id", levelId)
      .eq("player_nickname", nickname);
  } else {
    await c.from("likes").insert({
      level_id: levelId,
      player_nickname: nickname,
    });
  }
}
